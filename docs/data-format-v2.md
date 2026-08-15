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
| `battery_monitor` | 可选 | `.jcpro` 编辑态锂电协议模型；导出为二进制协议段 |
| `fault_code_info` | 可选 | 启用时故障文案必须引用消息 key |

禁止字段：

```text
language_info
```

检测到禁止字段时构建立即失败，不忽略、不迁移、不回落。

## 编辑文件与运行时清单

`battery_monitor` 的完整帧、信号、显示项和格式化规则只属于 jc002
`.jcpro` 编辑文件。导出器会将这些定义编码到 `data.bin` 的 battery v2
段；设备侧 `ConfigUpdate.json` 不复制该对象，只保留
`data_description.battery_monitor_base_addr`、条目数、帧数和版本等索引元数据。

因此，`ConfigUpdate.json` 和 `data.bin` 必须来自同一次导出，设备不得从 JSON
读取第二份 battery 协议定义。

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
  "fault_code_info": {
    "schema_version": 2,
    "enabled": true,
    "version": 2,
    "sources": [
      {
        "source_key": "traction",
        "source_id": 1,
        "type_char": "T",
        "can_id": 648,
        "frame_type": 0,
        "code_byte": 2,
        "clear_code": 0,
        "invalid_codes": [31],
        "enabled": true
      }
    ],
    "definitions": [
      {
        "fault_key": "fault.traction.052",
        "message_key": "fault.message.dc_bus_voltage_low",
        "severity": "fault",
        "enabled": true
      }
    ],
    "bindings": [
      {
        "source_key": "traction",
        "code": 52,
        "fault_key": "fault.traction.052",
        "enabled": true
      }
    ]
  }
}
```

- `sources[]` 只描述报码来源和取码规则。
- `definitions[]` 保存稳定故障身份、等级和多语言 `message_key`。
- `bindings[]` 把一个来源下的原始报码映射到故障定义。
- `source_key`、`fault_key` 和 `(source_key, code)` 必须分别唯一。
- 每个绑定必须引用已存在的来源和定义。
- 多个独立 `fault_key` 可以共享同一个 `message_key`；这表示文案复用，不是重复错误。
- 删除绑定不会删除定义或翻译。删除来源/定义时，编辑器必须先确认并级联删除引用绑定。
- 保存时来源按 ID、定义按 `fault_key`、绑定按来源和 code 稳定排序。
- v2 不接受 v1 的 `codes[]`，也不会从 `codes[]` 隐式迁移或回退。

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

#### `signals[]` 的关系字段

信号表中的 `signal_key` 和 `name` 作用不同：

| 字段 | 作用 | 示例 | 修改影响 |
| --- | --- | --- | --- |
| `signal_key` | 上位机编辑态的稳定关系键。`items[].signal_key` 通过它引用信号；导出时上位机再将它解析为信号表索引。 | `battery_voltage` | 修改后必须同步所有 `items[].signal_key` 引用；上位机编辑器会同步已有显示项。 |
| `name` | 信号的多语言文案 key。jc002 中必须指向 `localization` 中的消息 key，不是直接填写的中文或其他语言文本。 | `ui.battery.voltage` | 修改后必须同时在 `localization` 中维护同名 key，否则导出校验失败或设备侧无法取得该信号文案。 |

示例：

```json
{
  "signal_key": "battery_voltage",
  "name": "ui.battery.voltage",
  "frame_key": "battery_2f0",
  "pos": 0,
  "len": 16
}
```

这里 `battery_voltage` 是项目内部关系键，`ui.battery.voltage` 是用于查找多语言显示文本的 key。真正的中文、英文等文本应写在：

```json
{
  "localization": {
    "locales": {
      "zh": {
        "translations": {
          "ui.battery.voltage": "电池电压"
        }
      }
    }
  }
}
```

`signal_key` 应使用 ASCII、稳定且不包含当前显示顺序的名称；`name` 应遵循项目的消息 key 命名规则。两者都不应使用数组下标作为唯一依据。

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
