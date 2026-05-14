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

    const searchDirs = ['.agents/skills', '.trae/skills', '.claude/skills', 'skills']

    for (const rel of searchDirs) {
      const p = join(startPath, rel)
      if (fs.existsSync(p)) {
        results.push(p)
      }
    }

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
  s.stop(`扫描完成，发现 ${localSkillPaths.length} 个潜在技能目录`)

  if (localSkillPaths.length === 0) {
    p.log.warn('未在当前项目中发现已安装的技能目录。')
    return
  }

  // 1. 汇总所有【包含 SKILL.md】的已安装技能（去重）
  const allInstalledSkillsMap = new Map<string, string[]>()

  for (const path of localSkillPaths) {
    const entries = (await fs.readdir(path, { withFileTypes: true }))
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))

    for (const entry of entries) {
      const sName = entry.name
      const skillFile = join(path, sName, 'SKILL.md')

      // 核心校验：只有包含 SKILL.md 的才认为是已安装的技能
      if (await fs.pathExists(skillFile)) {
        if (!allInstalledSkillsMap.has(sName)) {
          allInstalledSkillsMap.set(sName, [])
        }
        allInstalledSkillsMap.get(sName)!.push(path)
      }
    }
  }

  const skillNames = Array.from(allInstalledSkillsMap.keys())

  if (skillNames.length === 0) {
    p.log.warn('没有发现已安装的技能（未检测到 SKILL.md）。')
    return
  }

  // 2. 只问一次：选择要更新的技能
  const selectedNames = await p.multiselect({
    message: '选择要从中央仓库拉取更新的技能 (Pull latest version):',
    options: skillNames.map(name => ({ value: name, label: name })),
    initialValues: skillNames
  })

  if (p.isCancel(selectedNames) || (selectedNames as string[]).length === 0) {
    p.cancel('操作已取消')
    return
  }

  const s_pull = p.spinner()
  s_pull.start('正在连接中央仓库并拉取更新...')

  try {
    // @ts-ignore
    const { getSkillsRecursive } = await import('../utils.js')
    const repoSkills = await getSkillsRecursive(config.repoPath)

    // 3. 执行更新
    for (const name of selectedNames as string[]) {
      const targetPaths = allInstalledSkillsMap.get(name)!
      const skillInRepo = repoSkills.find(s => s.name === name)

      if (!skillInRepo) {
        p.log.warn(`中央仓库不存在技能: ${name}，已跳过。`)
        continue
      }

      for (const targetPath of targetPaths) {
        await installSkills({
          sourceDir: dirname(skillInRepo.path), // 传入该技能所在的父目录
          targetAgents: [{ name: 'Local', path: dirname(targetPath) }],
          selectedSkills: [name],
          scope: 'custom',
          method: 'copy',
          strategy: 'merge',
          customRoot: targetPath
        })
      }
    }
    s_pull.stop(pc.green('全部技能已同步至最新版本！'))
  } catch (err: any) {
    s_pull.stop(pc.red('拉取过程中发生错误'))
    console.error(err)
  }

  p.outro(pc.green('Pull 完成！'))
}
