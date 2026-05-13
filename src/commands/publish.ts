import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs-extra'
import { join, resolve, basename } from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { getSkillDescription } from '../utils.js'

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

  // 3. 获取远程仓库地址
  let remoteUrl = options.remote
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

  const branch = options.branch || 'main'
  const tempPath = join(os.tmpdir(), `xc-skills-publish-${Date.now()}`)

  const s = p.spinner()
  try {
    // 4. 克隆远程仓库
    s.start(`正在连接远程仓库: ${remoteUrl}`)
    execSync(`git clone --depth 1 ${remoteUrl} ${tempPath}`, { stdio: 'ignore' })
    s.stop(`已连接到远程仓库`)

    const remoteSkillsPath = join(tempPath, 'skills')
    await fs.ensureDir(remoteSkillsPath)

    // 5. 同步选中的技能
    for (const skill of selectedSkills) {
      s.start(`正在发布技能: ${skill}`)
      const localPath = join(skillsPath, skill)
      const targetPath = join(remoteSkillsPath, skill)

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
      gitCmd(`git push origin HEAD`)
      s.stop(pc.green(`发布成功！已同步至 ${remoteUrl}`))
    } catch (e) {
      const status = execSync('git status --porcelain', { cwd: tempPath }).toString()
      if (!status) {
        s.stop(pc.yellow('内容已是最新，无需发布。'))
      } else {
        throw e
      }
    }

  } catch (err: any) {
    s.stop(pc.red(`操作失败，请检查网络或 Git 权限。`))
  } finally {
    if (fs.existsSync(tempPath)) {
      await fs.remove(tempPath)
    }
  }

  p.outro(pc.green('全部操作完成！'))
}
