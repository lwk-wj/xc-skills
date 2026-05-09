#!/usr/bin/env node
import { cac } from 'cac'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs-extra'
import { join, resolve, dirname, basename } from 'node:path'
import { execSync } from 'node:child_process'
import os from 'node:os'
import { AGENTS } from './agents.js'
import { installSkills } from './install.js'

const cli = cac('xc-skills')

/**
 * 提取 SKILL.md 中的描述信息
 */
function getSkillDescription(skillPath: string): string {
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

/**
 * 判断是否为 URL
 */
function isRemoteUrl(path: string) {
  return path.startsWith('http') || path.startsWith('git@') || (path.includes(':') && !path.includes('\\'))
}

cli
  .command('add <source>', 'Add skills from a local directory or GitHub URL')
  .option('-s, --skill <skills>', 'Specific skills to install')
  .option('-a, --agent <agents>', 'Specific agents to install to')
  .option('-d, --dir <dir>', 'The directory name containing skills', { default: 'skills' })
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (source, options) => {
    p.intro(`${pc.bgCyan(pc.black(' xc-skills '))}`)

    let sourceDir = resolve(process.cwd(), source)
    let tempDir: string | null = null

    // --- 远程仓库处理逻辑 ---
    if (isRemoteUrl(source)) {
      const s = p.spinner()
      s.start(`正在从远程仓库下载技能: ${source}...`)
      try {
        tempDir = join(os.tmpdir(), `xc-skills-${Date.now()}`)
        execSync(`git clone --depth 1 ${source} ${tempDir}`, { stdio: 'ignore' })
        sourceDir = tempDir
        s.stop('下载成功')
      } catch (err: any) {
        s.stop(pc.red('下载失败'))
        p.log.error(`无法从 ${source} 克隆仓库，请检查网络或链接是否正确。`)
        process.exit(1)
      }
    }

    const skillsPath = join(sourceDir, options.dir)
    
    if (!fs.existsSync(skillsPath)) {
      p.log.error(`找不到技能目录: ${skillsPath}`)
      if (tempDir) await fs.remove(tempDir) // 清理临时目录
      process.exit(1)
    }

    // 1. Step: Scan Skills and Descriptions
    const skillEntries = (await fs.readdir(skillsPath, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    
    const availableSkills = skillEntries.map(entry => {
      const name = entry.name
      const description = getSkillDescription(join(skillsPath, name))
      return { name, description }
    })

    if (availableSkills.length === 0) {
      p.log.error(`在 ${skillsPath} 中没有找到任何有效的技能子目录`)
      if (tempDir) await fs.remove(tempDir)
      process.exit(1)
    }

    let selectedSkills: string[] = []
    if (options.yes || options.skill === '*') {
      selectedSkills = availableSkills.map(s => s.name)
    } else if (options.skill) {
      selectedSkills = options.skill.split(',')
    } else {
      selectedSkills = await p.multiselect({
        message: '第一步：选择要安装的技能 (Select skills)',
        options: availableSkills.map(s => ({ 
          value: s.name, 
          label: s.name, 
          hint: s.description 
        })),
        initialValues: [availableSkills[0].name]
      }) as string[]
    }

    if (p.isCancel(selectedSkills)) {
      if (tempDir) await fs.remove(tempDir)
      p.cancel('已取消')
      process.exit(0)
    }

    // 2. Step: Select Agents
    let selectedAgents: any[] = []
    if (options.yes || options.agent === '*') {
      selectedAgents = AGENTS
    } else if (options.agent) {
      const names = options.agent.split(',')
      selectedAgents = AGENTS.filter(a => names.includes(a.name))
    } else {
      selectedAgents = await p.multiselect({
        message: '第二步：选择目标开发工具 (Select agents)',
        options: AGENTS.map(a => ({ 
          value: a, 
          label: a.name, 
          hint: a.path.replace(os.homedir(), '~') 
        })),
        initialValues: [AGENTS[0]]
      }) as any[]
    }

    if (p.isCancel(selectedAgents)) {
      if (tempDir) await fs.remove(tempDir)
      p.cancel('已取消')
      process.exit(0)
    }

    // 3. Step: Select Scope
    let scope: 'project' | 'global' = 'project'
    if (!options.yes) {
      scope = await p.select({
        message: '第三步：选择安装范围 (Installation scope)',
        options: [
          { value: 'project', label: 'Project (项目级)', hint: './.<agent>/skills' },
          { value: 'global', label: 'Global (全局)', hint: '工具默认路径' }
        ]
      }) as 'project' | 'global'
    }

    if (p.isCancel(scope)) {
      if (tempDir) await fs.remove(tempDir)
      p.cancel('已取消')
      process.exit(0)
    }

    // 4. Step: Select Method
    let method: 'symlink' | 'copy' = 'symlink'
    if (!options.yes || tempDir) {
      // 注意：如果是远程下载的临时目录，必须使用 'copy' 模式，因为临时目录会被删除
      method = tempDir ? 'copy' : await p.select({
        message: '第四步：选择安装方式 (Installation method)',
        options: [
          { value: 'symlink', label: 'Symlink (软链接 - 推荐)', hint: '与源码保持实时同步' },
          { value: 'copy', label: 'Copy (物理拷贝)', hint: '复制文件副本' }
        ]
      }) as 'symlink' | 'copy'
      
      if (tempDir) {
        p.log.info(pc.yellow('提示: 远程安装将自动使用 Copy 模式 (Symlink 不适用于临时文件)'))
      }
    }

    if (p.isCancel(method)) {
      if (tempDir) await fs.remove(tempDir)
      p.cancel('已取消')
      process.exit(0)
    }

    // 检查冲突并选择策略
    let strategy: 'merge' | 'overwrite' = 'merge'
    const needsConflictCheck = !options.yes

    if (needsConflictCheck) {
      let exists = false
      for (const agent of selectedAgents) {
        let targetRoot = ''
        if (scope === 'project') {
          const hiddenFolderName = basename(dirname(agent.path))
          targetRoot = join(process.cwd(), hiddenFolderName, 'skills')
        } else {
          targetRoot = agent.path.replace(/^~/, os.homedir())
        }
        if (await fs.pathExists(targetRoot)) {
          exists = true
          break
        }
      }

      if (exists) {
        strategy = await p.select({
          message: '检测到目标目录已存在，如何处理？(Handle conflicts)',
          options: [
            { value: 'merge', label: 'Merge (合并)', hint: '只更新选中的技能，保留其他技能' },
            { value: 'overwrite', label: 'Overwrite (覆盖)', hint: '清空目标目录后再安装' }
          ]
        }) as 'merge' | 'overwrite'
      }
    }

    if (p.isCancel(strategy)) {
      if (tempDir) await fs.remove(tempDir)
      p.cancel('已取消')
      process.exit(0)
    }

    // 5. Step: Installation Summary
    if (!options.yes) {
      p.log.message(`${pc.cyan('安装综述 (Installation Summary)')}`)
      const summary = [
        `${pc.dim('Source:')}   ${isRemoteUrl(source) ? pc.yellow(source) : source}`,
        `${pc.dim('Skills:')}   ${selectedSkills.join(', ')}`,
        `${pc.dim('Agents:')}   ${selectedAgents.map(a => a.name).join(', ')}`,
        `${pc.dim('Scope:')}    ${scope}`,
        `${pc.dim('Method:')}   ${method}`,
        `${pc.dim('Strategy:')} ${strategy}`
      ]
      summary.forEach(line => p.log.message(`  ${line}`))
      
      // 6. Step: Confirm Installation
      const confirm = await p.confirm({
        message: '确认安装？(Proceed with installation?)',
        initialValue: true
      })

      if (p.isCancel(confirm) || !confirm) {
        if (tempDir) await fs.remove(tempDir)
        p.cancel('安装已取消')
        process.exit(0)
      }
    }

    // 7. Execute Installation
    await installSkills({
      sourceDir: skillsPath,
      targetAgents: selectedAgents,
      selectedSkills,
      scope,
      method,
      strategy
    })

    // 清理工作
    if (tempDir) {
      await fs.remove(tempDir)
    }

    p.outro(pc.green('安装完成！(Installation complete)'))
  })

cli.help()
cli.version('1.0.3')

cli.parse()
