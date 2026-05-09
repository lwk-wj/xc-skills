# xc-skills 🚀

一款专门为 XC 开发团队定制的 Agent 技能管理 CLI 工具。它模仿了官方 `skills` 的交互体验，但内置了团队常用的开发工具配置，并提供了更细致的安装控制。

## ✨ 核心特性

- **内置 Agent 支持**：默认支持 `Antigravity`, `Trae`, `Codex`, `Claude Code` 等工具。
- **项目级安装 (Project Scope)**：支持将技能安装到当前项目的 `.agent/skills` 等隐藏目录下，实现技能的“项目私有化”。
- **深度交互流程**：
  1. **Select Skills**：自由勾选需要安装的技能。
  2. **Select Agents**：选择要同步的目标开发工具。
  3. **Scope Choice**：决定是全局安装还是仅在当前项目安装。
  4. **Method Choice**：选择软链接（Symlink，实时同步）或物理拷贝（Copy）。
  5. **Summary**：安装前的详细综述。
  6. **Confirmation**：二次确认，防止误操作。

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

随后按照终端提示进行 6 步交互即可。

### 2. 参数化运行

如果你想跳过交互，可以使用参数：

```bash
# 安装所有技能到所有工具，并使用默认设置（项目模式 + 软链接）
xc-skills add . --yes

# 指定特定技能和工具
xc-skills add . --skill use-table,antfu --agent Antigravity,Trae
```

### 3. 命令选项

| 选项 | 描述 |
| --- | --- |
| `-s, --skill <names>` | 指定要安装的技能名称（逗号分隔，或用 `*` 表示全部） |
| `-a, --agent <names>` | 指定目标 Agent 名称（逗号分隔，或用 `*` 表示全部） |
| `-y, --yes` | 跳过所有确认和交互步骤，使用默认值 |
| `-v, --version` | 查看版本号 |
| `-h, --help` | 查看帮助信息 |

## 🛠 自定义配置

如果你需要增加新的 Agent 工具或修改默认路径，可以修改源码中的 `src/agents.ts` 文件，然后重新打包发布。

## 📄 License

MIT
