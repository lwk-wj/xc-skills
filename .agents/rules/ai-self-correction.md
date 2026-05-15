# 🤖 AI 代码质量自省准则 (AI Coding Integrity & Self-Check Rule)

本准则用于约束 AI 在代码生成和修改过程中的行为，旨在杜绝由于“逻辑局部化”导致的低级语法错误和一致性问题。

### 1. 🔍 依赖完整性检查 (Dependency Integrity)
- **必须先检查 Import**：在代码块中使用任何新模块（如 `os`, `path`, `fs`）或工具函数（如 `join`, `resolve`, `execSync`）之前，必须**第一时间**检查文件顶部是否已包含对应的 `import`。
- **杜绝 ReferenceError**：严禁在未确认导入的情况下直接调用模块方法。

### 2. 📛 变量命名一致性 (Naming & Scope Consistency)
- **拒绝局部猜测**：在修改已有函数时，必须先通过 `view_file` 确认当前作用域内已存在的变量名。严禁凭直觉使用 `isRemote` 替代已有的 `isRemoteMode` 等类似行为。
- **严禁重复定义**：在函数顶部已定义核心变量（如 `finalRepoPath`）后，后续逻辑严禁再次使用 `const` 或 `let` 进行同名或近义词重新定义。
- **全局同步**：在多个相互关联的文件（如 `publish.ts` 和 `sync.ts`）中，同类逻辑的变量命名必须保持 100% 一致。

### 3. 🧹 冗余清理 (Stale Code Cleanup)
- **彻底铲除残留**：在重构逻辑后，必须执行全局搜索（Grep），清理掉所有已废弃的变量引用（如旧的 `repoPath` 或 `isTempRepo`）。
- **杜绝代码碎片**：修改后的代码块不应留下无意义的空行或被注释掉的旧逻辑（除非用户明确要求保留）。

### 4. 🧪 Git 指令健壮性 (Robust Git Commands)
- **禁止隐式假设**：Git 操作严禁依赖“默认分支”或“默认追踪”。必须显式指定 `--branch`，必须显式执行 `-u` (upstream)，必须显式指定 `cwd` 运行目录。
- **错误实时回馈**：核心 Git 指令严禁默认使用 `stdio: 'ignore'`，必须确保异常能被捕获并转化为可读的错误提示。
