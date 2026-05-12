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
> 请确保在继续之前没有未提交的更改。

### 2. 🔑 检查并确保 NPM 登录状态
在发布之前，必须确保已登录。如果未登录或登录过期，我会直接运行 `npm login` 并为你提供认证链接。

// turbo
```bash
npm whoami || npm login
```

> [!IMPORTANT]
> 如果出现认证链接，请及时点击并在浏览器中完成验证。

### 3. 🆙 升级版本号
根据变更的规模，选择合适的升级类型 (patch, minor, major)。

// turbo
```bash
npm version {{version_type}}
```

### 4. 🛠️ 项目编译
执行构建，确保代码可以正常编译。

// turbo
```bash
npm run build
```

### 5. 🚀 发布到 NPM
将编译好的包发布到 NPM 注册表。

```bash
npm publish --access public
```

> [!IMPORTANT]
> **注意 2FA 验证**：如果 NPM 要求二次验证，我会实时输出终端中的 **`Authenticate your account at: ...`** 链接。请点击该链接并在手机/浏览器完成授权，发布会自动继续。

### 6. 🖇️ 同步到远程仓库
将版本更新后的代码和 Tag 推送到远程。

// turbo
```bash
git push --follow-tags
```

---

**🎉 发布成功！** 你的新版本已上线。