import fs from 'fs-extra'
import { join } from 'node:path'

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
  } catch (e) {}
  return ''
}
