# jc002 固件动态多语言运行时

## 实现位置

目标下位机仓库：

```text
packages/artinchip/lvgl-ui/aic_demo/meter_6_test
```

分支：

```text
codex/jc002-full-config-support
```

核心文件：

- `CommonLocalization.h`：公开 API 和 `_()` / `_p()` 宏。
- `CommonLocalization.c`：`LVI2` 校验、locale、查询和复数规则。
- `jclib_ui.c`：按 `config_version` 分派 loader，并映射 v2 SDO 文本引用。
- `jclib_ui.c`：校验独立 `protocol_profiles` 清单与 bin 描述元数据，并记录三类已加载 Profile。
- `CommonLocalizationKeys.c/.h`：固定 UI 枚举到稳定消息 key 的生成映射。
- `LvglUpdateScreen.c`：更新入口允许明确的 `jc001` 或 `jc002` token。

## 初始化流程

```text
读取 ConfigUpdate.json
        ↓
验证 config_version == jc002 和 device.version
        ↓
验证 protocol_profiles 的 schema、三类 Profile ID、数量和独立 scope 索引
        ↓
bin_generate_jc002()
        ↓
拒绝 language_addr / language_code
        ↓
读取 data.bin，校验长度和 CRC16
        ↓
定位 i18n_base_addr / i18n_size
        ↓
lv_i18n_init_dynamic() 校验 LVI2 和 CRC32
        ↓
按持久化语言索引设置 locale
        ↓
校验 Profile 数量、scope/profile_id 和 data_description 一致
        ↓
映射 PDO/SDO，初始化成功后设置 schema=2
```

初始化失败返回现有 `JCLIB_ERR_CONFIG_*` 错误，不把 `global_flag_init_ok` 设为 1，也不调用 v1 语言表作为替代。

## 多协议 Profile、锂电与故障码协议

当前固件从一个 `data.bin` Profile Bundle 中分别选择并加载控制器、锂电和故障码 scope 的
payload。语言包同样按 Profile 独立构建：公共 localization 提供 locale 目录和顺序，每个
Profile overlay 只合并进自己的 LVI2 段。下位机无需知道 overlay JSON，只按所选 payload 的
i18n_base_addr/i18n_size 加载最终语言包。
上位机可以在同一个 jc002 项目维护独立的控制器、锂电和故障码 Profile 集合；这些独立
payload 都会进入同一个 bin，完整的 `protocol_profiles` 和 `battery_monitor` 编辑对象不会
复制到设备 JSON。即使只有单套协议，也必须显式提供一个 Profile：

```text
protocol_profiles.schema_version
protocol_profiles.controller_profiles[].profile_id/controller_family/controller_revision
protocol_profiles.battery_profiles[].profile_id/battery_family/battery_revision
protocol_profiles.fault_code_profiles[].profile_id/fault_family/fault_revision
data_description.protocol_profile_version
data_description.controller_profile_total
data_description.battery_profile_total
data_description.fault_code_profile_total
data_description.protocol_bundle_version = 1
data_description.protocol_profile_payloads[]
  scope / profile_id / base_addr / file_size / crc / description
```

下位机在 USB 升级检查、bin 描述复制和冷启动加载时校验这些字段以及整包/局部 CRC。任一侧
Profile 切换流程是：

1. 上位机在对应页面维护控制器、锂电和故障码 Profile；
2. 导出包含全部独立 scope payload 的 `ConfigUpdate.json` 与 `data.bin`；
3. 下位机高级设置分别写入各 scope 的选择后重启；
4. Common PDO loader 与 jc002 loader 按各自选择加载对应 payload。

当前不支持运行中切换，也不需要修改 `aic_ui.c` 或新增 `app_can_bottom.c`/`app_config.c`
协议入口。固件侧可通过以下 API 查看已加载身份：

```c
const char *jclib_get_active_controller_profile_id(void);
const char *jclib_get_active_battery_profile_id(void);
u32 jclib_get_controller_profile_total(void);
u32 jclib_get_battery_profile_total(void);
u32 jclib_get_protocol_profile_version(void);
```

## API

```c
int lv_i18n_init_dynamic(const void *data, size_t size);
int lv_i18n_set_locale(const char *locale_name);
const char *lv_i18n_get_current_locale(void);
const char *lv_i18n_get_text(const char *msg_id);
const char *lv_i18n_get_text_plural(const char *msg_id, int32_t num);
const char *lv_i18n_get_text_by_index(uint32_t message_index);
```

页面固定文本：

```c
lv_label_set_text(label, _("page.settings.title"));
lv_label_set_text_fmt(label, _p("fault.count", count), count);
```

配置驱动业务记录：

```c
const char *name = lv_i18n_get_text_by_index(record->message_index);
```

`message_index` API 返回 `NULL` 表示 index 无效或当前 locale 没有文本。它不会返回 key，因为业务记录不保存原始 key。

## 严格查询

普通消息：

```text
当前 locale 的 other
  -> NULL
```

复数消息：

```text
当前 locale 的 CLDR form
  -> 当前 locale 的 other
  -> NULL
```

按 index 查询：

```text
当前 locale 的 other
  -> NULL
```

禁止的 fallback：

- v1 `language_all_addr`。
- 中文原文。
- `JCLIB_LAN_*` 宏表。
- index 0。
- 其他任意 locale。
- 默认 locale。
- 原始消息 key。

## locale 切换

按名称：

```c
if (lv_i18n_set_locale("ru-RU") != 0) {
    /* locale 不存在，保持当前语言 */
}
```

按设置页面语言索引：

```c
if (CommonLocalization_SetLocaleIndex(language_index) != 0) {
    /* 索引越界，不修改当前语言 */
}
```

固件语言索引与项目 `localization.locale_order` 一一对应。发布前必须验证持久化索引、设置页面展示顺序和 locale_order 一致。

语言选择页的名称不再读取固定 locale label。LVI2 locale record 的 offset 12 保存目标
`language.name.<locale>` 的 `message_index`；`CommonLocalization_GetLocaleDisplayName()`
使用当前界面语言查询该索引，因此中文、英文和俄语界面可以显示不同的语言名称。语言名称
key 必须在所有 locale 中提供非空文本，Profile overlay 不得覆盖这组公共 key。

## SDO 文本读取

`jclib_menu_get_item_name_index()` 根据当前 schema 读取记录：

- v1：返回结构中的 `u16 name_index`。
- v2 菜单：组合 offset 2 的低 16 位和 offset 12 的高 16 位。
- v2 参数：读取 offset 2 的完整 `u32 message_index`。

`jclib_get_language_info_menu()` 在 v2 下调用 `lv_i18n_get_text_by_index()`，不会访问 `language_all_addr`。

`jclib_get_language_info()` 是旧固定枚举接口，在 v2 下返回 `NULL`。固定页面文案必须逐步迁移到 `_()`，不能把该接口重新接到 v1 表。

## 完整性和边界检查

运行时拒绝：

- 空数据、小于 40 bytes 的包或超过 `u32` 的包。
- magic 或 schema version 错误。
- 声明大小与实际大小不一致。
- CRC32 不一致。
- locale/message/translation 表越界或乘法溢出。
- default locale 越界。
- locale 名称或字符串无 NUL 终止符。
- key 的 FNV-1a hash 与记录不一致。

当前 C loader 已检查主要目录边界和 locale 字符串。Rust 解码器还检查每个 message key hash。目标固件构建前应继续补齐 C 端逐 message key 和全部字符串偏移验证，避免把首次查询推迟为错误发现时机。

## 测试

上位机 fixture：

```text
src-tauri/tests/fixtures/i18n/
├── jc001-valid.json
├── jc002-valid.json
├── jc002-invalid-order.json
├── jc002-missing-key.json
└── jc002-mixed-schema.json
```

Rust：

```powershell
cd src-tauri
cargo test --lib
```

固件宿主测试：

```powershell
cd packages/artinchip/lvgl-ui/aic_demo/meter_6_test
.\tests\run-host-tests.ps1
```

宿主测试覆盖：初始化、按 key 查询、未知 key 严格失败、locale 切换、禁止默认 locale fallback、俄语复数、按 index 查询、无效 index、未知 locale 和 CRC 损坏拒绝。脚本要求 PATH 中存在 `clang`、`gcc` 或 `cc`；找不到编译器时以退出码 2 明确跳过。

## 设备验收清单

1. 使用独立 v2 项目和独立导出目录。
2. 校验清单无 `language_*`，并含 `i18n_version=2`、`sdo_version=2`。
3. 校验 data.bin CRC16 和 `LVI2` CRC32。
4. 冷启动默认语言，检查普通文本和 SDO 菜单。
5. 切换俄语并重启，确认持久化索引与 `locale_order` 一致。
6. 检查俄语 1、2、5、11、21 等复数值。
7. 删除当前语言翻译，确认直接显示缺失诊断，不出现默认语言文本。
8. 删除消息 key，确认 key API 和 index API 都返回 `NULL`。
9. 损坏 data.bin 和 `LVI2` 各一次，确认初始化失败且不进入 v1。
10. 验证 SDO 读写、PDO 实时数据未因文本 ABI 改动发生偏移。

## 当前未完成项

- 固件 battery v2 52-byte item record 消费端。
- 目标 SCons 工具链构建、真实 LVGL 页面和设备验证。
- Inmotion6 以外大型配置的稳定 key 设计和显式迁移报告。

当前已接入动态包、固定 UI、SDO 和 fault 文本链路。battery 与目标设备验证完成前，不能声明 jc002 全业务设备端已经验收。
