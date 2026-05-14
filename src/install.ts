import fs from 'fs-extra'
import { join, dirname, basename } from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import os from 'node:os'

export interface InstallOptions {
  sourceDir: string
  targetAgents: any[]
  selectedSkills: string[]
  scope: 'project' | 'global' | 'custom'
  method: 'symlink' | 'copy'
  strategy: 'merge' | 'overwrite'
  customRoot?: string
}

export async function installSkills(options: InstallOptions) {
  const { sourceDir, targetAgents, selectedSkills, scope, method, strategy, customRoot } = options
  const s = p.spinner()

  for (const agent of targetAgents) {
    // 1. 计算安装路径
    let targetRoot = ''

    if (customRoot) {
      // 优先级最高：用户指定的自定义路径
      targetRoot = customRoot
    } else if (scope === 'project') {
      // 项目模式：使用隐藏文件夹
      const hiddenFolderName = basename(dirname(agent.path))
      targetRoot = join(process.cwd(), hiddenFolderName, 'skills')
    } else {
      // 全局模式：直接使用 Agent 的默认路径
      targetRoot = agent.path.replace(/^~/, os.homedir())
    }

    s.start(`正在部署到 ${agent.name} (${targetRoot})...`)

    try {
      // 2. 根据策略处理目标目录
      if (strategy === 'overwrite' && await fs.pathExists(targetRoot)) {
        await fs.emptyDir(targetRoot)
      } else {
        await fs.ensureDir(targetRoot)
      }

      // 3. 安装所选技能
      for (const skill of selectedSkills) {
        const src = join(sourceDir, skill)
        const dest = join(targetRoot, skill)

        if (await fs.pathExists(dest)) {
          await fs.remove(dest)
        }

        if (method === 'symlink') {
          await fs.ensureDir(dest)
          const files = await fs.readdir(src)
          for (const file of files) {
            if (file === 'history' || file === '.git') continue
            await fs.ensureSymlink(join(src, file), join(dest, file))
          }
        } else {
          // 物理拷贝时排除 history 目录
          await fs.copy(src, dest, {
            filter: (srcPath) => {
              const name = basename(srcPath)
              return name !== 'history' && name !== '.git'
            }
          })
        }
      }

      s.stop(`成功同步到: ${agent.name} (${scope === 'custom' ? '自定义路径' : scope + ' 模式'})`)
    } catch (err: any) {
      s.stop(`${pc.red('失败')}: ${agent.name}`)
      console.error(err)
    }
  }
}
