# jc002 项目数据格式

## 格式定位

`jc002` 是独立于 `jc001` 的 JSON 项目契约。它使用稳定消息 key 和动态 locale 目录表达设备多语言，不保留 `language_info`，也不承诺被旧版编辑器或旧固件读取。

最小顶层结构：

```json
{
  "config_version": "jc002",
  "device": {
    "version": "jxc_7size_meter",
    "resolution_w": 800,
    "resolution_h": 480
  },
  "ui_info": { "main": { "item": {} } },
  "localization": {},
  "pdo_global_param": [],
  "pdo_condition": [],
  "pdo_recv": [],
  "pdo_send": [],
  "sdo_info": {}
}
```

完整可运行示例见 [jc002-valid.json](../src-tauri/tests/fixtures/i18n/jc002-valid.json)。

## 顶层契约

| 字段 | 要求 | 说明 |
| --- | --- | --- |
| `config_version` | 必填，固定 `jc002` | 唯一版本判定来源 |
| `device` | 必填 | 固件型号和屏幕信息 |
| `ui_info` | 完整发布包必填 | 构建 `screen_src` |
| `localization` | 必填 | v2 唯一语言来源 |
| `pdo_*` | 按项目需要 | 基础 PDO 数据 |
| `sdo_info` | 当前固件部署必填 | v2 loader 当前要求 `sdo_version=2` |
| `battery_monitor` | 可选 | 启用时文本字段必须引用消息 key |
| `fault_code_info` | 可选 | 启用时故障文案必须引用消息 key |

禁止字段：

```text
language_info
```

检测到禁止字段时构建立即失败，不忽略、不迁移、不回落。

## localization

```json
{
  "localization": {
    "default_locale": "en-US",
    "locale_order": ["en-US", "ru-RU"],
    "locales": {
      "en-US": {
        "enabled": true,
        "direction": "ltr",
        "translations": {
          "menu.root": "Menu",
          "fault.count": {
            "one": "%d fault",
            "other": "%d faults"
          }
        }
      },
      "ru-RU": {
        "enabled": true,
        "translations": {
          "menu.root": "Меню",
          "fault.count": {
            "one": "%d ошибка",
            "few": "%d ошибки",
            "many": "%d ошибок",
            "other": "%d ошибки"
          }
        }
      }
    }
  }
}
```

### default_locale

- 必填。
- 必须出现在 `locale_order` 中。
- 对应 locale 必须启用。
- 仅用于初始化语言索引，不作为运行时翻译回退来源。

### locale_order

- 必填数组，是固件语言索引 ABI 的唯一顺序来源。
- 必须无重复地列出全部启用 locale，不能漏项或包含禁用项。
- JSON 对象 `locales` 的成员顺序没有 ABI 意义。
- 调整数组顺序会改变固件语言索引，必须与语言选择设置同步发布和测试。

### locales

每个 key 是规范 locale 名，例如 `en-US`、`ru-RU`。locale 对象字段：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `enabled` | boolean | 缺省为 `true` |
| `direction` | `ltr` 或 `rtl` | 可省略；阿拉伯语等会自动判为 RTL |
| `translations` | object | 启用 locale 必填 |

### translations

消息值有两种形式：

```json
"menu.root": "Menu"
```

```json
"fault.count": {
  "zero": "...",
  "one": "...",
  "two": "...",
  "few": "...",
  "many": "...",
  "other": "..."
}
```

- key 不能为空。
- 普通字符串编码为 `other` 形式。
- 复数对象至少包含一个有效形式。
- 空字符串不写入动态包，运行时按缺失翻译处理。
- 所有 locale 的 key 合并为消息目录；业务对象引用的非空 key 必须存在于目录中。

## 稳定消息 key

推荐命名：

```text
page.settings.title
menu.controller.speed_limit
battery.pack_voltage.name
battery.pack_voltage.unit
fault.traction.010
common.state.enabled
common.state.disabled
```

规则：

1. key 表达业务语义，不使用中文原文。
2. key 不包含翻译内容、数组下标或当前显示顺序。
3. 重命名 key 视为 schema 变更，需要同步全部业务引用。
4. 同一含义复用同一 key；不同上下文即使中文相同，也应使用不同 key。
5. 项目中保存 key，构建时才解析为临时 `message_index`。

## 业务对象引用

### SDO

v2 SDO 菜单和参数必须提供：

```json
{
  "name": "仅供编辑器显示",
  "message_key": "menu.controller.speed_limit"
}
```

编码器只从 `message_key`、其次 `name_key` 取得 v2 文本引用；不会把 `name` 当作 key。

### 故障码

```json
{
  "code": 10,
  "message_key": "fault.traction.010"
}
```

v2 项目应使用 `message_key`。`name_key`、`name` 的读取仍存在于共享解析函数中，但不应作为新 v2 文件规范使用。

### 锂电监控

以下字段在 v2 中解释为消息 key，而不是显示文本：

- signal `name`
- item `name_key`
- item `fallback_name`
- item `unit`
- formatter `true_text` / `false_text`
- validity `empty_text`

非空值必须存在于 `localization` 消息目录。空值编码为 `0xFFFFFFFF`，表示无文本引用。

## 校验失败条件

- 缺少或错误的 `config_version`。
- 同时存在 `localization` 和 `language_info`。
- 缺少 `default_locale`、`locale_order` 或 `locales`。
- `locale_order` 重复、漏项或引用禁用 locale。
- 启用 locale 缺少 `translations`。
- 消息 key 为空或复数对象无有效形式。
- SDO、锂电或故障对象引用不存在的消息 key。

任何上述错误都会使二进制报告 `valid=false`，完整发布包不会写出。

## 不属于本格式的内容

- React 应用自身的 `src/i18n/locales/*.json`。
- v1 `language_info.list_inner/list_translate`。
- `JCLIB_LAN_*` C 枚举和宏。
- 构建生成的 `message_index`。
