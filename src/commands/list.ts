import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs-extra'
import { join } from 'node:path'
import os from 'node:os'
import { AGENTS } from '../agents.js'

export interface ListOptions {
  global?: boolean
}

export async function listCommand(options: ListOptions) {
  const isGlobal = options.global
  p.intro(`${pc.bgBlue(pc.white(isGlobal ? ' xc-skills list (Global) ' : ' xc-skills list (Project) '))}`)

  const cwd = process.cwd()
  const groups: { name: string, path: string, skills: string[] }[] = []

  if (isGlobal) {
    for (const agent of AGENTS) {
      const fullPath = agent.path.replace(/^~/, os.homedir())
      if (fs.existsSync(fullPath)) {
        const skills = (await fs.readdir(fullPath, { withFileTypes: true }))
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .map(e => e.name)
        groups.push({ name: agent.name, path: fullPath, skills })
      }
    }
  } else {
    const potentialDirs = ['.agent', '.trae', '.claude', '.codex']
    for (const dir of potentialDirs) {
      const skillsPath = join(cwd, dir, 'skills')
      if (fs.existsSync(skillsPath)) {
        const skills = (await fs.readdir(skillsPath, { withFileTypes: true }))
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .map(e => e.name)
        groups.push({ name: dir, path: skillsPath, skills })
      }
    }
  }

  if (groups.length === 0) {
    p.log.info('没有发现已安装的技能。')
  } else {
    for (const group of groups) {
      p.log.message(`${pc.cyan(group.name)} ${pc.dim(`(${group.path.replace(os.homedir(), '~')})`)}`)
      if (group.skills.length === 0) {
        p.log.message(`  ${pc.dim('(无技能)')}`)
      } else {
        p.log.message(`  ${group.skills.join(', ')}`)
      }
      p.log.message('')
    }
  }
  p.outro('查询完毕！')
}
