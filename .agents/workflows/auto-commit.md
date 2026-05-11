---
description: 自动提交代码变更，并使用 AI 生成符合约定式提交规范 (Conventional Commits) 的提交信息。
---

# 🚀 自动提交工作流 (Auto-Commit Workflow)

这个工作流旨在通过 AI 自动化分析变更、生成规范的提交信息并执行 Git 提交，确保提交历史整洁且具有描述性。

### 1. 🔍 检查当前状态
首先，检查工作区是否有待提交的更改。

// turbo
```bash
git status
```

> [!NOTE]
> 如果 `Untracked files` 或 `Changes not staged for commit` 为空，则无需继续。

### 2. 📥 暂存变更 (Stage Changes)
将所有（或选定的）更改添加到暂存区。

// turbo
```bash
git add .
```

### 3. 🧠 生成提交信息 (AI Analysis)
通过分析暂存区的差异 (`diff`)，生成一个符合 **Conventional Commits** 规范的提交信息。

**规范格式：** `<type>(<scope>): <description>`

| 类型 (Type) | 说明 |
| :--- | :--- |
| **feat** | 新功能 |
| **fix** | 修复 Bug |
| **docs** | 文档更新 |
| **refactor** | 代码重构 (既不修复 Bug 也不添加功能) |
| **chore** | 构建过程或辅助工具的变动 |
| **style** | 样式调整 (不影响逻辑) |

// turbo
```bash
git diff --cached
```

> [!TIP]
> **AI 任务：** 请根据上述差异生成一行简短的提交信息。
> 例如：`feat(cli): add auto-commit workflow template`

### 4. ✅ 执行提交 (Commit)
使用生成的 `{{commit_message}}` 执行提交。

// turbo
```bash
git commit -m "{{commit_message}}"
```

### 5. 📤 推送 (Optional Push)
如果需要同步到远程仓库，请执行：

```bash
git push
```

---

**✨ 完成！** 你的代码已被安全提交。

