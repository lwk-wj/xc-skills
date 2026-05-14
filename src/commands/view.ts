import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs-extra'
import { join } from 'node:path'
import { getConfig } from './config.js'
import { execSync } from 'node:child_process'

interface VersionEntry {
  version: string
  date: string
  hash: string | null
  reason: string
}

/**
 * 从 EVOLUTION.md 解析所有版本条目
 */
function parseEvolution(content: string): VersionEntry[] {
  const entries: VersionEntry[] = []
  const blocks = content.split(/^(?=## v)/m)

  for (const block of blocks) {
    const headerMatch = block.match(/^##\s*(v[\d.]+)\s*—\s*(\d{4}-\d{2}-\d{2})\s*(?:`([a-f0-9]+)`)?/m)
    if (!headerMatch) continue

    const reasonMatch = block.match(/\*\*触发原因\*\*[：:]\s*(.+)/m)

    entries.push({
      version: headerMatch[1],
      date: headerMatch[2],
      hash: headerMatch[3] || null,
      reason: reasonMatch ? reasonMatch[1].trim() : '无描述'
    })
  }

  return entries
}

export async function viewCommand(skillArg: string | undefined) {
  p.intro(`${pc.bgCyan(pc.black(' xc-skills view '))}`)

  const config = await getConfig()
  if (!config.repoPath) {
    p.log.error('未配置中央仓库路径。请先运行: xc-skills config --repo <path>')
    process.exit(1)
  }

  if (!skillArg) {
    p.log.error('请指定技能名称。用法: xc-skills view <skill-name> 或 xc-skills view <skill-name>@<hash>')
    process.exit(1)
  }

  // 解析参数：支持 use-icon 或 use-icon@abc1234
  let skillName = skillArg
  let targetHash: string | null = null

  if (skillArg.includes('@')) {
    const parts = skillArg.split('@')
    skillName = parts[0]
    targetHash = parts[1]
  }

  // 解析进化历史
  const s_scan = p.spinner()
  s_scan.start('正在定位技能路径...')
  // @ts-ignore
  const { getSkillsRecursive } = await import('../utils.js')
  const repoSkills = await getSkillsRecursive(config.repoPath)
  const skillInRepo = repoSkills.find(s => s.name === skillName)

  if (!skillInRepo) {
    s_scan.stop(pc.red('定位失败'))
    p.log.error(`技能 "${skillName}" 在中央仓库中不存在。`)
    process.exit(1)
  }
  s_scan.stop(`已找到技能: ${pc.dim(skillInRepo.path.replace(config.repoPath, ''))}`)

  const skillDir = skillInRepo.path
  const evolutionPath = join(skillDir, 'EVOLUTION.md')

  // 解析进化历史
  const evolutionContent = fs.existsSync(evolutionPath)
    ? fs.readFileSync(evolutionPath, 'utf-8')
    : ''
  const versions = parseEvolution(evolutionContent)

  // 计算相对于仓库根目录的路径，用于 git show
  const relativeSkillPath = skillInRepo.path.replace(config.repoPath, '').replace(/^[/\\]/, '')
  const relativeMdPath = join(relativeSkillPath, 'SKILL.md')

  // 如果直接指定了 hash，跳过选择
  if (targetHash) {
    showVersionContent(config.repoPath, relativeMdPath, targetHash)
    return
  }

  // 展示版本列表
  if (versions.length === 0) {
    p.log.warn(`技能 "${skillName}" 没有进化记录。`)
    // 直接展示当前版本
    const currentContent = fs.readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')
    p.log.message(pc.dim('─'.repeat(60)))
    p.log.message(currentContent)
    p.log.message(pc.dim('─'.repeat(60)))
    p.outro('当前版本')
    return
  }

  // 构建选择列表
  const options = [
    { value: 'current', label: `📌 当前版本`, hint: '最新' },
    ...versions
      .filter(v => v.hash) // 只展示有 hash 的版本（已同步的）
      .map(v => ({
        value: v.hash!,
        label: `${v.version} — ${v.date}`,
        hint: `${v.hash} | ${v.reason.slice(0, 30)}`
      }))
  ]

  if (options.length <= 1) {
    // 只有当前版本，没有历史 hash
    p.log.info('该技能尚无历史 Hash 记录，展示当前版本：')
    const currentContent = fs.readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')
    p.log.message(pc.dim('─'.repeat(60)))
    p.log.message(currentContent)
    p.log.message(pc.dim('─'.repeat(60)))
    p.outro('当前版本')
    return
  }

  const selected = await p.select({
    message: `选择要查看的 ${pc.cyan(skillName)} 版本:`,
    options
  })

  if (p.isCancel(selected)) {
    p.cancel('已取消')
    return
  }

  if (selected === 'current') {
    const currentContent = fs.readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')
    p.log.message(pc.dim('─'.repeat(60)))
    p.log.message(currentContent)
    p.log.message(pc.dim('─'.repeat(60)))
    p.outro('当前版本')
  } else {
    showVersionContent(config.repoPath, relativeMdPath, selected as string)
  }
}

function showVersionContent(repoPath: string, relativeMdPath: string, hash: string) {
  try {
    const content = execSync(
      `git show ${hash}:${relativeMdPath}`,
      { cwd: repoPath }
    ).toString()

    p.log.message(pc.dim('─'.repeat(60)))
    p.log.message(content)
    p.log.message(pc.dim('─'.repeat(60)))
    p.outro(`版本 ${pc.dim(`[${hash}]`)}`)
  } catch (e) {
    p.log.error(`无法获取版本 ${hash} 的内容。请确认 Hash 是否正确。`)
    console.error(e)

    // 尝试用 git tag 查找
    try {
      const tags = execSync(`git tag -l "${skillName}@*"`, { cwd: repoPath }).toString().trim()
      if (tags) {
        p.log.info(`可用的 Tag:\n${tags.split('\n').map(t => `  ${pc.cyan(t)}`).join('\n')}`)
      }
    } catch (e) {}
  }
}
