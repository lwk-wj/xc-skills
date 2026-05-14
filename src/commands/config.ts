import fs from 'fs-extra'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import * as p from '@clack/prompts'
import pc from 'picocolors'

const CONFIG_PATH = resolve(homedir(), '.xc-skills-config.json')

export interface Config {
  mode?: 'local' | 'remote'
  repoPath?: string
  remoteUrl?: string
  defaultBranch?: string
  defaultGroups?: string[]
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
  p.intro(`${pc.bgBlue(pc.black(' xc-skills config (初始化设置) '))}`)

  const config = await getConfig()

  // 1. 询问操作模式：本地还是远程
  const mode = await p.select({
    message: '第一步：请选择未来的默认操作模式 (Repository Mode)',
    options: [
      { value: 'local', label: 'Local (本地管理)', hint: '直接使用本地硬盘上的统一技能仓库' },
      { value: 'remote', label: 'Remote (远程管理)', hint: '通过 Git URL 拉取/发布技能' }
    ],
    initialValue: config.mode || 'local'
  })

  if (p.isCancel(mode)) {
    p.cancel('已取消')
    process.exit(0)
  }

  // 2. 设置仓库路径
  const repoPath = await p.text({
    message: `第二步：请输入${mode === 'local' ? '本地仓库绝对路径' : '远程 Git 仓库地址'}`,
    placeholder: mode === 'local' ? '/Users/xc/Desktop/XcSkill/skills' : 'https://e.coding.net/xxx/skills.git',
    initialValue: config.repoPath || '',
    validate: (value) => {
      if (!value.trim()) return '路径/地址不能为空'
    }
  })

  if (p.isCancel(repoPath)) {
    p.cancel('已取消')
    process.exit(0)
  }

  // 3. 设置默认加载的文件夹名称
  const defaultGroupsStr = await p.text({
    message: '第三步：请设置默认加载的平台/分组文件夹名称 (多个用逗号分隔)',
    placeholder: 'miniapp, backend, h5, common',
    initialValue: config.defaultGroups ? config.defaultGroups.join(', ') : 'miniapp, backend, h5, common',
    validate: (value) => {
      if (!value.trim()) return '文件夹名称不能为空'
    }
  })

  if (p.isCancel(defaultGroupsStr)) {
    p.cancel('已取消')
    process.exit(0)
  }

  const defaultGroups = (defaultGroupsStr as string).split(',').map(s => s.trim()).filter(Boolean)

  // 4. 设置默认远程仓库地址
  const remoteUrl = await p.text({
    message: '第四步：请设置默认远程仓库地址 (Remote URL, 可选)',
    placeholder: 'https://e.coding.net/xxx/skills.git',
    initialValue: config.remoteUrl || ''
  })

  if (p.isCancel(remoteUrl)) {
    p.cancel('已取消')
    process.exit(0)
  }

  // 5. 设置默认分支
  const defaultBranch = await p.text({
    message: '第五步：请设置默认发布分支 (Default Branch)',
    placeholder: 'main',
    initialValue: config.defaultBranch || 'main'
  })

  if (p.isCancel(defaultBranch)) {
    p.cancel('已取消')
    process.exit(0)
  }

  // 保存配置
  const newConfig: Config = {
    mode: mode as 'local' | 'remote',
    repoPath: (repoPath as string).trim(),
    remoteUrl: (remoteUrl as string).trim(),
    defaultBranch: (defaultBranch as string).trim(),
    defaultGroups
  }

  await saveConfig(newConfig)

  p.log.message(`${pc.cyan('配置总览 (Configuration Summary)')}`)
  p.log.message(`  ${pc.dim('操作模式:')} ${newConfig.mode}`)
  p.log.message(`  ${pc.dim('仓库路径/地址:')} ${newConfig.repoPath}`)
  p.log.message(`  ${pc.dim('远程仓库地址:')} ${newConfig.remoteUrl || '未设置'}`)
  p.log.message(`  ${pc.dim('默认发布分支:')} ${newConfig.defaultBranch}`)
  p.log.message(`  ${pc.dim('技能分组:')} ${newConfig.defaultGroups?.join(' | ')}`)

  p.outro(pc.green('✅ 配置已成功保存！(Saved to ~/.xc-skills-config.json)'))
}
