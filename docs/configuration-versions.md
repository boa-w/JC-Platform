# 配置版本边界

## 目的

`jc001` 和 `jc002` 是两套独立的项目、发布清单和二进制契约，不是同一格式的可选字段组合。版本只由顶层 `config_version` 决定，任何组件都不得根据字段内容猜测版本。

| 契约 | `jc001` | `jc002` |
| --- | --- | --- |
| 项目语言段 | `language_info` | `localization` |
| 语言引用 | `u16` 编辑顺序索引 | `u32 message_index` |
| 发布清单 | `language_addr`、`language_code` | `i18n_*`、`sdo_version` |
| 语言二进制 | 每语言索引表和字符串块 | 单一 `LVI2` 动态包 |
| 故障项目模型 | `schema_version=1`、`codes[]` | `schema_version=2`、`definitions[]`、`bindings[]` |
| 固件入口 | `bin_generate()` | `bin_generate_jc002()` |
| 缺失文本 | v1 兼容规则 | 严格返回缺失，不做运行时回退 |

## 强制规则

1. `config_version` 必须是字符串，且只能为 `jc001` 或 `jc002`。
2. `jc001` 必须包含 `language_info`，并禁止包含 `localization`。
3. `jc002` 必须包含 `localization`，并禁止包含 `language_info`。
4. `jc001` 清单不得出现任何 `i18n_*` 字段或 `sdo_version`。
5. `jc002` 清单不得出现 `language_addr` 或 `language_code`。
6. v2 构建器不得调用 v1 的语言条目收集、文本索引或语言块编码函数。
7. v2 固件初始化失败时直接返回错误，不启动 v1 语言表。
8. 不允许通过中文原文、数组位置或旧宏名称自动生成稳定消息 key。
9. `jc001` 故障段只接受 `codes[]`；`jc002` 故障段只接受 `definitions[]` 和 `bindings[]`，禁止混用。

## 文件与部署隔离

- v1 和 v2 项目应使用不同文件名，不在同一文件中保留另一版本的语言段。
- v1 和 v2 发布包应输出到不同目录，禁止共享同一个 `jc_export` 后再增量覆盖。
- `ConfigUpdate.json` 与 `data.bin` 必须来自同一次构建；不能混用不同版本或不同构建批次的文件。
- `message_index` 只在同一次 v2 二进制构建内有效，不写回项目文件，也不是跨版本稳定 ID。

## 文档导航

- v1 项目格式：[data-format.md](data-format.md)
- v1 导出格式：[export-build.md](export-build.md)
- v2 项目格式：[data-format-v2.md](data-format-v2.md)
- v2 导出和 ABI：[export-build-v2.md](export-build-v2.md)
- v2 固件运行时：[firmware-i18n-v2.md](firmware-i18n-v2.md)

## 当前实现状态

| 能力 | 状态 |
| --- | --- |
| 上位机 v1/v2 schema 互斥校验 | 已实现并测试 |
| `LVI2` 编码、解码、CRC 和复数 | 已实现并测试 |
| v2 SDO、锂电、故障文本引用编码 | 已实现 |
| 固件 v2 `LVI2` 加载和 SDO 名称查询 | 已实现，待目标固件构建和设备验证 |
| 固件 v2 fault 记录消费 | 已接入 12-byte code record 严格查询，待目标构建和设备验证 |
| 固件 v2 battery 记录消费 | 尚未完整接入；当前 Inmotion6 测试项目不含 battery 段 |
| 固定页面 UI | 通过生成的枚举到稳定 key 表接入；缺失当前语言文本返回 `NULL` |
| Inmotion6 业务测试迁移 | `scripts/migrate-jc001-i18n-v2.mjs` 可重复生成；其他项目仍需显式设计稳定 key |
