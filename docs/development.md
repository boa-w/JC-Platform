# 开发指南

## 环境要求

- Node.js 20+
- npm 10+
- Rust stable
- Cargo
- Windows 10/11
- WebView2 Runtime

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
