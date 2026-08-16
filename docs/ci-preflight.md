# 本地 CI 预检

GitHub Actions 的质量门禁由三个独立检查组成：前端质量、Rust 质量和 UI（Playwright）质量。三组检查在 [`.github/workflows/build.yml`](../.github/workflows/build.yml) 中分别调用 `package.json` 的 `verify:frontend`、`verify:rust` 和 `verify:ui`，本地统一入口 `npm run verify:ci` 会执行同一组检查，并为子进程设置 `CI=true`。Action 中三个 job 并行，本地则按顺序执行以便尽早定位失败步骤。

## 一次性准备

在仓库根目录执行：

```powershell
npm ci
npx playwright install chromium
```

还需要可用的 Rust stable/Cargo。Playwright 浏览器只需按依赖版本重新安装；升级 `@playwright/test` 后重新执行安装命令。

## 日常预检

```powershell
npm run verify:ci
```

该命令包含：

| 本地步骤 | 具体检查 |
| --- | --- |
| `verify:frontend` | Biome lint、前端 Node 测试、TypeScript/Vite 生产构建和构建产物检查 |
| `verify:rust` | `cargo test --manifest-path src-tauri/Cargo.toml` |
| `verify:ui` | 启动临时 Vite 服务并运行全部 Playwright/Axe 工作区测试 |

提交涉及导航、页面标题、可访问性、布局或交互的修改时，必须执行完整的 `npm run verify:ci`。不要只运行 `npm run build`，因为构建不会访问浏览器中的真实导航和工作区。

## 定向检查

调试单一检查时可以执行：

```powershell
npm run verify:frontend
npm run verify:rust
npm run verify:ui
```

需要按严格 Playwright 模式执行时：

```powershell
npm run verify:strict
```

严格模式会保留前端和 Rust 检查，并使用 `test:e2e:strict` 拒绝 flaky test。UI 测试会自动选择空闲端口，不需要预先启动 `npm run dev`；已有开发服务器也不会被本地预检复用。

## 失败排查

- Playwright 失败时先查看 `test-results/playwright/` 的截图、trace 和 `error-context.md`；本地测试不会自动删除这些诊断文件。
- UI 测试失败应先单独执行 `npm run verify:ui`，再根据具体用例修复代码或测试。页面标题和导航清单由 `src/data/navigation.ts`、`src/data/modules.ts` 和中文资源生成，E2E 不再维护一份手写模块标题副本。
- 缺少浏览器时重新执行 `npx playwright install chromium`，不要把“没有浏览器”误判为业务测试通过。
- GitHub Actions 仍会在独立 runner 上重新执行完整检查；本地通过是前置保证，不替代 Action 结果。

## 发布边界

`npm run verify:ci` 不生成 Tauri 安装包，也不执行下位机 SCons 构建、CAN 总线测试或设备验收。发布前仍需按 [开发指南](development.md)、[稳定版更新检查](software-updates.md) 和目标固件项目的构建说明执行对应检查。
