#!/usr/bin/env node
import { cac } from 'cac'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs-extra'
import { join, resolve, dirname, basename } from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
// @ts-ignore
import degit from 'degit'
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

// --- Add Command ---
cli
  .command('add <source>', 'Add skills from a local directory or GitHub URL')
  .option('-s, --skill <skills>', 'Specific skills to install')
  .option('-a, --agent <agents>', 'Specific agents to install to')
  .option('-d, --dir <dir>', 'The directory name containing skills', { default: 'skills' })
  .option('-o, --out <path>', 'Specify a custom output directory')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (source, options) => {
    p.intro(`${pc.bgCyan(pc.black(' xc-skills '))}`)

    let sourceDir = ''
    let isTemp = false
    const tempPath = join(os.tmpdir(), `xc-skills-${Date.now()}`)

    const isUrl = source.startsWith('http') || source.startsWith('git@') || (source.includes('/') && !fs.existsSync(resolve(process.cwd(), source)))

    if (isUrl) {
      const s = p.spinner()
      s.start(`正在尝试下载技能库: ${source}`)
      let success = false
      try {
        const emitter = degit(source, { cache: false, force: true, verbose: false })
        await emitter.clone(tempPath)
        success = true
        s.stop(`下载成功 (degit)`)
      } catch (err) {
        try {
          s.message(`degit 不支持此平台，正在尝试使用 git clone...`)
          execSync(`git clone --depth 1 ${source} ${tempPath}`, { stdio: 'ignore' })
          if (fs.existsSync(join(tempPath, '.git'))) {
            await fs.remove(join(tempPath, '.git'))
          }
          success = true
          s.stop(`下载成功 (git clone)`)
        } catch (gitErr: any) {
          s.stop(pc.red(`下载失败: ${gitErr.message}`))
          process.exit(1)
        }
      }
      if (success) {
        sourceDir = tempPath
        isTemp = true
      }
    } else {
      sourceDir = resolve(process.cwd(), source)
    }

    const skillsPath = join(sourceDir, options.dir)
    if (!fs.existsSync(skillsPath)) {
      p.log.error(`找不到技能目录: ${skillsPath}`)
      if (isTemp) await fs.remove(tempPath)
      process.exit(1)
    }

    const skillEntries = (await fs.readdir(skillsPath, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    
    const availableSkills = skillEntries.map(entry => {
      const name = entry.name
      const description = getSkillDescription(join(skillsPath, name))
      return { name, description }
    })

    if (availableSkills.length === 0) {
      p.log.error(`在 ${skillsPath} 中没有找到任何有效的技能子目录`)
      if (isTemp) await fs.remove(tempPath)
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
        options: availableSkills.map(s => ({ value: s.name, label: s.name, hint: s.description })),
        initialValues: [availableSkills[0].name]
      }) as string[]
    }

    if (p.isCancel(selectedSkills)) {
      if (isTemp) await fs.remove(tempPath)
      p.cancel('已取消')
      process.exit(0)
    }

    let selectedAgents: any[] = []
    if (options.out) {
      selectedAgents = [{ name: 'Custom Path', path: resolve(process.cwd(), options.out) }]
    } else if (options.yes || options.agent === '*') {
      selectedAgents = AGENTS
    } else if (options.agent) {
      const names = options.agent.split(',')
      selectedAgents = AGENTS.filter(a => names.includes(a.name))
    } else {
      selectedAgents = await p.multiselect({
        message: '第二步：选择目标开发工具 (Select agents)',
        options: AGENTS.map(a => ({ value: a, label: a.name, hint: a.path.replace(os.homedir(), '~') })),
        initialValues: [AGENTS[0]]
      }) as any[]
    }

    if (p.isCancel(selectedAgents)) {
      if (isTemp) await fs.remove(tempPath)
      p.cancel('已取消')
      process.exit(0)
    }

    let scope: 'project' | 'global' | 'custom' = options.out ? 'custom' : 'project'
    if (!options.out && !options.yes) {
      scope = await p.select({
        message: '第三步：选择安装范围 (Installation scope)',
        options: [
          { value: 'project', label: 'Project (项目级)', hint: './.<agent>/skills' },
          { value: 'global', label: 'Global (全局)', hint: '工具默认路径' }
        ]
      }) as 'project' | 'global'
    }

    if (p.isCancel(scope)) {
      if (isTemp) await fs.remove(tempPath)
      p.cancel('已取消')
      process.exit(0)
    }

    let method: 'symlink' | 'copy' = 'symlink'
    if (isTemp) {
      method = 'copy'
    } else if (!options.yes) {
      method = await p.select({
        message: '第四步：选择安装方式 (Installation method)',
        options: [
          { value: 'symlink', label: 'Symlink (软链接 - 推荐)', hint: '与源码保持实时同步' },
          { value: 'copy', label: 'Copy (物理拷贝)', hint: '复制文件副本' }
        ]
      }) as 'symlink' | 'copy'
    }

    if (p.isCancel(method)) {
      if (isTemp) await fs.remove(tempPath)
      p.cancel('已取消')
      process.exit(0)
    }

    let strategy: 'merge' | 'overwrite' = 'merge'
    const needsConflictCheck = !options.yes
    if (needsConflictCheck) {
      let exists = false
      for (const agent of selectedAgents) {
        let targetRoot = ''
        if (options.out) {
          targetRoot = resolve(process.cwd(), options.out)
        } else if (scope === 'project') {
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
      if (isTemp) await fs.remove(tempPath)
      p.cancel('已取消')
      process.exit(0)
    }

    if (!options.yes) {
      p.log.message(`${pc.cyan('安装综述 (Installation Summary)')}`)
      const summary = [
        `${pc.dim('Source:')}   ${isUrl ? source : 'Local'}`,
        `${pc.dim('Skills:')}   ${selectedSkills.join(', ')}`,
        options.out ? `${pc.dim('Target:')}   ${selectedAgents[0].path}` : `${pc.dim('Agents:')}   ${selectedAgents.map(a => a.name).join(', ')}`,
        `${pc.dim('Scope:')}    ${scope}`,
        `${pc.dim('Method:')}   ${method}`,
        `${pc.dim('Strategy:')} ${strategy}`
      ]
      summary.forEach(line => p.log.message(`  ${line}`))
      const confirm = await p.confirm({ message: '确认安装？(Proceed with installation?)', initialValue: true })
      if (p.isCancel(confirm) || !confirm) {
        if (isTemp) await fs.remove(tempPath)
        p.cancel('安装已取消')
        process.exit(0)
      }
    }

    await installSkills({
      sourceDir: skillsPath,
      targetAgents: selectedAgents,
      selectedSkills,
      scope: scope as any,
      method,
      strategy,
      customRoot: options.out ? resolve(process.cwd(), options.out) : undefined
    })

    if (isTemp) await fs.remove(tempPath)
    p.outro(pc.green('安装完成！(Installation complete)'))
  })

// --- Remove Command ---
cli
  .command('remove', 'Remove installed skills from the current project or global directory')
  .alias('cleanup')
  .alias('rm')
  .option('-g, --global', 'Remove global skills instead of project skills')
  .action(async (options) => {
    const isGlobal = options.global
    p.intro(`${pc.bgRed(pc.white(isGlobal ? ' xc-skills remove (Global) ' : ' xc-skills remove (Project) '))}`)

    const cwd = process.cwd()
    const candidates: { name: string, path: string }[] = []

    if (isGlobal) {
      for (const agent of AGENTS) {
        const fullPath = agent.path.replace(/^~/, os.homedir())
        if (fs.existsSync(fullPath)) {
          candidates.push({ name: agent.name, path: fullPath })
        }
      }
    } else {
      const potentialDirs = ['.agent', '.trae', '.claude', '.codex']
      for (const dir of potentialDirs) {
        const skillsPath = join(cwd, dir, 'skills')
        if (fs.existsSync(skillsPath)) {
          candidates.push({ name: dir, path: join(cwd, dir) })
        }
      }
    }

    if (candidates.length === 0) {
      p.log.info(isGlobal ? '没有发现已安装的全局技能目录。' : '在当前项目中没有发现已安装的技能目录。')
      process.exit(0)
    }

    const targets = await p.multiselect({
      message: `选择要清除的${isGlobal ? '全局' : '项目'}目录 (Select to remove)`,
      options: candidates.map(c => ({ value: c.path, label: c.name, hint: c.path.replace(os.homedir(), '~') })),
      initialValues: candidates.map(c => c.path)
    }) as string[]

    if (p.isCancel(targets) || targets.length === 0) {
      p.cancel('操作已取消')
      process.exit(0)
    }

    const confirm = await p.confirm({
      message: `确认删除选中的 ${targets.length} 个目录及其所有技能？(Confirm deletion?)`,
      initialValue: false
    })

    if (p.isCancel(confirm) || !confirm) {
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
        s.stop(pc.red(`删除 ${display} 失败: ${err.message}`))
      }
    }
    p.outro(pc.green('清理完成！'))
  })

// --- List Command ---
cli
  .command('list', 'List installed skills')
  .alias('ls')
  .option('-g, --global', 'List global skills instead of project skills')
  .action(async (options) => {
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
  })

cli.help()
cli.version('1.1.0')

cli.parse()
