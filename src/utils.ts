import fs from 'fs-extra'
import { join, basename } from 'node:path'

/**
 * 提取 SKILL.md 中的描述信息
 */
export function getSkillDescription(skillPath: string): string {
  try {
    const skillMd = join(skillPath, 'SKILL.md')
    if (fs.existsSync(skillMd)) {
      const content = fs.readFileSync(skillMd, 'utf-8')
      const match = content.match(/description:\s*['"]?([^'"\n\r]+)['"]?/)
      return match ? match[1].trim() : ''
    }
  } catch (e) { }
  return ''
}export interface SkillItem {
  name: string
  path: string
  description: string
  group: string
}

/**
 * 递归扫描技能目录
 */
export async function getSkillsRecursive(basePath: string): Promise<SkillItem[]> {
  const items: SkillItem[] = []

  async function scan(currentPath: string, group = '') {
    const name = basename(currentPath)
    // 排除不必要的目录
    if (name.startsWith('.') || name === 'node_modules' || name === 'dist') {
      return
    }

    let entries: fs.Dirent[] = []
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true })
    } catch (e) {
      return
    }

    // 如果当前目录下有 SKILL.md，说明这本身就是一个技能
    if (entries.some(e => e.isFile() && e.name === 'SKILL.md')) {
      items.push({
        name: basename(currentPath),
        path: currentPath,
        description: getSkillDescription(currentPath),
        group
      })
      return
    }

    // 否则继续扫描子目录
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // 如果是在第一层且没有 SKILL.md，则将其作为 group 名
        const nextGroup = !group ? entry.name : group
        await scan(join(currentPath, entry.name), nextGroup)
      }
    }
  }

  if (fs.existsSync(basePath)) {
    await scan(basePath)
  }

  return items
}
