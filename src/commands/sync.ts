import fs from 'fs-extra'
import { join, basename, resolve } from 'node:path'
import os from 'node:os'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { getConfig } from './config.js'
import { execSync } from 'node:child_process'

export async function syncCommand(options: { dir: string, repo?: string }) {
  p.intro(`${pc.bgGreen(pc.black(' xc-skills sync '))}`)

  const config = await getConfig()
  let repoPath = options.repo || config.repoPath
  let isTempRepo = false
  const tempRepoPath = join(os.tmpdir(), `xc-skills-sync-repo-${Date.now()}`)

  if (!repoPath) {
    p.log.error('未配置中央仓库路径。请使用 --repo <path/url> 或运行: xc-skills config --repo <path>')
    process.exit(1)
  }

  // 检测是否为远程 URL
  const isRemote = repoPath.startsWith('http') || repoPath.startsWith('git@')

  if (isRemote) {
    const s_clone = p.spinner()
    s_clone.start(`正在准备远程同步环境: ${pc.cyan(repoPath)}`)
    try {
      execSync(`git clone --depth 1 ${repoPath} ${tempRepoPath}`, { stdio: 'ignore' })
      repoPath = tempRepoPath
      isTempRepo = true
      s_clone.stop('远程环境准备就绪')
    } catch (err: any) {
      s_clone.stop(pc.red('远程仓库拉取失败'))
      p.log.error(err.message)
      process.exit(1)
    }
  } else {
    repoPath = resolve(process.cwd(), repoPath)
    if (!fs.existsSync(repoPath)) {
      p.log.error(`本地目标仓库路径不存在: ${repoPath}`)
      process.exit(1)
    }
  }

  // 1. 递归搜索所有 PENDING_SYNC.md
  const pendingSkills: { name: string, path: string }[] = []
  const EXCLUDE_DIRS = ['node_modules', '.git', 'dist']

  function scan(currentDir: string, depth = 0) {
    if (depth > 10) return
    if (!fs.existsSync(currentDir)) return

    let files: fs.Dirent[] = []
    try {
      files = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch (e) { return }

    if (files.some(f => f.name === 'PENDING_SYNC.md')) {
      pendingSkills.push({
        name: basename(currentDir),
        path: currentDir
      })
    }

    for (const file of files) {
      if (file.isDirectory() && !EXCLUDE_DIRS.includes(file.name)) {
        scan(join(currentDir, file.name), depth + 1)
      }
    }
  }

  const s_search = p.spinner()
  s_search.start('正在全量扫描待同步的技能...')
  scan(process.cwd())
  s_search.stop('扫描完成')

  const uniquePendingSkills = Array.from(new Map(pendingSkills.map(s => [s.name, s])).values())

  if (uniquePendingSkills.length === 0) {
    p.log.info('没有发现待同步的进化技能（未找到 PENDING_SYNC.md）。')
    if (isTempRepo) await fs.remove(tempRepoPath)
    p.outro('完成')
    return
  }

  p.log.message(`${pc.cyan('待同步清单 (Pending Sync List):')}`)
  uniquePendingSkills.forEach(s => {
    const isSymlink = fs.existsSync(s.path) && (fs.lstatSync(s.path).isSymbolicLink() || 
                     (fs.existsSync(join(s.path, 'SKILL.md')) && fs.lstatSync(join(s.path, 'SKILL.md')).isSymbolicLink()));
    
    p.log.message(`  ${pc.green('●')} ${pc.bold(s.name)} ${isSymlink ? pc.yellow('[软链]') : pc.blue('[拷贝]')} ${pc.dim(s.path.replace(process.cwd(), '.'))}`)
  })

  const confirmAll = await p.confirm({
    message: `确认同步以上 ${uniquePendingSkills.length} 个技能到目标仓库？`,
    initialValue: true,
  })

  if (p.isCancel(confirmAll) || !confirmAll) {
    if (isTempRepo) await fs.remove(tempRepoPath)
    p.cancel('已取消同步')
    return
  }

  function parseLatestVersion(evolutionPath: string): string | null {
    if (!fs.existsSync(evolutionPath)) return null
    const content = fs.readFileSync(evolutionPath, 'utf-8')
    const match = content.match(/^## (v[\d.]+)/m)
    return match ? match[1] : null
  }

  function appendHashToEvolution(evolutionPath: string, hash: string) {
    if (!fs.existsSync(evolutionPath)) return
    let content = fs.readFileSync(evolutionPath, 'utf-8')
    content = content.replace(
      /^(## v[\d.]+ — [\d-]+)(.*?)$/m,
      (match, prefix, rest) => {
        if (rest.includes('`')) return match
        return `${prefix} \`${hash}\``
      }
    )
    fs.writeFileSync(evolutionPath, content, 'utf-8')
  }

  const s = p.spinner()
  const finalRepoPath = repoPath!

  for (const skill of uniquePendingSkills) {
    s.start(`正在同步: ${skill.name}`)

    const sourceDir = skill.path
    const targetDir = join(finalRepoPath, 'skills', skill.name)

    const skillFile = join(sourceDir, 'SKILL.md')
    const needsCopy = fs.existsSync(skillFile) && !fs.lstatSync(skillFile).isSymbolicLink() && !fs.lstatSync(sourceDir).isSymbolicLink()

    try {
      if (needsCopy) {
        await fs.ensureDir(targetDir)
        const filesToSync = ['SKILL.md', 'EVOLUTION.md']
        for (const file of filesToSync) {
          const src = join(sourceDir, file)
          const dest = join(targetDir, file)
          if (await fs.pathExists(src)) {
            await fs.copy(src, dest)
          }
        }
      }

      // 1. Git Commit
      const version = parseLatestVersion(join(targetDir, 'EVOLUTION.md'))
      const commitMsg = `feat(${skill.name}): evolve to ${version || 'latest'}`

      try {
        execSync('git add .', { cwd: finalRepoPath, stdio: 'pipe' })
        execSync(`git commit -m "${commitMsg}"`, { cwd: finalRepoPath, stdio: 'pipe' })
      } catch (e: any) {
        const status = execSync('git status --porcelain', { cwd: finalRepoPath }).toString()
        if (!status.trim()) {
          s.stop(pc.yellow(`${skill.name}: 内容无变化，已跳过`))
          await fs.remove(join(sourceDir, 'PENDING_SYNC.md'))
          continue
        }
      }

      // 2. 获取 Hash 并写回
      const hash = execSync('git rev-parse --short HEAD', { cwd: finalRepoPath }).toString().trim()
      appendHashToEvolution(join(targetDir, 'EVOLUTION.md'), hash)

      // 3. 修正提交
      try {
        execSync('git add .', { cwd: finalRepoPath, stdio: 'pipe' })
        execSync('git commit --amend --no-edit', { cwd: finalRepoPath, stdio: 'pipe' })
      } catch (e) {}

      // 4. 打 Tag
      if (version) {
        const tagName = `${skill.name}@${version}`
        try {
          // 使用附注标签 (Annotated Tag)，确保能被 git push --follow-tags 识别
          execSync(`git tag -a ${tagName} -m "Version ${version} of ${skill.name}"`, { cwd: finalRepoPath, stdio: 'pipe' })
        } catch (e: any) {
          // 如果标签已存在，忽略错误
          if (!e.message.includes('already exists')) {
            p.log.warn(`无法创建标签 ${tagName}: ${e.message}`)
          }
        }
      }

      // 5. 更新索引
      try {
        execSync(`pnpm start index`, { cwd: finalRepoPath, stdio: 'pipe' })
      } catch (e) {}

      // 6. 清理本地标记
      await fs.remove(join(sourceDir, 'PENDING_SYNC.md'))

      s.stop(`${pc.green('✔')} ${skill.name} ${version ? pc.dim(`${version}`) : ''} ${pc.dim(`[${hash}]`)}`)
    } catch (err: any) {
      s.stop(`同步失败: ${skill.name}`)
      p.log.error(err.message)
    }
  }

  // --- 最后的 Push 操作 ---
  const s_push = p.spinner()
  s_push.start('正在推送到远程目标仓库...')
  try {
    execSync('git push --follow-tags', { cwd: finalRepoPath, stdio: 'pipe' })
    s_push.stop(pc.green('🚀 已成功同步并推送至仓库！'))
  } catch (e: any) {
    if (isRemote) {
      s_push.stop(pc.red('❌ 远程推送失败。'))
    } else {
      s_push.stop(pc.yellow('⚠️  本地同步成功，但推送远程失败。'))
    }
  }

  // 如果是临时目录，清理掉
  if (isTempRepo) {
    await fs.remove(tempRepoPath)
  }

  p.outro(pc.green('全部同步任务已完成！'))
}
