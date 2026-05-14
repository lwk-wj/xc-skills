import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs-extra'
import { join } from 'node:path'
import os from 'node:os'
import { AGENTS } from '../agents.js'

export interface RemoveOptions {
  global?: boolean
}

export async function removeCommand(options: RemoveOptions) {
  const isGlobal = options.global
  p.intro(`${pc.bgRed(pc.white(isGlobal ? ' xc-skills remove (Global) ' : ' xc-skills remove (Project) '))}`)

  const cwd = process.cwd()
  const candidates: { name: string, path: string, skills: string[] }[] = []

  if (isGlobal) {
    for (const agent of AGENTS) {
      const fullPath = agent.path.replace(/^~/, os.homedir())
      if (fs.existsSync(fullPath)) {
        const skills = (await fs.readdir(fullPath, { withFileTypes: true }))
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .map(e => e.name)
        candidates.push({ name: agent.name, path: fullPath, skills })
      }
    }
  } else {
    const potentialDirs = ['.agents', '.trae', '.claude', '.codex']
    for (const dir of potentialDirs) {
      const skillsPath = join(cwd, dir, 'skills')
      if (fs.existsSync(skillsPath)) {
        const skills = (await fs.readdir(skillsPath, { withFileTypes: true }))
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .map(e => e.name)
        candidates.push({ name: dir, path: join(cwd, dir), skills })
      }
    }
  }

  if (candidates.length === 0) {
    p.log.info(isGlobal ? '没有发现已安装的全局技能目录。' : '在当前项目中没有发现已安装的技能目录。')
    process.exit(0)
  }

  const targets = await p.multiselect({
    message: `选择要清除的${isGlobal ? '全局' : '项目'}目录 (Select to remove)`,
    options: candidates.map(c => ({ 
      value: c.path, 
      label: c.name, 
      hint: c.skills.length > 0 ? `Skills: ${c.skills.join(', ')}` : '(空目录)'
    })),
    initialValues: candidates.map(c => c.path)
  }) as string[]

  if (p.isCancel(targets) || targets.length === 0) {
    p.cancel('操作已取消')
    process.exit(0)
  }

  const s = p.spinner()
  for (const targetPath of targets) {
    const display = targetPath.replace(os.homedir(), '~')
    s.start(`正在删除 ${display}...`)
    try {
      await fs.remove(targetPath)
      s.stop(`已删除: ${display}`)
    } catch (err: any) {
      s.stop(pc.red(`删除 ${display} 失败`))
      console.error(err)
    }
  }
  p.outro(pc.green('清理完成！'))
}
