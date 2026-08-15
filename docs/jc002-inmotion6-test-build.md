# Inmotion6 jc002 完整测试构建

## 产物

- 项目：`TZ_70T_i18n_next/liugong_70T_Inmotion6.jc002.jcpro`
- 发布目录：`TZ_70T_i18n_next/jc_export_v2/`
- 清单：`jc_export_v2/ConfigUpdate.json`
- 二进制：`jc_export_v2/bin/data.bin`

当前构建包含 10 个 locale、572 个稳定消息 key、288 条 fault code 和完整 Inmotion6 SDO。原项目没有 `battery_monitor`，因此该测试包不包含 battery 段。

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

迁移器通过固件枚举名和中文注释匹配固定 UI，不使用 `list_inner` 数组位置。少量历史名称差异集中在脚本的 `legacyAliases`，新增文本集中在 `explicitMessages`。

## 当前验证值

| 项目 | 值 |
| --- | ---: |
| data.bin size | 358679 bytes |
| CRC16-CCITT-FALSE | 33816 |
| LVI2 schema | 2 |
| locale count | 10 |
| message count | 572 |
| fault text ABI | 2 |
| fault code count | 288 |
| SDO text ABI | 2 |

清单不得包含 `language_addr` 或 `language_code`。下位机查询只读取当前 locale；缺失文本返回 `NULL`，不会回退默认 locale、中文、v1 表或原始 key。
