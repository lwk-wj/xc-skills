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
  let repoPath = options.repo || config.repoPath
  const branch = config.defaultBranch || 'main'
  let isTempRepo = false
  const tempRepoPath = join(os.tmpdir(), `xc-skills-sync-repo-${Date.now()}`)

  if (!repoPath) {
    p.log.error('未配置中央仓库路径。请使用 --repo <path/url> 或运行: xc-skills config')
    process.exit(1)
  }

  // 检测是否为远程 URL
  const isRemote = repoPath.startsWith('http') || repoPath.startsWith('git@')

  if (isRemote) {
    const s_clone = p.spinner()
    s_clone.start(`正在准备远程同步环境 [${branch}]: ${pc.cyan(repoPath)}`)
    try {
      // 核心修复：克隆时直接指定分支
      execSync(`git clone --depth 1 --branch ${branch} ${repoPath} ${tempRepoPath}`, { 
        stdio: 'ignore',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      repoPath = tempRepoPath
      isTempRepo = true
      s_clone.stop(`远程环境准备就绪 [${branch}]`)
    } catch (err: any) {
      s_clone.stop(pc.red('远程仓库拉取失败，请检查分支名称或权限'))
      console.error(err)
      process.exit(1)
    }
  } else {
    repoPath = resolve(process.cwd(), repoPath)
    if (!fs.existsSync(repoPath)) {
      p.log.error(`本地目标仓库路径不存在: ${repoPath}`)
      process.exit(1)
    }
    // 核心修复：本地仓库在同步前【不再】执行 reset --hard，防止回滚掉用户通过软链进行的实时修改
    const s_resync = p.spinner()
    s_resync.start(`正在检查本地中央仓库 [${branch}]...`)
    try {
      execSync(`git fetch origin ${branch}`, { 
        cwd: repoPath, 
        stdio: 'ignore',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      s_resync.stop(`本地中央仓库已就绪 [${branch}]`)
    } catch (e) {
      s_resync.stop(pc.yellow('本地中央仓库同步跳过（可能尚未关联远程或网络原因）'))
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
    if (isTempRepo) await fs.remove(tempRepoPath)
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

  const finalRepoPath = repoPath!
  
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

    const skillFile = join(sourceDir, 'SKILL.md')
    const needsCopy = fs.existsSync(skillFile) && !fs.lstatSync(skillFile).isSymbolicLink() && !fs.lstatSync(sourceDir).isSymbolicLink()
    try {
      await fs.ensureDir(targetDir)
      if (needsCopy) {
        const filesToSync = ['SKILL.md', 'EVOLUTION.md']
        for (const file of filesToSync) {
          const src = join(sourceDir, file)
          const dest = join(targetDir, file)
          if (await fs.pathExists(src)) {
            await fs.copy(src, dest)
          }
        }
      }

      // 0. 自动补全 EVOLUTION.md (如果缺失)
      const evolutionFile = join(targetDir, 'EVOLUTION.md')
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
    if (repoPath?.startsWith('http') || repoPath?.startsWith('git@')) {
      s_push.stop(pc.red('❌ 远程推送失败。'))
    } else {
      s_push.stop(pc.yellow('⚠️  本地仓库已更新，但推送远程(如果有)失败。'))
    }
    console.error(e)
  }

  // 如果是临时目录，清理掉
  if (isTempRepo) {
    await fs.remove(tempRepoPath)
  }

  p.outro(pc.green('全部同步任务已完成！'))
}
