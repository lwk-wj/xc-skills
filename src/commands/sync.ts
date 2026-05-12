import fs from 'fs-extra'
import { join, basename, resolve } from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { getConfig } from './config.js'
import { execSync } from 'node:child_process'

export async function syncCommand(options: { dir: string }) {
  p.intro(`${pc.bgGreen(pc.black(' xc-skills sync '))}`)

  const config = await getConfig()
  if (!config.repoPath) {
    p.log.error('未配置中央仓库路径。请先运行: xc-skills config --repo <path>')
    process.exit(1)
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
    p.outro('完成')
    return
  }

  p.log.message(`${pc.cyan('待同步清单 (Pending Sync List):')}`)
  uniquePendingSkills.forEach(s => {
    // 检查是否为软链接
    const isSymlink = fs.lstatSync(s.path).isSymbolicLink() || 
                     (fs.existsSync(join(s.path, 'SKILL.md')) && fs.lstatSync(join(s.path, 'SKILL.md')).isSymbolicLink());
    
    p.log.message(`  ${pc.green('●')} ${pc.bold(s.name)} ${isSymlink ? pc.yellow('[软链]') : pc.blue('[拷贝]')} ${pc.dim(s.path.replace(process.cwd(), '.'))}`)
  })

  const confirmAll = await p.confirm({
    message: `确认同步以上 ${uniquePendingSkills.length} 个技能到中央仓库？`,
    initialValue: true,
  })

  if (p.isCancel(confirmAll) || !confirmAll) {
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
  const repoPath = config.repoPath

  for (const skill of uniquePendingSkills) {
    s.start(`正在同步: ${skill.name}`)

    const sourceDir = skill.path
    const targetDir = join(repoPath, 'skills', skill.name)

    // 判定是否需要物理拷贝 (如果 SKILL.md 是软链，则认为不需要拷贝)
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
      } else {
        p.log.message(pc.dim(`  └─ [${skill.name}] 检测到软链接，跳过物理拷贝`))
      }

      // --- 以下步骤无论软链还是拷贝都要执行 ---
      
      // 1. Git Commit
      const version = parseLatestVersion(join(targetDir, 'EVOLUTION.md'))
      const commitMsg = `feat(${skill.name}): evolve to ${version || 'latest'}`

      try {
        execSync('git add .', { cwd: repoPath, stdio: 'pipe' })
        execSync(`git commit -m "${commitMsg}"`, { cwd: repoPath, stdio: 'pipe' })
      } catch (e: any) {
        const status = execSync('git status --porcelain', { cwd: repoPath }).toString()
        if (!status.trim()) {
          s.stop(pc.yellow(`${skill.name}: 内容无变化，已跳过`))
          await fs.remove(join(sourceDir, 'PENDING_SYNC.md'))
          continue
        }
      }

      // 2. 获取 Hash 并写回
      const hash = execSync('git rev-parse --short HEAD', { cwd: repoPath }).toString().trim()
      appendHashToEvolution(join(targetDir, 'EVOLUTION.md'), hash)

      // 3. 修正提交
      try {
        execSync('git add .', { cwd: repoPath, stdio: 'pipe' })
        execSync('git commit --amend --no-edit', { cwd: repoPath, stdio: 'pipe' })
      } catch (e) {}

      // 4. 打 Tag
      if (version) {
        const tagName = `${skill.name}@${version}`
        try {
          execSync(`git tag ${tagName}`, { cwd: repoPath, stdio: 'pipe' })
        } catch (e) {}
      }

      // 5. 更新索引
      try {
        execSync(`pnpm start index`, { cwd: repoPath, stdio: 'pipe' })
      } catch (e) {}

      // 6. 清理本地标记
      await fs.remove(join(sourceDir, 'PENDING_SYNC.md'))

      s.stop(`${pc.green('✔')} ${skill.name} ${version ? pc.dim(`${version}`) : ''} ${pc.dim(`[${hash}]`)}`)
    } catch (err: any) {
      s.stop(`同步失败: ${skill.name}`)
      p.log.error(err.message)
    }
  }

  p.outro(pc.green('全部同步任务已完成！'))
}
