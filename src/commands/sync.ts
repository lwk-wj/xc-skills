import fs from 'fs-extra'
import { join, basename } from 'node:path'
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
  s_search.stop(`扫描完成`)

  // 去重
  const uniquePendingSkills = Array.from(new Map(pendingSkills.map(s => [s.name, s])).values())

  if (uniquePendingSkills.length === 0) {
    p.log.info('没有发现待同步的进化技能（未找到 PENDING_SYNC.md）。')
    p.outro('完成')
    return
  }

  // --- 优化点：直接展示汇总清单并一次性确认 ---
  p.log.message(`${pc.cyan('待同步清单 (Pending Sync List):')}`)
  uniquePendingSkills.forEach(s => {
    p.log.message(`  ${pc.green('●')} ${pc.bold(s.name)} ${pc.dim('->')} ${pc.dim(s.path.replace(process.cwd(), '.'))}`)
  })

  const confirmAll = await p.confirm({
    message: `确认同步以上 ${uniquePendingSkills.length} 个技能到中央仓库？`,
    initialValue: true,
  })

  if (p.isCancel(confirmAll) || !confirmAll) {
    p.cancel('已取消同步')
    return
  }

  const s = p.spinner()

  for (const skill of uniquePendingSkills) {
    s.start(`正在同步: ${skill.name}`)

    const sourceDir = skill.path
    const targetDir = join(config.repoPath, 'skills', skill.name)

    try {
      // A. 在中央仓库执行 snapshot
      try {
        execSync(`pnpm start snapshot ${skill.name}`, { cwd: config.repoPath, stdio: 'pipe' })
      } catch (e) {
        // 如果失败尝试继续，可能中央仓库还没有该技能
      }

      // B. 复制文件
      const filesToSync = ['SKILL.md', 'EVOLUTION.md']
      for (const file of filesToSync) {
        const src = join(sourceDir, file)
        const dest = join(targetDir, file)
        if (await fs.pathExists(src)) {
          await fs.copy(src, dest)
        }
      }

      // C. 更新索引
      try {
        execSync(`pnpm start index`, { cwd: config.repoPath, stdio: 'pipe' })
      } catch (e) {}

      // D. 清理标记
      await fs.remove(join(sourceDir, 'PENDING_SYNC.md'))

      s.stop(`同步完成: ${skill.name}`)
    } catch (err: any) {
      s.stop(`同步失败: ${skill.name}`)
      p.log.error(err.message)
    }
  }

  p.outro(pc.green('全部同步任务已完成！'))
}
