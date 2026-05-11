import fs from 'fs-extra'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import * as p from '@clack/prompts'
import pc from 'picocolors'

const CONFIG_PATH = resolve(homedir(), '.xc-skills-config.json')

export interface Config {
  repoPath?: string
}

export async function getConfig(): Promise<Config> {
  if (await fs.pathExists(CONFIG_PATH)) {
    return await fs.readJson(CONFIG_PATH)
  }
  return {}
}

export async function saveConfig(config: Config) {
  await fs.writeJson(CONFIG_PATH, config, { spaces: 2 })
}

export async function configCommand(options: { repo?: string }) {
  p.intro(`${pc.bgBlue(pc.black(' xc-skills config '))}`)

  const config = await getConfig()

  if (options.repo) {
    const absolutePath = resolve(process.cwd(), options.repo)
    if (!await fs.pathExists(absolutePath)) {
      p.log.error(`路径不存在: ${absolutePath}`)
      process.exit(1)
    }
    
    config.repoPath = absolutePath
    await saveConfig(config)
    p.log.success(`中央仓库路径已设置为: ${pc.cyan(absolutePath)}`)
  } else {
    if (config.repoPath) {
      p.log.info(`当前中央仓库路径: ${pc.cyan(config.repoPath)}`)
    } else {
      p.log.warn('尚未设置中央仓库路径。使用 --repo <path> 进行设置。')
    }
  }

  p.outro('完成')
}
