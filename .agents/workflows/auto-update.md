---
description: NPM 自动更新与发布工作流，包含版本号更新、项目构建、自动化测试（可选）及 NPM 发布。
---

# 📦 NPM 自动更新与发布 (Auto-Update & Publish)

此工作流用于自动化处理 NPM 包的版本升级、构建及发布流程。

### 1. 🔍 环境检查
确保当前分支干净且所有更改已提交。

// turbo
```bash
git status
```

> [!WARNING]
> 请确保在继续之前没有未提交的更改。如果是为了发布新功能，请先运行 `auto-commit` 工作流。

### 2. 🆙 升级版本号
根据变更的规模，选择合适的升级类型。

- **patch**: 修补程序 (1.0.0 -> 1.0.1)
- **minor**: 新功能 (1.0.0 -> 1.1.0)
- **major**: 重大变更 (1.0.0 -> 2.0.0)

// turbo
```bash
npm version {{version_type}}
```

> [!NOTE]
> 该命令会自动更新 `package.json`，创建一个 Git 提交并打上相应的版本 Tag。

### 3. 🛠️ 项目编译
在发布前执行构建，确保代码可以正常编译。

// turbo
```bash
npm run build
```

### 4. 🚀 发布到 NPM
将编译好的包发布到 NPM 注册表。

```bash
npm publish
```

> [!IMPORTANT]
> 如果你是第一次在该环境发布，可能需要先运行 `npm login`。如果是私有包或需要特定权限，请确保配置正确。

### 5. 🖇️ 同步到远程仓库
将版本更新后的代码和 Tag 推送到 GitHub/GitLab。

// turbo
```bash
git push --follow-tags
```

---

**🎉 发布成功！** 你的新版本已上线。