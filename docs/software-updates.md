# 软件更新与版本管理

本项目使用 Tauri v2 updater 插件进行应用内更新。前端版本弹层会检查
GitHub Release 中的 `latest.json`，发现新版本后下载、安装并重启应用。

正式版默认只检查 GitHub 的 latest stable release：

```text
https://github.com/boa-w/JC-Platform/releases/latest/download/latest.json
```

`main` 分支的 nightly 构建使用独立配置，只检查固定 nightly release：

```text
https://github.com/boa-w/JC-Platform/releases/download/nightly/latest.json
```

两个通道不会互相回退，避免稳定版用户被引导到预发布版本。

## 版本来源

`package.json` 是版本号的主来源。发布前先修改 `package.json` 的 `version`，
然后运行：

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

2. 将公钥文件 `~/.tauri/jc-platform.key.pub` 的内容填入
   `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`。
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

PR 构建只验证应用构建。正式 Release 叠加
`src-tauri/tauri.updater.conf.json`，继承 stable endpoint 并生成 updater 产物。
`main` 分支 push 叠加 `src-tauri/tauri.nightly.conf.json`，切换为 nightly endpoint
并生成签名文件和 `latest.json`。

## Nightly 发布

每次 `main` 分支有新提交时，GitHub Actions 会自动：

1. 根据 `package.json` 当前版本计算 nightly 版本号。
   - 例如当前版本 `0.1.0`
   - nightly 版本会构建为 `0.1.1-<run_number>`
   - Windows MSI 要求预发布标识只能是 `0..65535` 的数字，因此 nightly 版本不使用 `nightly.<run_number>` 这种带字母的格式。
2. 删除并重建固定 tag/release：`nightly`。
3. 使用 updater 签名私钥构建 Windows/macOS 安装包。
4. 由 `tauri-apps/tauri-action` 上传安装包和 `.sig`。
5. `Normalize nightly assets` job 会把 action 上传的 `_0.1.1-xx_...` 资产重命名为
   `JC-Platform_0.1.1-xx_...`，并生成可用于 Tauri updater 的 `latest.json`。

`latest.json` 必须包含当前平台的下载 URL 和 `.sig` 文件内容，Tauri updater
会先校验签名再安装更新。不要手动把 `.sig` 文件路径写进 JSON。
