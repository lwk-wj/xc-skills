import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs-extra'
import os from 'node:os'
import { join, resolve, basename, dirname } from 'node:path'
import { getConfig } from './config.js'
import { installSkills } from '../install.js'

export async function pullCommand(dirArg: string | undefined) {
  p.intro(`${pc.bgBlue(pc.black(' xc-skills pull '))}`)

  const config = await getConfig()
  let repoPath = config.repoPath
  const branch = config.defaultBranch || 'master'
  let isTempRepo = false
  const tempRepoPath = join(os.tmpdir(), `xc-skills-pull-repo-${Date.now()}`)

  if (!repoPath) {
    p.log.error('未配置中央仓库路径。请先运行: xc-skills config')
    process.exit(1)
  }

  // --- Git 同步逻辑：确保拿到的是云端最新代码 ---
  const isRemote = repoPath.startsWith('http') || repoPath.startsWith('git@')
  const { execSync } = await import('node:child_process')

  if (isRemote) {
    const s_clone = p.spinner()
    s_clone.start(`正在从远程仓库同步 [${branch}]...`)
    try {
      execSync(`git clone --depth 1 --branch ${branch} ${repoPath} ${tempRepoPath}`, {
        stdio: 'ignore',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      repoPath = tempRepoPath
      isTempRepo = true
      s_clone.stop(`远程同步完成 [${branch}]`)
    } catch (err: any) {
      s_clone.stop(pc.red('远程同步失败，请检查网络、分支名或权限'))
      process.exit(1)
    }
  } else {
    repoPath = resolve(repoPath)
    const s_resync = p.spinner()
    s_resync.start(`正在同步本地中央仓库 [${branch}]...`)
    try {
      execSync(`git fetch origin ${branch} && git reset --hard origin/${branch}`, {
        cwd: repoPath,
        stdio: 'ignore',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      s_resync.stop(`本地仓库已同步 [${branch}]`)
    } catch (e) {
      s_resync.stop(pc.yellow('本地同步跳过（可能尚未关联远程或网络原因）'))
    }
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
    if (isTempRepo) await fs.remove(tempRepoPath)
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
    if (isTempRepo) await fs.remove(tempRepoPath)
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
    if (isTempRepo) await fs.remove(tempRepoPath)
    return
  }

  const s_pull = p.spinner()
  s_pull.start('正在分析中央仓库并提取更新...')

  try {
    // @ts-ignore
    const { getSkillsRecursive } = await import('../utils.js')
    const repoSkills = await getSkillsRecursive(repoPath!)

    // 3. 执行更新
    for (const name of selectedNames as string[]) {
      const targetPaths = allInstalledSkillsMap.get(name)!
      const skillInRepo = repoSkills.find(s => s.name === name)

      if (!skillInRepo) {
        p.log.warn(`中央仓库不存在技能: ${name}，已跳过。`)
        continue
      }

      for (const targetPath of targetPaths) {
        // targetPath 通常是 .agents/skills 这种目录
        try {
          await installSkills({
            sourceDir: dirname(skillInRepo.path), 
            targetAgents: [{ name: 'Project', path: dirname(targetPath) }], // 指向 .agents 这一层
            selectedSkills: [name],
            scope: 'custom',
            method: 'copy',
            strategy: 'merge',
            customRoot: targetPath
          })
          p.log.success(`成功更新: ${pc.cyan(name)} -> ${pc.dim(targetPath)}`)
        } catch (innerErr: any) {
          p.log.error(`更新技能 ${name} 失败: ${innerErr.message}`)
        }
      }
    }
    s_pull.stop(pc.green('全部技能已同步至最新版本！'))
  } catch (err: any) {
    s_pull.stop(pc.red(`拉取失败: ${err.message}`))
    if (err.stderr) {
      console.error(pc.red('Git Error Output:'), err.stderr.toString())
    } else {
      console.error(err)
    }
  }

  if (isTempRepo) {
    await fs.remove(tempRepoPath)
  }

  p.outro(pc.green('Pull 完成！'))
}
