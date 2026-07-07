# 软件更新与版本管理

本项目使用 Tauri v2 updater 插件进行应用内更新。前端版本弹层会检查
GitHub Release 中的 `latest.json`，发现新版本后下载、安装并重启应用。

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

普通 push/PR 构建不会生成 updater artifacts。Release 构建会额外使用
`src-tauri/tauri.updater.conf.json`，生成并上传安装包、签名文件和 `latest.json`。
