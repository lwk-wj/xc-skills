# xc-skills 🚀

一款专门为 XC 开发团队定制的 Agent 技能管理 CLI 工具。它模仿了官方 `skills` 的交互体验，但内置了团队常用的开发工具配置，并提供了更细致的安装控制。

## ✨ 核心特性

- **内置 Agent 支持**：默认支持 `Antigravity`, `Trae`, `Codex`, `Claude Code` 等工具。
- **全平台远程安装**：支持从 GitHub, GitLab 以及通用 Git 平台（如 **Coding.net**, 企业级私有仓库）下载并安装技能。
- **项目级安装 (Project Scope)**：支持将技能安装到当前项目的 `.agent/skills`, `.trae/skills` 等隐藏目录下。
- **技能描述预览**：在安装选择界面，自动解析并显示每个技能的详细功能描述。
- **自定义目录扫描**：支持通过 `--dir` 选项指定本地或远程仓库中的技能存放路径。
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

### 3. 自定义技能目录

如果技能不在 `skills/` 目录下（例如在 `my-rules/` 目录），可以使用 `--dir` 参数：

```bash
xc-skills add . --dir my-rules
```

### 4. 指定输出路径

如果你想把技能安装到一个特定的文件夹（而不是默认的 Agent 路径或 `.agent/skills`），可以使用 `--out` 参数：

```bash
xc-skills add . --out ./my-debug-folder
```

### 5. 参数化运行

```bash
# 自动安装所有技能到 Antigravity（跳过交互）
xc-skills add . --yes --agent Antigravity --skill *
```

## 🛠 命令选项

| 选项 | 描述 |
| --- | --- |
| `-s, --skill <names>` | 指定要安装的技能名称（逗号分隔，或用 `*` 表示全部） |
| `-a, --agent <names>` | 指定目标 Agent 名称（逗号分隔，或用 `*` 表示全部） |
| `-d, --dir <dir>` | 指定源目录中技能存放的目录名（默认为 `skills`） |
| `-o, --out <path>` | 指定输出的目标目录路径 |
| `-y, --yes` | 跳过所有确认和交互步骤，使用默认值 |
| `-v, --version` | 查看版本号 |
| `-h, --help` | 查看帮助信息 |

## 📄 License

MIT
