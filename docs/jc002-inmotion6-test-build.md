# Inmotion6 jc002 完整测试构建

## 产物

- 项目：`TZ_70T_i18n_next/liugong_70T_Inmotion6.jc002.jcpro`
- 发布目录：`TZ_70T_i18n_next/jc_export_v2/`
- 清单：`jc_export_v2/ConfigUpdate.json`
- 二进制：`jc_export_v2/bin/data.bin`

当前构建包含 10 个 locale、561 个稳定消息 key、288 个故障定义、288 条来源绑定和完整 Inmotion6 SDO。127 个故障文案 key 被多个独立故障定义复用。项目声明了 3 个 CANopen 节点、2 个 SDO 通道和 5 个 PDO 通道，其中 `0x294`、`0x3C0` 使用显式 COB-ID。项目同时包含 jc002 `battery_monitor`，本包带 4 个锂电帧和 12 个锂电显示项。

## 可重复生成

```powershell
node scripts/migrate-jc001-i18n-v2.mjs `
  <liugong_70T_Inmotion6.generated.jcpro> `
  <liugong_70T_Inmotion6.jc002.jcpro> `
  <meter_6_test/jclib_ui.h> `
  <meter_6_test/CommonLocalizationKeys.c>

cargo run --manifest-path src-tauri/Cargo.toml --bin jc-cli -- `
  export package --document <liugong_70T_Inmotion6.jc002.jcpro> `
  --project-path <liugong_70T_Inmotion6.jc002.jcpro>
```

迁移器通过固件枚举名和中文注释匹配固定 UI，不使用 `list_inner` 数组位置。少量历史名称差异集中在脚本的 `legacyAliases`，新增文本集中在 `explicitMessages`。旧 jc001 故障码 MVP 不参与迁移；故障码必须在输出项目的 `fault_code_profiles[]` 中独立配置。

## 当前验证值

| 项目 | 值 |
| --- | ---: |
| data.bin size | 356825 bytes |
| CRC16-CCITT-FALSE | 1905 |
| LVI2 schema | 2 |
| locale count | 10 |
| message count | 561 |
| fault text ABI | 2 |
| fault code count | 288 |
| SDO text ABI | 2 |
| CANopen metadata | schema_version 1 |
| CANopen SDO table | 2 records, 12 bytes/record |
| PDO receive/send | 4 / 1 |
| battery frame/item | 4 / 12 |

清单不得包含 `language_addr` 或 `language_code`。下位机查询只读取当前 locale；缺失文本返回 `NULL`，不会回退默认 locale、中文、v1 表或原始 key。
