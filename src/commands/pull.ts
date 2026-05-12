import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs-extra'
import { join, resolve, basename, dirname } from 'node:path'
import { getConfig } from './config.js'
import { installSkills } from '../install.js'

export async function pullCommand(dirArg: string | undefined) {
  p.intro(`${pc.bgBlue(pc.black(' xc-skills pull '))}`)

  const config = await getConfig()
  if (!config.repoPath) {
    p.log.error('未配置中央仓库路径。请先运行: xc-skills config --repo <path>')
    process.exit(1)
  }

  /**
   * 递归寻找已安装技能的目录
   */
  function findInstalledPaths(startPath: string, depth = 0): string[] {
    const results: string[] = []
    if (depth > 5) return results

    const searchDirs = ['.agent/skills', '.agents/skills', '.trae/skills', '.claude/skills', 'skills']
    
    for (const rel of searchDirs) {
      const p = join(startPath, rel)
      if (fs.existsSync(p)) {
        results.push(p)
      }
    }

    // 如果没找到，尝试递归向下一层（处理 Monorepo 结构）
    if (results.length === 0) {
      const files = fs.readdirSync(startPath, { withFileTypes: true })
      for (const file of files) {
        if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
          results.push(...findInstalledPaths(join(startPath, file.name), depth + 1))
        }
      }
    }

    return Array.from(new Set(results))
  }

  const s = p.spinner()
  s.start('正在扫描本地已安装的技能...')
  const localSkillPaths = findInstalledPaths(process.cwd())
  s.stop(`扫描完成，发现 ${localSkillPaths.length} 个技能存放目录`)

  if (localSkillPaths.length === 0) {
    p.log.warn('未在当前项目中发现已安装的技能目录。')
    return
  }

  for (const localPath of localSkillPaths) {
    const installedSkills = (await fs.readdir(localPath, { withFileTypes: true }))
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)

    if (installedSkills.length === 0) continue

    p.log.message(`${pc.dim('目录:')} ${localPath.replace(process.cwd(), '.')}`)
    
    const selected = await p.multiselect({
      message: `选择要从中央仓库更新的技能:`,
      options: installedSkills.map(name => ({ value: name, label: name })),
      initialValues: installedSkills
    })

    if (p.isCancel(selected)) continue

    const s_pull = p.spinner()
    s_pull.start('正在拉取更新...')

    try {
      const centralSkillsPath = join(config.repoPath, 'skills')
      
      await installSkills({
        sourceDir: centralSkillsPath,
        targetAgents: [{ name: 'Local', path: dirname(localPath) }],
        selectedSkills: selected as string[],
        scope: 'custom',
        method: 'copy', // 默认使用物理拷贝，方便后续再次进化
        strategy: 'merge',
        customRoot: localPath
      })
      s_pull.stop('更新成功')
    } catch (err: any) {
      s_pull.stop(pc.red('更新失败'))
      p.log.error(err.message)
    }
  }

  p.outro(pc.green('全部拉取操作完成！'))
}
