# 自定义开发平台

基于 Tauri 2 + React + Rust 的仪表设备配置工具，用于管理 UI 资源、CAN 协议参数和多语言翻译，最终导出设备二进制配置包。

## 技术栈

- **前端**：React 18 + TypeScript + Vite
- **桌面端**：Tauri 2
- **后端**：Rust (serde, calamine, thiserror)

## 功能模块

1. **项目管理**：创建、打开、保存 `.jcpro` 项目文件。
2. **项目版本**：复用项目所在的 Git 仓库，提交受管配置并查看、恢复历史版本。
3. **UI 资源编辑**：管理仪表 UI 图片、动画帧、坐标和资源导出路径。
4. **PDO 简化配置**：维护接收表/发送表、CAN 帧和系统内部变量绑定。
5. **PDO 高级配置**：维护全局变量、条件表、CAN 数据项和底层协议结构。
6. **SDO 参数配置**：维护 SDO 菜单树、权限、CAN Open 参数、数据类型和预处理。
7. **多国语言**：自动收集翻译项、编辑翻译表、导入导出 CSV/XLS。
8. **项目导出**：生成 `jc_export`、图片资源、JSON 描述和设备二进制文件。

## 目录结构

```text
src/                         React + TypeScript 前端
  api/                       Tauri command 调用封装
  components/                通用组件
  data/                      静态模块定义
  pages/                     页面级组件
  stores/                    前端状态边界
  styles/                    样式
  types/                     前端类型
  utils/                     工具函数

src-tauri/                   Rust / Tauri 后端
  src/commands/              Tauri 命令入口
  src/domain/                领域模型
  src/infrastructure/        文件、JSON、表格、二进制适配层
  capabilities/              Tauri 权限配置

docs/                        项目文档
```

## 开发命令

安装依赖：

```bash
npm install
```

启动前端开发服务器：

```bash
npm run dev
```

启动 Tauri 桌面应用：

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

Windows 安装包冒烟测试（需先生成 NSIS 安装包）：

```powershell
npm run test:installer:windows
```

该测试会在临时目录静默安装应用，确认主进程能启动，然后静默卸载并校验安装目录已清理。
如果 `previous-installer` 目录中有上一版 NSIS 安装包，可运行：

```powershell
npm run test:upgrade:windows
```

升级测试会验证旧版安装、新版覆盖升级、主程序替换和启动，并确认外部
`.jcpro` 项目与 app-data 恢复草稿在升级和卸载后保持不变。

## CI 构建产物

GitHub Actions 会构建 Windows 与 macOS 桌面应用：

- Windows：冒烟验证 NSIS 安装、启动和卸载；存在上一版 nightly 时追加跨版本升级回归，然后上传 `.msi` / `.exe` 安装包。
- macOS：挂载 DMG，验证 Bundle 元数据、主程序启动和 app-data 保留后，上传 `.dmg` / `.app` 产物。

nightly macOS 产物可以未签名；stable Release 必须通过 Developer ID 签名、Gatekeeper
评估和 notarization ticket 验证，否则流水线不会上传产物。
