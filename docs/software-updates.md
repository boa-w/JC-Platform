# 软件更新与版本管理

本项目使用 Tauri v2 updater 插件进行应用内更新。前端版本弹层会检查 GitHub Release 中的 `latest.json`，发现新版本后下载、安装并重启应用。

正式版默认只检查 GitHub 的 latest stable release：

```text
https://github.com/boa-w/JC-Platform/releases/latest/download/latest.json
```

`main` 分支的 nightly 构建使用独立配置，只检查固定 nightly release：

```text
https://github.com/boa-w/JC-Platform/releases/download/nightly/latest.json
```

两个通道不会互相回退，避免稳定版用户被引导到预发布版本。

## 未保存修改保护

桌面端会把未保存项目的恢复草稿写入 Tauri 应用数据目录下的 `recovery/project-draft.json`，不受 WebView `localStorage` 容量限制。草稿通过同目录临时文件原子替换，且在更新重启前强制等待最新草稿落盘；写入失败时取消重启。旧版保存在 `localStorage` 的草稿会在项目首次打开时自动迁移并删除明文副本。

## 版本来源

`package.json` 是版本号的主来源。发布前先修改 `package.json` 的 `version`，然后运行：

```bash
npm run version:sync
```

构建前会自动运行：

```bash
npm run version:check
```

该检查会确保以下文件版本一致：

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

前端展示的 `APP_VERSION` 由 Vite 从 `package.json` 注入，不再手写版本号。

## Updater 发布配置

1. 生成 Tauri updater 签名密钥：

   ```bash
   npm run tauri signer generate -- -w $HOME/.tauri/jc-platform.key
   ```

2. 将公钥文件 `~/.tauri/jc-platform.key.pub` 的内容填入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`。
3. 将私钥配置到 GitHub 仓库 Secret：
   - `TAURI_SIGNING_PRIVATE_KEY`：填入 `~/.tauri/jc-platform.key` 文件的完整内容
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：填入生成密钥时输入的密码
4. 创建并发布 GitHub Release。

本地签名构建时可使用私钥文件路径：

```bash
TAURI_SIGNING_PRIVATE_KEY_PATH=$HOME/.tauri/jc-platform.key \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=你的私钥密码 \
npm run tauri:build -- --config src-tauri/tauri.updater.conf.json
```

PowerShell 示例：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME\.tauri\jc-platform.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="你的私钥密码"
npm run tauri:build -- --config src-tauri/tauri.updater.conf.json
```

PR 构建只验证应用构建。正式 Release 叠加 `src-tauri/tauri.updater.conf.json`，继承 stable endpoint 并生成 updater 产物。`main` 分支 push 叠加 `src-tauri/tauri.nightly.conf.json`，切换为 nightly endpoint 并生成签名文件和 `latest.json`。

## 正式发布前检查

本地可运行以下命令查看 stable 发布仍缺少的条件：

```bash
npm run release:check -- --channel stable --target x86_64-pc-windows-msvc
npm run release:check -- --channel stable --target aarch64-apple-darwin
```

检查内容包括版本与 Release tag 一致、stable updater 地址、updater 签名私钥、Windows Authenticode 配置，以及 macOS Developer ID 签名和 notarization 凭据。GitHub Release 构建会自动运行同一检查，任一条件缺失都会在安装包构建前失败，不会继续上传未签名的正式版。

Windows 需要在 Tauri 配置中设置 `bundle.windows.certificateThumbprint` 或 `bundle.windows.signCommand`。macOS CI 需要配置 `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`，并提供 Apple ID 或 App Store Connect API key 形式的 notarization 凭据。

## Nightly 发布

每次 `main` 分支有新提交时，GitHub Actions 会自动：

1. 根据 `package.json` 当前版本计算 nightly 版本号。
   - 例如当前版本 `0.1.0`
   - nightly 版本会构建为 `0.1.1-<run_number>`
   - Windows MSI 要求预发布标识只能是 `0..65535` 的数字，因此 nightly 版本不使用 `nightly.<run_number>` 这种带字母的格式。
2. 在删除旧 nightly 前保留上一版 Windows NSIS 安装包。
3. 删除并重建固定 tag/release：`nightly`。
4. 使用 updater 签名私钥构建 Windows/macOS 安装包。
5. Windows 依次执行安装冒烟测试；有历史包时追加跨版本升级和数据保留回归。
6. macOS 挂载 DMG 并验证 Bundle 标识、主程序启动和 app-data 草稿保留。
7. 所有平台验收通过后，独立 publish job 才会整理安装包、`.sig`、`latest.json` 和 `SHA256SUMS` 并上传。
8. `Normalize nightly assets` job 会把 action 上传的 `_0.1.1-xx_...` 资产重命名为 `JC-Platform_0.1.1-xx_...`，并生成可用于 Tauri updater 的 `latest.json`。

Nightly 构建只注入 `TAURI_SIGNING_PRIVATE_KEY` 来签署 updater 更新包，不注入 `APPLE_CERTIFICATE` 等 Developer ID 凭据，因此 macOS nightly 产物不会触发代码签名和 notarization。Apple 签名变量只在正式 GitHub Release 构建中注入，并由 stable 发布前检查强制校验；仓库中残留或无效的 Apple secret 不会阻断 nightly 构建。

`latest.json` 必须包含当前平台的下载 URL 和 `.sig` 文件内容，Tauri updater 会先校验签名再安装更新。不要手动把 `.sig` 文件路径写进 JSON。

stable macOS 构建在上传前还会强制执行 `codesign --verify`、`spctl --assess` 和 `xcrun stapler validate`，确保用户从网络下载后能通过 Gatekeeper。同一阶段会对 Windows NSIS、MSI 和安装后主程序执行 Authenticode 实体校验。构建 job 不直接写入 GitHub Release，避免在冒烟测试失败前已经公开未验证产物。
