import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs-extra'
import { join, resolve, basename } from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { getSkillDescription } from '../utils.js'
import { getConfig } from './config.js'

export interface PublishOptions {
  remote?: string
  dir: string
  branch?: string
}

export async function publishCommand(dirArg: string | undefined, options: PublishOptions) {
  p.intro(`${pc.bgMagenta(pc.black(' xc-skills publish '))}`)

  /**
   * 递归寻找名为 'skills' 的目录
   */
  function findSkillsPath(startPath: string, depth = 0): string | null {
    if (depth > 3) return null // 限制深度，防止死循环或过慢

    if (basename(startPath) === 'skills') return startPath

    const files = fs.readdirSync(startPath, { withFileTypes: true })

    // 1. 先在当前层级找
    for (const file of files) {
      if (file.isDirectory() && file.name === 'skills') {
        return join(startPath, file.name)
      }
    }

    // 2. 递归向下一层找
    for (const file of files) {
      if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules' && file.name !== 'dist') {
        const found = findSkillsPath(join(startPath, file.name), depth + 1)
        if (found) return found
      }
    }

    // 3. 特殊处理：检查常见的隐藏目录（如 .agents/skills）
    const specialDirs = ['.agents', '.trae', '.claude', '.codex']
    for (const dir of specialDirs) {
      const p = join(startPath, dir, 'skills')
      if (fs.existsSync(p)) return p
    }

    return null
  }

  let skillsPath = ''
  if (dirArg) {
    skillsPath = resolve(process.cwd(), dirArg)
  } else {
    const found = findSkillsPath(process.cwd())
    skillsPath = found || process.cwd()
  }

  if (!fs.existsSync(skillsPath)) {
    p.log.error(`找不到目录: ${skillsPath}`)
    process.exit(1)
  }

  p.log.step(`正在从目录扫描技能: ${pc.dim(skillsPath.replace(process.cwd(), '.'))}`)

  // 1. 扫描目录下的子文件夹作为技能
  const skillEntries = (await fs.readdir(skillsPath, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))

  const availableSkills = skillEntries.map(entry => {
    const name = entry.name
    const description = getSkillDescription(join(skillsPath, name))
    return { name, description }
  })

  if (availableSkills.length === 0) {
    p.log.error(`在 ${skillsPath} 中没有找到任何技能子目录`)
    process.exit(1)
  }

  // 2. 选择要发布的技能
  const selectedSkills = await p.multiselect({
    message: '选择要发布到远程仓库的技能 (Select skills)',
    options: availableSkills.map(s => ({ value: s.name, label: s.name, hint: s.description })),
  }) as string[]

  if (p.isCancel(selectedSkills) || selectedSkills.length === 0) {
    p.cancel('已取消')
    process.exit(0)
  }

  const config = await getConfig()
  // 调试日志：确认配置加载情况
  p.log.info(pc.dim(`[Debug] 当前配置模式: ${config.mode}, 默认分支: ${config.defaultBranch || '未设置'}`))

  // 3. 获取远程仓库地址
  let remoteUrl = options.remote || config.remoteUrl
  if (!remoteUrl) {
    remoteUrl = await p.text({
      message: '请输入目标远程仓库地址 (Remote URL)',
      placeholder: 'https://e.coding.net/.../skills.git',
      validate: (value) => {
        if (!value) return '地址不能为空'
      }
    }) as string
  }

  if (p.isCancel(remoteUrl)) {
    p.cancel('已取消')
    process.exit(0)
  }

  // 3.5 增加分组选择逻辑
  let selectedGroup = ''
  if (config.defaultGroups && config.defaultGroups.length > 0) {
    selectedGroup = await p.select({
      message: '请选择发布到的目标分组 (Select Target Group)',
      options: [
        { value: '', label: 'Default (根目录 skills/)', hint: '发布到仓库顶层的 skills 文件夹' },
        ...config.defaultGroups.map(g => ({ value: g, label: g }))
      ],
    }) as string

    if (p.isCancel(selectedGroup)) {
      p.cancel('已取消')
      process.exit(0)
    }
  }

  const branch = options.branch || config.defaultBranch || 'main'

  if (!config.defaultBranch && !options.branch) {
    p.log.warn(pc.yellow('ℹ️  提示：未设置默认发布分支，建议运行 `xc-skills config` 进行设置。当前默认使用 [main]'))
  }

  const tempPath = join(os.tmpdir(), `xc-skills-publish-${Date.now()}`)

  const s = p.spinner()
  try {
    // 4. 克隆远程仓库
    s.start(`正在连接远程仓库: ${remoteUrl}`)
    execSync(`git clone --depth 1 ${remoteUrl} ${tempPath}`, { stdio: 'ignore' })
    s.stop(`已连接到远程仓库`)

    const remoteSkillsPath = selectedGroup ? join(tempPath, selectedGroup, 'skills') : join(tempPath, 'skills')
    await fs.ensureDir(remoteSkillsPath)

    // 5. 同步选中的技能
    for (const skill of selectedSkills) {
      s.start(`正在发布技能: ${skill}`)
      const localPath = join(skillsPath, skill)
      const targetPath = join(remoteSkillsPath, skill)

      if (!fs.existsSync(localPath)) {
        s.stop(pc.yellow(`跳过: ${skill} (本地目录不存在)`))
        continue
      }

      // 补齐 EVOLUTION.md 防止发布后的技能无法建立软链接
      const evolutionPath = join(localPath, 'EVOLUTION.md')
      if (!fs.existsSync(evolutionPath)) {
        await fs.ensureDir(localPath) // 确保父目录存在
        const template = `# ${skill} Evolution History\n\n## v1.0.0 — ${new Date().toISOString().split('T')[0]}\n\n**触发原因**: 初始发布补全\n**变更内容**:\n1. 初始化记录文件。\n`
        fs.writeFileSync(evolutionPath, template, 'utf-8')
      }

      if (fs.existsSync(targetPath)) {
        await fs.remove(targetPath)
      }
      // 物理拷贝时排除 history 目录
      await fs.copy(localPath, targetPath, {
        filter: (srcPath) => {
          const name = basename(srcPath)
          return name !== 'history' && name !== '.git'
        }
      })
      s.stop(`已准备好: ${skill}`)
    }

    // 6. 提交并推送
    s.start(`正在推送到远程...`)
    const gitCmd = (cmd: string) => execSync(cmd, { cwd: tempPath, stdio: 'ignore' })

    gitCmd('git add .')
    const commitMsg = `feat(skills): publish ${selectedSkills.join(', ')}`

    try {
      gitCmd(`git commit -m "${commitMsg}"`)
      gitCmd(`git push origin HEAD:${branch}`)
      s.stop(pc.green(`发布成功！已同步至 ${remoteUrl} [${branch}]`))
    } catch (e) {
      const status = execSync('git status --porcelain', { cwd: tempPath }).toString()
      if (!status) {
        s.stop(pc.yellow('内容已是最新，无需发布。'))
      } else {
        throw e
      }
    }

    // 方案 A: 自动转义逻辑 (仅限 local 模式)
    if (config.mode === 'local' && config.repoPath) {
      const { installSkills } = await import('../install.js')
      const targetRepoPath = resolve(config.repoPath)
      
      p.log.info(pc.cyan(`ℹ️  检测到本地管理模式 (仓库: ${targetRepoPath})`))
      p.log.info(pc.cyan(`ℹ️  正在同步本地中央仓库 [${branch}]...`))
      
      try {
        // 核心修复：改用 fetch + reset --hard，强制本地中央仓库对齐远程，无视任何冲突
        execSync(`git fetch origin ${branch} && git reset --hard origin/${branch}`, { 
          cwd: targetRepoPath, 
          stdio: 'pipe',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        })
        p.log.success(pc.green(`✅ 本地中央仓库同步完成 [${branch}]`))
      } catch (e: any) {
        p.log.warn(`⚠️  本地中央仓库强制同步失败，请检查网络或手动进入 ${targetRepoPath} 检查。`)
        p.log.warn(`错误详情: ${e.message}`)
      }

      p.log.info(pc.cyan('ℹ️  正在将本地技能转换为软链接...'))
      
      // 重新计算在中央仓库中的真实源路径 (考虑分组)
      const realSourceDir = selectedGroup 
        ? join(targetRepoPath, selectedGroup, 'skills') 
        : join(targetRepoPath, 'skills')

      // 删除项目下的真实文件夹，准备转链
      for (const skill of selectedSkills) {
        const localSkillPath = join(skillsPath, skill)
        if (fs.existsSync(localSkillPath)) {
          await fs.remove(localSkillPath)
        }
      }

        await installSkills({
          sourceDir: realSourceDir,
          targetAgents: [{ name: 'Project', path: '.' }],
          selectedSkills: selectedSkills,
          scope: 'custom',
          method: 'symlink',
          strategy: 'merge',
          customRoot: skillsPath
        })

      p.log.success(pc.green(`✅ 已成功将 ${selectedSkills.length} 个技能转换为中央仓库软链接`))
    }

  } catch (err: any) {
    s.stop(pc.red(`操作失败，请检查网络或 Git 权限。`))
    console.error(err)
  } finally {
    if (fs.existsSync(tempPath)) {
      await fs.remove(tempPath)
    }
  }

  p.outro(pc.green('全部操作完成！'))
}
