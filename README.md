# xc-skills 🚀

一款专门为 XC 开发团队定制的 Agent 技能管理 CLI 工具。它模仿了官方 `skills` 的交互体验，但内置了团队常用的开发工具配置，并提供了更细致的安装控制。

## ✨ 核心特性

- **内置 Agent 支持**：默认支持 `Antigravity`, `Trae`, `Codex`, `Claude Code` 等工具。
- **全平台远程安装**：支持从 GitHub, GitLab 以及通用 Git 平台（如 **Coding.net**, 企业级私有仓库）下载并安装技能。
- **项目级安装 (Project Scope)**：支持将技能安装到当前项目的 `.agent/skills`, `.trae/skills` 等隐藏目录下。
- **技能描述预览**：在安装选择界面，自动解析并显示每个技能的详细功能描述。
- **远程同步更新 (Update)**：支持将本地开发的技能一键同步/推送到指定的远程 Git 仓库。
- **深度交互流程**：
  1. **Select Skills**：勾选技能（带描述预览）。
  2. **Select Agents**：选择要同步的目标开发工具。
  3. **Scope Choice**：决定是全局安装还是项目内安装。
  4. **Method Choice**：选择软链接或物理拷贝。
  5. **Summary**：安装前的详细综述。
  6. **Confirmation**：二次确认。

## 📦 安装

你可以通过 npm 全局安装：

```bash
npm install -g xc-skills
```

或者使用 `pnpm dlx` 临时执行：

```bash
pnpm dlx xc-skills add .
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

### 3. 一键同步到远程仓库 (Update)

如果你本地开发了新技能，想要推送到团队公共仓库。

**在技能文件夹（如 `sks/`）内直接运行：**

```bash
# 自动扫描当前目录下的子文件夹作为技能
xc-skills update
```

**或者指定目录和远程仓库地址：**

```bash
# 指定本地目录
xc-skills update ./my-dev-skills --remote https://github.com/org/repo.git
```

### 4. 查看已安装的技能

你可以列出当前项目或全局已安装的所有技能：

```bash
# 查看当前项目的技能
xc-skills list

# 查看全局已安装的技能
xc-skills list -g
```

### 5. 清理项目技能目录

如果你想删除当前项目中安装的所有技能目录（如 `.agent`, `.trae` 等），可以使用 `remove` 命令：

```bash
xc-skills remove
# 或者使用别名
xc-skills cleanup
xc-skills rm

# 清理全局目录下的技能
xc-skills remove --global
```

## 🛠 命令参数

### `add` 指令参数
| 选项 | 描述 |
| --- | --- |
| `-s, --skill <names>` | 指定要安装的技能名称（逗号分隔，或用 `*` 表示全部） |
| `-a, --agent <names>` | 指定目标 Agent 名称（逗号分隔，或用 `*` 表示全部） |
| `-d, --dir <dir>` | 指定源目录中技能存放的目录名（默认为 `skills`） |
| `-o, --out <path>` | 指定输出的目标目录路径 |
| `-y, --yes` | 跳过所有确认和交互步骤 |

### `update` 指令参数
| 选项 | 描述 |
| --- | --- |
| `-r, --remote <url>` | 目标远程仓库的 Git 地址 |
| `-b, --branch <name>` | 目标仓库的分支（默认为 `main`） |

## 📄 License

MIT
