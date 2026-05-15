import fs from 'fs-extra'
import { join, basename, resolve } from 'node:path'
import os from 'node:os'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { getConfig } from './config.js'
import { execSync } from 'node:child_process'
import { getSkillsRecursive } from '../utils.js'

export async function syncCommand(options: { dir: string, repo?: string }) {
  p.intro(`${pc.bgGreen(pc.black(' xc-skills sync '))}`)

  const config = await getConfig()
  const branch = config.defaultBranch || 'main'
  const isRemoteMode = config.mode === 'remote'
  const tempPath = join(os.tmpdir(), `xc-skills-sync-${Date.now()}`)
  const finalRepoPath = isRemoteMode ? tempPath : resolve(config.repoPath!)

  if (isRemoteMode) {
    const s_clone = p.spinner()
    s_clone.start(`正在连接远程仓库 [${branch}]: ${config.remoteUrl}`)
    try {
      execSync(`git clone --depth 1 --branch ${branch} ${config.remoteUrl} ${tempPath}`, { 
        stdio: 'ignore',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      s_clone.stop(`已连接到远程仓库 [${branch}]`)
    } catch (e) {
      s_clone.stop(pc.red(`克隆远程仓库失败，请检查分支 ${branch} 是否存在`))
      process.exit(1)
    }
  } else {
    if (!fs.existsSync(finalRepoPath)) {
      p.log.error(`本地目标仓库路径不存在: ${finalRepoPath}`)
      process.exit(1)
    }
    // 核心修复：本地仓库在同步前尝试 pull --rebase，对齐远程状态
    const s_resync = p.spinner()
    s_resync.start(`正在对齐远程状态 [${branch}]...`)
    try {
      execSync(`git pull --rebase --autostash origin ${branch}`, { 
        cwd: finalRepoPath, 
        stdio: 'pipe',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      s_resync.stop(`本地中央仓库已就绪 [${branch}]`)
    } catch (e: any) {
      const errorMsg = e.stderr?.toString() || e.message
      s_resync.stop(pc.yellow(`远程同步跳过: ${errorMsg.split('\n')[0]}`))
    }
  }

  // 1. 递归搜索所有 PENDING_SYNC.md
  const pendingSkills: { name: string, path: string }[] = []
  const EXCLUDE_DIRS = ['node_modules', '.git', 'dist']

  function scan(currentDir: string, depth = 0) {
    if (depth > 10) return
    if (!fs.existsSync(currentDir)) return

    let files: fs.Dirent[] = []
    try {
      files = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch (e) { return }

    if (files.some(f => f.name === 'PENDING_SYNC.md')) {
      pendingSkills.push({
        name: basename(currentDir),
        path: currentDir
      })
    }

    for (const file of files) {
      if (file.isDirectory() && !EXCLUDE_DIRS.includes(file.name)) {
        scan(join(currentDir, file.name), depth + 1)
      }
    }
  }

  const s_search = p.spinner()
  s_search.start('正在全量扫描待同步的技能...')
  scan(process.cwd())
  s_search.stop('扫描完成')

  const uniquePendingSkills = Array.from(new Map(pendingSkills.map(s => [s.name, s])).values())

  if (uniquePendingSkills.length === 0) {
    p.log.info('没有发现待同步的进化技能（未找到 PENDING_SYNC.md）。')
    if (isRemoteMode && fs.existsSync(tempPath)) await fs.remove(tempPath)
    p.outro('完成')
    return
  }

  p.log.message(`${pc.cyan('待同步清单 (Pending Sync List):')}`)
  uniquePendingSkills.forEach(s => {
    const isSymlink = fs.existsSync(s.path) && (fs.lstatSync(s.path).isSymbolicLink() || 
                     (fs.existsSync(join(s.path, 'SKILL.md')) && fs.lstatSync(join(s.path, 'SKILL.md')).isSymbolicLink()));
    
    p.log.message(`  ${pc.green('●')} ${pc.bold(s.name)} ${isSymlink ? pc.yellow('[软链]') : pc.blue('[拷贝]')} ${pc.dim(s.path.replace(process.cwd(), '.'))}`)
  })

  function parseLatestVersion(evolutionPath: string): string | null {
    if (!fs.existsSync(evolutionPath)) return null
    const content = fs.readFileSync(evolutionPath, 'utf-8')
    // 更加精确的匹配：## vX.Y.Z 且后面跟着日期
    const match = content.match(/^##\s*(v[\d.]+)\s*—\s*\d{4}-\d{2}-\d{2}/m)
    return match ? match[1] : null
  }

  function appendHashToEvolution(evolutionPath: string, hash: string) {
    if (!fs.existsSync(evolutionPath)) return
    let content = fs.readFileSync(evolutionPath, 'utf-8')
    // 统一匹配逻辑，确保能正确找到并更新第一行版本号
    content = content.replace(
      /^(##\s*v[\d.]+\s*—\s*\d{4}-\d{2}-\d{2})(.*?)$/m,
      (match, prefix, rest) => {
        if (rest.includes('`')) return match // 如果已经有 hash 了，跳过
        return `${prefix} \`${hash}\``
      }
    )
    fs.writeFileSync(evolutionPath, content, 'utf-8')
  }

  const s_repo = p.spinner()
  s_repo.start(`正在扫描中央仓库结构...`)
  const repoSkills = await getSkillsRecursive(finalRepoPath)
  s_repo.stop('中央仓库扫描完成')

  for (const skill of uniquePendingSkills) {
    const s_item = p.spinner()
    s_item.start(`正在同步: ${skill.name}`)

    const sourceDir = skill.path
    
    // 寻找该技能在仓库中的原位置
    const existingInRepo = repoSkills.find(s => s.name === skill.name)
    let targetDir = ''
    
    if (existingInRepo) {
      targetDir = existingInRepo.path
    } else {
      // 如果是新技能，默认放入根目录下的 skills 文件夹
      targetDir = join(finalRepoPath, 'skills', skill.name)
    }

    // 1. 真身校验：检查本地项目技能是否已经软链接到中央仓库
    let isAlreadyLinked = false
    if (fs.existsSync(targetDir)) {
      try {
        const realSource = await fs.realpath(sourceDir)
        const realTarget = await fs.realpath(targetDir)
        if (realSource === realTarget) {
          isAlreadyLinked = true
        } else {
          // 检查内部关键文件
          const skillFile = join(sourceDir, 'SKILL.md')
          if (fs.existsSync(skillFile) && fs.lstatSync(skillFile).isSymbolicLink()) {
            const realSkillFile = await fs.realpath(skillFile)
            if (realSkillFile.startsWith(realTarget)) {
              isAlreadyLinked = true
            }
          }
        }
      } catch (e) {}
    }

    try {
      await fs.ensureDir(targetDir)

      // 2. 同步内容 (仅在非链接状态下执行)
      if (!isAlreadyLinked) {
        const filesToSync = ['SKILL.md', 'EVOLUTION.md']
        for (const file of filesToSync) {
          const src = join(sourceDir, file)
          const dest = join(targetDir, file)
          if (await fs.pathExists(src)) {
            // 确保解引用，拷贝真实内容
            await fs.copy(src, dest, { dereference: true })
          }
        }
      }

      // 3. 自动补全 EVOLUTION.md (如果缺失)
      const evolutionFile = join(targetDir, 'EVOLUTION.md')
      // 防御性：如果是断掉的链接，先删除
      try {
        if (fs.lstatSync(evolutionFile).isSymbolicLink() && !fs.existsSync(evolutionFile)) {
          await fs.remove(evolutionFile)
        }
      } catch (e) {}

      if (!fs.existsSync(evolutionFile)) {
        const initialContent = `# ${skill.name} Evolution History\n\n## v1.0.0 — ${new Date().toISOString().split('T')[0]}\n\n**触发原因**: 初始同步/补全记录\n**变更内容**:\n1. 初始化技能进化记录文件。\n`
        fs.writeFileSync(evolutionFile, initialContent, 'utf-8')
      }

      // 1. Git Commit
      const version = parseLatestVersion(evolutionFile)
      const commitMsg = `feat(${skill.name}): evolve to ${version || 'latest'}`

      try {
        execSync('git add .', { 
          cwd: finalRepoPath, 
          stdio: 'pipe',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        })
        execSync(`git commit -m "${commitMsg}"`, { 
          cwd: finalRepoPath, 
          stdio: 'pipe',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        })
      } catch (e: any) {
        const status = execSync('git status --porcelain', { cwd: finalRepoPath }).toString()
        if (!status.trim()) {
          s_item.stop(pc.yellow(`${skill.name}: 内容无变化，已跳过`))
          await fs.remove(join(sourceDir, 'PENDING_SYNC.md'))
          continue
        }
      }

      // 2. 获取 Hash 并写回
      const hash = execSync('git rev-parse --short HEAD', { 
        cwd: finalRepoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      }).toString().trim()
      appendHashToEvolution(join(targetDir, 'EVOLUTION.md'), hash)

      // 3. 修正提交
      try {
        execSync('git add .', { cwd: finalRepoPath, stdio: 'pipe' })
        execSync('git commit --amend --no-edit', { cwd: finalRepoPath, stdio: 'pipe' })
      } catch (e) {}

      // 4. 打 Tag
      if (version) {
        const tagName = `${skill.name}@${version}`
        try {
          execSync(`git tag -f -a ${tagName} -m "Version ${version} of ${skill.name}"`, { 
            cwd: finalRepoPath, 
            stdio: 'pipe',
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
          })
          p.log.success(`已创建/更新标签: ${pc.cyan(tagName)}`)
        } catch (e: any) {
          p.log.warn(`无法创建标签 ${tagName}: ${e.message}`)
        }
      } else {
        p.log.warn(`${skill.name}: 未能在 EVOLUTION.md 中解析到合法的版本号格式，已跳过打标签。`)
      }

      // 5. 清理本地标记
      await fs.remove(join(sourceDir, 'PENDING_SYNC.md'))

      s_item.stop(`${pc.green('✔')} ${skill.name} ${version ? pc.dim(`${version}`) : ''} ${pc.dim(`[${hash}]`)}`)
    } catch (err: any) {
      s_item.stop(`同步失败: ${skill.name}`)
      console.error(err)
    }
  }

  // --- 5. 更新索引 (所有技能同步完后统一更新一次) ---
  const s_index = p.spinner()
  try {
    if (fs.existsSync(join(finalRepoPath, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(join(finalRepoPath, 'package.json'), 'utf-8'))
      if (pkg.scripts && pkg.scripts.index) {
        s_index.start('正在更新中央仓库全量索引...')
        execSync(`pnpm start index`, { 
          cwd: finalRepoPath, 
          stdio: 'pipe',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        })
        execSync(`git add . && git commit -m "chore: update skills index" || true`, { 
          cwd: finalRepoPath, 
          stdio: 'pipe',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        })
        s_index.stop(pc.green('索引更新完成'))
      }
    }
  } catch (e) {}

  // --- 6. 最后的 Push 操作 ---
  const s_push = p.spinner()
  s_push.start(`正在推送到远程目标仓库 [${branch}]...`)
  try {
    execSync(`git push origin HEAD:${branch} --follow-tags`, { 
      cwd: finalRepoPath, 
      stdio: 'pipe',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
    s_push.stop(pc.green(`🚀 已成功同步并推送至远程仓库 [${branch}]！`))
  } catch (e: any) {
    s_push.stop(pc.red('❌ 推送到远程失败，请检查网络或权限。'))
    console.error(e)
  }

  // 如果是临时目录，清理掉
  if (isRemoteMode && fs.existsSync(tempPath)) {
    await fs.remove(tempPath)
  }

  p.outro(pc.green('全部同步任务已完成！'))
}
