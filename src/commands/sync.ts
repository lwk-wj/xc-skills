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

  const projectSkillsDir = join(process.cwd(), options.dir)
  if (!await fs.pathExists(projectSkillsDir)) {
    p.log.error(`本地技能目录不存在: ${projectSkillsDir}`)
    process.exit(1)
  }

  // 1. 扫描带有 PENDING_SYNC.md 的技能
  const skillFolders = await fs.readdir(projectSkillsDir)
  const pendingSkills: string[] = []

  for (const folder of skillFolders) {
    const pendingFile = join(projectSkillsDir, folder, 'PENDING_SYNC.md')
    if (await fs.pathExists(pendingFile)) {
      pendingSkills.push(folder)
    }
  }

  if (pendingSkills.length === 0) {
    p.log.info('没有发现待同步的进化技能（未找到 PENDING_SYNC.md）。')
    p.outro('完成')
    return
  }

  p.log.message(pc.yellow(`发现 ${pendingSkills.length} 个待同步技能: ${pendingSkills.join(', ')}`))

  const confirm = await p.confirm({
    message: '确定要将这些进化后的技能同步至中央仓库吗？',
    initialValue: true,
  })

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('已取消同步')
    return
  }

  const s = p.spinner()

  for (const skillName of pendingSkills) {
    s.start(`正在同步: ${skillName}`)

    const sourceDir = join(projectSkillsDir, skillName)
    const targetDir = join(config.repoPath, 'skills', skillName)

    try {
      // A. 在中央仓库执行 snapshot (备份旧版)
      try {
        execSync(`pnpm start snapshot ${skillName}`, { cwd: config.repoPath, stdio: 'pipe' })
      } catch (e) {
        p.log.warn(`[${skillName}] 自动快照失败，请确保中央仓库环境就绪。`)
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

      s.stop(`同步成功: ${skillName}`)
    } catch (err: any) {
      s.stop(`同步失败: ${skillName}`)
      p.log.error(err.message)
    }
  }

  p.outro(pc.green('同步完成！'))
  p.log.info(pc.dim(`提示：建议去中央仓库确认并提交 Git 变更。`))
}
