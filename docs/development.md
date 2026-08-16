# 开发指南

## 环境要求

通用要求：

- Node.js 20+
- npm 10+
- Rust stable
- Cargo

Windows 构建：

- Windows 10/11
- WebView2 Runtime

macOS 构建：

- macOS
- Xcode Command Line Tools
- Rust target：`aarch64-apple-darwin`（Apple Silicon）

## 安装依赖

```bash
npm install
```

## 常用命令

前端开发：

```bash
npm run dev
```

桌面端开发：

```bash
npm run tauri:dev
```

前端构建：

```bash
npm run build
```

Rust 检查：

```bash
cd src-tauri
cargo check
```

macOS Apple Silicon 本地构建：

```bash
rustup target add aarch64-apple-darwin
npm ci
npm run tauri:build -- --target aarch64-apple-darwin
```

GitHub Actions 当前会构建 Windows 与 macOS 产物：

- Windows：`.msi` / `.exe`
- macOS：`.dmg` / `.app`

macOS CI 产物当前未签名，首次打开可能受 Gatekeeper 限制；正式分发前需要 Developer ID 签名和 notarization。

## 代码组织规则

### 前端

- `src/pages` 放页面组件。
- `src/components` 放可复用组件。
- `src/api` 放 Tauri command 封装。
- `src/types` 放前端类型定义。
- `src/data` 只放静态配置。

### Rust

- `commands` 只负责接收前端请求和返回结果。
- `domain` 放业务模型和纯业务逻辑。
- `infrastructure` 放文件、JSON、表格和二进制适配。

## 错误处理原则

- Rust 层返回结构化错误。
- 前端只负责展示错误，不解析底层文件细节。
- 导入导出错误必须包含行号、字段名和原因。

## 测试策略

- Rust 单元测试：模型转换、校验、二进制打包。
- 前端组件测试：表格编辑、树操作、表单校验。
- 集成测试：打开样例 `.jcpro` 并导出。

### GitHub Actions 对齐预检

提交前建议执行：

```powershell
npm ci
npx playwright install chromium
npm run verify:ci
```

该命令按 Action 的共享脚本执行前端、Rust 和 UI 质量检查。完整说明、定向命令和 Playwright 失败产物见 [本地 CI 预检](ci-preflight.md)。

### 配置版本回归

v1/v2 fixture 位于 `src-tauri/tests/fixtures/i18n/`。新增版本字段或二进制文本引用时，至少验证：

- v1/v2 schema 字段互斥；
- v1 清单无 `i18n_*`，v2 清单无 `language_*`；
- `locale_order` 完整且无重复；
- 非空业务消息 key 缺失时构建失败；
- `LVI2` 编解码和 CRC 损坏拒绝。

```powershell
cd src-tauri
cargo test --lib
```

固件动态语言宿主测试在下位机 `meter_6_test/tests/` 中，要求 PATH 中存在 GCC 或 Clang：

```powershell
.\tests\run-host-tests.ps1
```

退出码 2 表示未发现宿主 C 编译器，不能记为测试通过。目标固件 SCons 构建和设备验收也必须单独记录。
