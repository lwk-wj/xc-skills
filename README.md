# xc-skills 🚀

一款专门为 XC 开发团队定制的 Agent 技能管理 CLI 工具。它模仿了官方 `skills` 的交互体验，但内置了团队常用的开发工具配置，并提供了更细致的安装控制。

## ✨ 核心特性

- **内置 Agent 支持**：默认支持 `Antigravity`, `Trae`, `Codex`, `Claude Code` 等工具。
- **全平台远程安装**：支持从 GitHub, GitLab 以及通用 Git 平台（如 **Coding.net**, 企业级私有仓库）下载并安装技能。
- **智能过滤**：安装时自动排除 `history` 等管理文件夹，保持项目轻量。
- **项目级安装 (Project Scope)**：支持将技能安装到当前项目的 `.agent/skills`, `.trae/skills` 等隐藏目录下。
- **技能描述预览**：在安装选择界面，自动解析并显示每个技能的详细功能描述。
- **发布到远程 (Publish)** 🚀：支持将本地开发的技能一键推送到指定的远程 Git 仓库。
- **跨项目自进化同步 (Sync)** 🌟：支持将业务项目中的技能改进一键同步回中央技能仓库。
- **深度交互流程**：包含技能选择、Agent 选择、安装范围、物理/软链选择等完整生命周期管理。

## 📦 安装

你可以通过 npm 全局安装：

```bash
npm install -g xc-skills
```

或者使用 `pnpm dlx` 临时执行：

```bash
pnpm dlx xc-skills add .
```

## ⚙️ 配置中央仓库

在使用自进化同步功能前，需要指定你的本地中央技能仓库路径：

```bash
xc-skills config --repo /Users/xc/Desktop/XcSkill/skills
```

## 🚀 使用指南

### 1. 基础添加命令

在存放技能（含有 `skills/` 文件夹）的项目根目录下运行：

```bash
xc-skills add .
```

### 2. 从 GitHub/Coding.net 安装

直接传入仓库地址，即可快速同步远程技能库：

```bash
# GitHub
xc-skills add https://github.com/vuejs-ai/skills.git

# Coding.net (企业级 Git 平台)
xc-skills add https://e.coding.net/your-team/skills.git
```

### 3. 发布技能到远程仓库 (Publish)

如果你本地开发了新技能，想要推送到团队公共仓库（GitHub/Coding 等）。

```bash
# 自动扫描当前目录下的子文件夹作为技能并发布
xc-skills publish
```

### 4. 同步进化到中央仓库 (Sync) 🌟

当你（或 AI）在业务项目里改进了某个技能（生成了 `PENDING_SYNC.md`）后，使用此命令将变更同步回本地中央仓库。

```bash
# 在业务项目根目录下运行
xc-skills sync
```

该命令采用 **Git 原生历史管理**，会自动：
- 物理拷贝 `SKILL.md` 和 `EVOLUTION.md` 到中央仓库。
- 在中央仓库自动执行 **Git Commit** 和 **Git Tag**（格式如 `skill@v1.x.x`）。
- 自动将本次提交的 **Git Hash** 记录回 `EVOLUTION.md`。
- 自动触发中央仓库索引更新，并清理本地同步标记。

### 5. 查看历史版本 (View) 🕰️

由于采用了 Git 增量历史管理，仓库中不再有臃肿的 `history` 文件夹。你可以使用 `view` 命令随时查看历史版本：

```bash
# 交互式选择查看某个技能的进化历史
xc-skills view use-icon

# 直接查看特定 Hash 版本的技能内容
xc-skills view use-icon@abc1234
```

### 6. 从中央仓库拉取最新 (Pull) 📥

当你需要在当前项目中获取中央仓库的最新技能版本时使用。

```bash
xc-skills pull
```

该命令会自动：
- 扫描当前项目已安装的技能
- 从配置的中央仓库拉取最新版
- 覆盖本地副本（方便你基于最新版再次进化）

### 7. 查看已安装的技能

```bash
# 查看当前项目的技能
xc-skills list

# 查看全局已安装的技能
xc-skills list -g
```

### 8. 清理项目技能目录

```bash
xc-skills remove
# 或者使用别名
xc-skills cleanup
xc-skills rm
```

## 🔄 自进化工作流

1. **就地进化**：AI 在业务项目中发现技能缺陷，直接修改 `.agents/skills/xxx/SKILL.md` 并创建 `PENDING_SYNC.md` 标记。
2. **本地验证**：在业务项目中验证改进是否有效。
3. **一键同步**：运行 `xc-skills sync`。
4. **追溯历史**：通过 `EVOLUTION.md` 中的 Hash 或运行 `xc-skills view` 随时回溯之前的版本。

## 🛠 命令参数

### `add` 指令参数
| 选项 | 描述 |
| --- | --- |
| `-s, --skill <names>` | 指定要安装的技能名称（逗号分隔，或用 `*` 表示全部） |
| `-a, --agent <names>` | 指定目标 Agent 名称（逗号分隔，或用 `*` 表示全部） |
| `-d, --dir <dir>` | 指定源目录中技能存放的目录名（默认为 `skills`） |
| `-o, --out <path>` | 指定输出的目标目录路径 |
| `-y, --yes` | 跳过所有确认和交互步骤 |

### `config` 指令参数
| 选项 | 描述 |
| --- | --- |
| `-r, --repo <path>` | 设置本地中央技能仓库的路径 |

### `sync` 指令参数
| 选项 | 描述 |
| --- | --- |
| `-d, --dir <dir>` | 业务项目中存放技能的目录（默认为 `.agents/skills`） |

## 📄 License

MIT
