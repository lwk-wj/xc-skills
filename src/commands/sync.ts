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
    if (depth > 10) return // 增加深度限制到 10
    if (!fs.existsSync(currentDir)) return

    let files: fs.Dirent[] = []
    try {
      files = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch (e) { return }

    // 检查当前目录下是否有 PENDING_SYNC.md
    if (files.some(f => f.name === 'PENDING_SYNC.md')) {
      pendingSkills.push({
        name: basename(currentDir),
        path: currentDir
      })
      // 注意：即使找到了也继续搜，防止同名技能安装在不同地方（虽然少见）
    }

    // 递归搜索子目录
    for (const file of files) {
      if (file.isDirectory() && !EXCLUDE_DIRS.includes(file.name)) {
        scan(join(currentDir, file.name), depth + 1)
      }
    }
  }

  const s_search = p.spinner()
  s_search.start('正在全量扫描待同步的技能...')
  scan(process.cwd())
  s_search.stop(`扫描完成，发现 ${pendingSkills.length} 个待同步技能`)

  // 1. 去重 (按名称)
  const uniquePendingSkills = Array.from(new Map(pendingSkills.map(s => [s.name, s])).values())

  if (uniquePendingSkills.length === 0) {
    p.log.info('没有发现待同步的进化技能（未找到 PENDING_SYNC.md）。')
    p.outro('完成')
    return
  }

  let selectedSkills = uniquePendingSkills

  if (uniquePendingSkills.length > 1) {
    const selected = await p.multiselect({
      message: `发现了 ${uniquePendingSkills.length} 个待同步技能，请选择要同步的项目:`,
      options: uniquePendingSkills.map(s => ({
        value: s,
        label: s.name,
        hint: s.path.replace(process.cwd(), '.')
      })),
      initialValues: uniquePendingSkills,
    })

    if (p.isCancel(selected)) {
      p.cancel('已取消同步')
      return
    }
    selectedSkills = selected as typeof uniquePendingSkills
  } else {
    const confirm = await p.confirm({
      message: `确定要同步技能 ${pc.cyan(uniquePendingSkills[0].name)} 吗？`,
      initialValue: true,
    })

    if (p.isCancel(confirm) || !confirm) {
      p.cancel('已取消同步')
      return
    }
  }

  const s = p.spinner()

  for (const skill of selectedSkills) {
    s.start(`正在同步: ${skill.name}`)

    const sourceDir = skill.path
    const targetDir = join(config.repoPath, 'skills', skill.name)

    try {
      // A. 在中央仓库执行 snapshot (备份旧版)
      try {
        execSync(`pnpm start snapshot ${skill.name}`, { cwd: config.repoPath, stdio: 'pipe' })
      } catch (e) {
        p.log.warn(`[${skill.name}] 自动快照失败，请确保中央仓库环境就绪。`)
      }

      // B. 复制文件 (SKILL.md, EVOLUTION.md)
      const filesToSync = ['SKILL.md', 'EVOLUTION.md']
      for (const file of filesToSync) {
        const src = join(sourceDir, file)
        const dest = join(targetDir, file)
        if (await fs.pathExists(src)) {
          await fs.copy(src, dest)
        }
      }

      // C. 运行中央仓库的 index 更新索引
      try {
        execSync(`pnpm start index`, { cwd: config.repoPath, stdio: 'pipe' })
      } catch (e) {}

      // D. 清理本地 PENDING_SYNC.md
      await fs.remove(join(sourceDir, 'PENDING_SYNC.md'))

      s.stop(`同步成功: ${skill.name}`)
    } catch (err: any) {
      s.stop(`同步失败: ${skill.name}`)
      p.log.error(err.message)
    }
  }

  p.outro(pc.green('同步完成！'))
  p.log.info(pc.dim(`提示：建议去中央仓库确认并提交 Git 变更。`))
}
