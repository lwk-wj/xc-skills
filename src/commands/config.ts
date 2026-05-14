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
    message: '请选择未来的默认操作模式 (Repository Mode)',
    options: [
      { value: 'local', label: 'Local (本地管理)', hint: '直接使用本地硬盘上的统一技能仓库' },
      { value: 'remote', label: 'Remote (远程管理)', hint: '通过 Git URL 拉取/发布技能' }
    ],
    initialValue: 'local' // 始终默认为 local
  })

  if (p.isCancel(mode)) {
    p.cancel('已取消')
    process.exit(0)
  }

  // 2. 设置资产中心 (本地路径或远程地址)
  const defaultLocalPath = '/Users/xc/Desktop/XcSkill/skills'
  const defaultRemoteUrl = 'https://e.coding.net/realmicro/silkworm/skills.git'

  const repoPathInput = await p.text({
    message: mode === 'local' ? '请输入本地技能仓库的绝对路径' : '请输入远程技能仓库的 Git 地址',
    placeholder: mode === 'local' ? defaultLocalPath : defaultRemoteUrl,
    initialValue: mode === 'local' ? defaultLocalPath : defaultRemoteUrl, // 始终使用固定预设
    validate: (value) => {
      if (!value.trim()) return mode === 'local' ? '路径不能为空' : 'Git 地址不能为空'
    }
  })

  if (p.isCancel(repoPathInput)) {
    p.cancel('已取消')
    process.exit(0)
  }
  const repoPath = repoPathInput as string

  // 3. 设置默认远程仓库地址
  const remoteUrl = await p.text({
    message: '请输入用于发布技能的远程仓库地址 (Remote URL)',
    placeholder: 'https://e.coding.net/xxx/skills.git',
    initialValue: mode === 'remote' ? repoPath : defaultRemoteUrl, // 只有 Remote 模式下联动，Local 模式下用固定预设
    validate: (value) => {
      if (!value.trim()) return '远程仓库地址不能为空'
    }
  })

  if (p.isCancel(remoteUrl)) {
    p.cancel('已取消')
    process.exit(0)
  }

  // 4. 设置默认分支
  const defaultBranch = await p.text({
    message: '请设置默认发布分支 (Default Branch)',
    placeholder: 'main',
    initialValue: 'master', // 始终默认为 master
    validate: (value) => {
      if (!value.trim()) return '分支名称不能为空'
    }
  })

  if (p.isCancel(defaultBranch)) {
    p.cancel('已取消')
    process.exit(0)
  }

  // 5. 设置默认加载的文件夹名称
  const defaultGroupsStr = await p.text({
    message: '请设置默认加载的平台/分组文件夹名称 (多个用逗号分隔)',
    placeholder: 'miniapp, backend, h5, common',
    initialValue: 'miniapp, backend, h5, common', // 始终使用预设分组
    validate: (value) => {
      if (!value.trim()) return '文件夹名称不能为空'
    }
  })

  if (p.isCancel(defaultGroupsStr)) {
    p.cancel('已取消')
    process.exit(0)
  }

  const defaultGroups = (defaultGroupsStr as string).split(',').map(s => s.trim()).filter(Boolean)

  // 保存配置
  const newConfig: Config = {
    mode: mode as 'local' | 'remote',
    repoPath: repoPath.trim(),
    remoteUrl: (remoteUrl as string).trim(),
    defaultBranch: (defaultBranch as string).trim(),
    defaultGroups
  }

  await saveConfig(newConfig)

  p.log.message(`${pc.cyan('配置总览 (Configuration Summary)')}`)
  p.log.message(`  ${pc.dim('操作模式:')} ${pc.green(newConfig.mode)}`)
  p.log.message(`  ${pc.dim(newConfig.mode === 'local' ? '本地仓库路径:' : '远程技能中心:')} ${pc.yellow(newConfig.repoPath)}`)
  p.log.message(`  ${pc.dim('发布仓库地址:')} ${pc.yellow(newConfig.remoteUrl)}`)
  p.log.message(`  ${pc.dim('默认发布分支:')} ${pc.yellow(newConfig.defaultBranch)}`)
  p.log.message(`  ${pc.dim('技能分组:')} ${pc.blue(newConfig.defaultGroups?.join(' | '))}`)

  p.outro(pc.green('✅ 配置已成功保存！(Saved to ~/.xc-skills-config.json)'))
}
