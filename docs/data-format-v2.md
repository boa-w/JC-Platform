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
  "protocol_profiles": {
    "schema_version": 2,
    "controller_profiles": [
      {
        "profile_id": "controller.default",
        "controller_family": "generic",
        "controller_revision": "",
        "protocol": {
          "pdo_global_param": [],
          "pdo_condition": [],
          "pdo_recv": [],
          "pdo_send": [],
          "sdo_info": {}
        }
      }
    ],
    "battery_profiles": [],
    "fault_code_profiles": []
  }
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
| `protocol_profiles` | 必填 | jc002 唯一协议来源，必须包含三类 Profile 数组 |
| `protocol_profiles.controller_profiles` | 必填且非空 | PDO、SDO 和可选 CANopen 的持久化来源 |
| `protocol_profiles.battery_profiles` | 必填数组，可为空 | 锂电监控协议的持久化来源 |
| `protocol_profiles.fault_code_profiles` | 必填数组，可为空 | 故障码目录的持久化来源 |
| `pdo_simple_send_recv` | 禁止 | 仅作为 CSV/Excel 导入的临时输入，转换后不得写回 jc002 |
| 根级 PDO/SDO/CANopen/锂电/故障字段 | 禁止 | 不保留编辑镜像，不自动迁移或回退 |

禁止字段：

```text
language_info
```

检测到禁止字段时加载、保存和构建均立即失败，不忽略、不迁移、不回落。

### PDO 导入边界

实时数据页的“导入并转换 PDO”入口可以读取简化表头：

```text
主目录,帧ID,帧类型,帧描述,绑定变量名称,取数方式,开始位置,数据长度
```

导入过程先校验表格，再调用简单 PDO 转换器生成四个高级段：
`pdo_global_param`、`pdo_condition`、`pdo_recv`、`pdo_send`。有名称的变量按稳定名称生成
`param_id`，同名变量复用同一个全局参数；没有名称的旧行按 `pdo_param_index` 生成独立内部
参数。转换不会根据 `pdo_param_index` 反推业务名称：高级参数的 `name` 来自用户配置，
`inner` 只表示是否绑定下位机内部变量。转换报告会返回帧数、信号数、生成参数数和警告，
只有转换成功后才更新项目。

jc002 保存、另存为和构建都会拒绝残留的 `pdo_simple_send_recv`。简化表转换必须由用户
在实时数据页显式执行；转换结果直接写入当前控制器 Profile 的高级四段。jc002 不读取
历史根级协议段，也不提供自动迁移或 fallback；jc001 的简化 PDO 逻辑只属于 v1 路径。

### 下位机内部变量绑定 ABI

高级 PDO 全局参数中的 `inner` 是下位机 `CommonCanPdoConfig` 的运行时绑定，不是上位机
参数索引，也不能从 `name` 或多语言文案推断：

| 值 | 含义 |
| --- | --- |
| `-1` | 不绑定下位机内部变量；该参数不会进入内部变量索引表 |
| `0..16` | 使用 `CommonCanPdoConfig.h` 定义的固定内部变量 ID |

当前 ABI 的代码、数字和显示标签维护在
[`common-can-pdo-inner-abi.json`](../src/data/common-can-pdo-inner-abi.json) 中。上位机页面
只允许从这份清单选择绑定值，并保留 `param_id`、`name` 与 `inner` 三种独立含义。构建会
拒绝清单之外的 ID，避免把一个看似合法的数字写入 bin 后被下位机解释成错误的运行时变量。

控制器 Profile 各自维护自己的 `pdo_global_param[].inner`；切换控制器时，PDO 信号和其
内部变量绑定一起切换。Profile overlay 只管理文案，不改变这个运行时绑定。

## 独立协议 Profile

`protocol_profiles` 的 `schema_version=2` 明确分开三类协议：

```json
{
  "protocol_profiles": {
    "schema_version": 2,
    "controller_profiles": [
      {
        "profile_id": "inmotion",
        "controller_family": "Inmotion",
        "controller_revision": "2.x",
        "localization_overlay": {
          "locales": {
            "en-US": {
              "translations": {
                "controller.inmotion.speed": "Traction speed"
              }
            }
          }
        },
        "protocol": {
          "pdo_global_param": [],
          "pdo_condition": [],
          "pdo_recv": [],
          "pdo_send": [],
          "sdo_info": {},
          "canopen": {}
        }
      }
    ],
    "battery_profiles": [
      {
        "profile_id": "bms-a",
        "battery_family": "Lithium-A",
        "battery_revision": "1.x",
        "localization_overlay": {
          "locales": {
            "en-US": {
              "translations": {
                "battery.bms_a.status": "BMS status"
              }
            }
          }
        },
        "protocol": {
          "battery_monitor": {
            "schema_version": 2,
            "enabled": true,
            "version": 2,
            "frames": [],
            "signals": [],
            "items": []
          }
        }
      }
    ],
    "fault_code_profiles": [
      {
        "profile_id": "fault.default",
        "fault_family": "generic",
        "fault_revision": "2.x",
        "protocol": {
          "fault_code_info": {
            "schema_version": 2,
            "enabled": true,
            "version": 2,
            "sources": [],
            "definitions": [],
            "bindings": []
          }
        }
      }
    ]
  }
}
```

规则：

- `controller_profiles` 必须非空；`battery_profiles` 和 `fault_code_profiles` 可以为空。
- 三个集合分别保证 `profile_id` 唯一；不同集合允许使用相同的 ID，因为它们是独立命名空间。
- 控制器 Profile 只包含 PDO、SDO 和可选 CANopen；锂电 Profile 只包含
  `battery_monitor`，禁止交叉嵌套。
- 故障码 Profile 只包含 `fault_code_info`，且必须使用 `definitions[]` 与 `bindings[]`；
  jc002 不接受历史 MVP 的 `codes[]`。
- localization 是公共语言目录，统一维护 locale 集合、默认语言和语言顺序。每个
  Profile 可选 localization_overlay，只能引用公共 locale；overlay 可以覆盖公共 key，
  也可以新增当前 Profile 专属 key。
- 各 Profile 的 overlay 独立归属于自己的 payload；上位机不把控制器、锂电和故障码强行
  组合，也不替用户判断三者是否兼容。需要组合校验时由下位机选择和启动检查负责。
- `protocol_profiles` 是 jc002 持久化的唯一协议来源。协议编辑器在内存中可以根据当前
  页面选择将一个 Profile 投影到编辑表单，但该投影不会写回根级字段。
- `active_*_profile_id` 仅是上位机编辑态选择，不属于 jc002 canonical 文件，不写入 `.jcpro`、
  `ConfigUpdate.json` 或 `data.bin`。下位机根据自身设置选择 Profile，Profile 之间不在
  上位机构建时做兼容性组合判断。
- 构建器分别为每个控制器、锂电和故障码 Profile 生成独立的 self-contained payload，按
  Profile 数组顺序写入同一个 `data.bin`。可选集合为空时不生成对应 scope payload。
  `data_description.protocol_profile_payloads[]` 记录 `scope`、`profile_id`、整包偏移、长度、
  CRC 和段内描述；它不是控制器/锂电/故障码组合表。
- 单协议项目也必须显式创建一个 Profile，使用与多 Profile 完全相同的 Bundle 结构；缺少
  `protocol_profiles` 或出现根级协议字段都会失败。

### 同一 jcpro 的 Profile 编辑流程

上位机把 Profile 管理分成三个独立入口：CANopen 页操作
`controller_profiles`，锂电监控页操作 `battery_profiles`，故障码页操作
`fault_code_profiles`。即使可选的 `canopen` 拓扑段
尚未初始化，CANopen 页仍显示控制器 Profile 管理栏；每个入口都提供当前 Profile
选择、复制、删除、ID 重命名、备注以及族/版本编辑。协议编辑器将当前 Profile 投影到
表单，统一同步函数会在每次修改时写回对应数组；根级协议字段不会被创建或持久化。

Profile ID 是各数组内的稳定引用键，遵守以下规则：

- 同一 Profile 数组内唯一；控制器、锂电和故障码可以使用相同 ID；
- 非空，最多 63 个 UTF-8 字节；
- 上位机编辑器内存中会记录当前选择；保存时不会把选择字段写入 jcpro；
- 复制会生成唯一 ID 并切换到复制项，原 Profile 不被修改；
- 删除会弹窗确认，控制器数组不能删除最后一项；锂电和故障码数组可以为空。

因此，一个项目可以保存例如 ACM、Inmotion6、default 和 BMS-A 等独立 Profile，导出时各
Profile 都会进入同一个 `data.bin`：

```text
controller_profiles: ACM, Inmotion6
battery_profiles: default, BMS-A
fault_code_profiles: generic, inmotion
                 ↓
          data.bin payload[controller:ACM]
          data.bin payload[controller:Inmotion6]
          data.bin payload[battery:default]
          data.bin payload[battery:BMS-A]
          data.bin payload[fault:generic]
          data.bin payload[fault:inmotion]
```

保存 `.jcpro` 会保留全部数组。下位机选择任意一侧 Profile 后重启生效；上位机只负责提供
完整 Profile 信息，不验证控制器与锂电是否适配，也不写入默认组合。

## 编辑文件与运行时清单

`battery_monitor` 的完整帧、信号、显示项和格式化规则只属于 jc002
`.jcpro` 编辑文件。导出器会将这些定义编码到 `data.bin` 的 battery v2
段；设备侧 `ConfigUpdate.json` 不复制该对象，只保留
`data_description.battery_monitor_base_addr`、条目数、帧数和版本等索引元数据。

因此，`ConfigUpdate.json` 和 `data.bin` 必须来自同一次导出，设备不得从 JSON
读取第二份 battery 协议定义。

## CANopen 传输拓扑

v2 使用可选的 `canopen` 段显式描述 CANopen 节点、SDO 通道和 PDO 通信参数。
它是项目的协议语义层，不会把电池或故障协议大对象复制到设备清单；现有
`pdo_recv`、`pdo_send` 仍是二进制映射数据的唯一来源。

```json
{
  "canopen": {
    "schema_version": 1,
    "nodes": [
      {
        "node_id": 7,
        "name": "油泵控制器",
        "role": "remote",
        "sdo": {
          "cob_id_mode": "default",
          "client_to_server_cob_id": 1543,
          "server_to_client_cob_id": 1415
        }
      },
      { "node_id": 64, "name": "仪表", "role": "local" }
    ],
    "pdos": [
      {
        "key": "pump_fault",
        "direction": "receive",
        "pdo_type": "tpdo",
        "cob_id": 660,
        "cob_id_mode": "explicit",
        "frame_type": 0,
        "producer_node_id": 7,
        "consumer_node_ids": [64],
        "pdo_number": 2,
        "consumer_pdo_number": 1,
        "transmission_type": 255,
        "source_section": "pdo_recv",
        "source_index": 3
      }
    ]
  }
}
```

规则：

- `node_id` 为 1..127 且不能重复；SDO 默认 COB-ID 为 `0x600 + node_id` 和
  `0x580 + node_id`，需要不同值时将 `cob_id_mode` 设为 `explicit`。
- `direction` 是本机运行时的 receive/send 视角；`pdo_type` 是
  `producer_node_id` 在 CANopen 中的端点类型。当前拓扑描述的是一条由生产者发出的
  PDO，因此生产者端通常为 `tpdo`，同一条连接在 `consumer_node_ids` 对应节点上导出为
  `rpdo`。这样不会把“本机发送给远端”误标成生产者 RPDO。
- `cob_id_mode: explicit` 允许任意合法的标准/扩展 COB-ID。标准帧范围为
  `0x000..0x7FF`，扩展帧范围为 `0x000..0x1FFFFFFF`；因此 `0x3C0`、`0x294`
  都是有效的显式 CANopen PDO COB-ID，不应再按默认连接集推断节点。
- `source_section` 和 `source_index` 必须与 `pdo_recv`/`pdo_send` 中的 `id`、
  `type` 一致。映射数据仍由对应源帧写入 v2 二进制 PDO 描述表。
- `pdo_number` 表示生产者端节点的 RPDO/TPDO 通信参数编号，范围为 1..4；
  `consumer_pdo_number` 表示消费者端节点的 RPDO 通信参数编号，范围同为 1..4。
  两者属于不同端点，必须分别检查同一节点上的编号冲突；未提供
  `consumer_pdo_number` 时，消费者沿用 `pdo_number`。自定义 COB-ID 仍可以绑定到
  明确的 PDO 编号。`transmission_type` 使用 CANopen 的
  0..240、254、255 值，当前固件只使用已构建的静态发送调度。
- 当前 v2 范围覆盖 SDO expedited 读写和 PDO 静态映射，不包含 NMT、Heartbeat、
  EMCY、SYNC。后续扩展必须增加独立版本字段，不应复用 `canopen` v1 字段。

设备端 `data.bin` 的 PDO 描述记录已经保存原始 COB-ID 和帧类型；CANopen 节点的
SDO 通道另以固定 12 字节记录保存 `node_id`、client-to-server COB-ID 和
server-to-client COB-ID。设备只读取清单中的地址/数量索引，不解析完整 `canopen`
JSON，也不会因为清单不携带节点拓扑而丢失 `0x3C0`、`0x294` 或显式 SDO ID。

当 `canopen_version=1` 时，`canopen_sdo_base_addr` 和
`canopen_sdo_total` 必须同时出现；没有 SDO 通道时使用 `-1` 和 `0`。下位机
对所有通道执行标准帧范围、节点唯一性和 COB-ID 唯一性校验，失败则拒绝整包。

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
          "language.name.en-US": "English",
          "language.name.ru-RU": "Russian",
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
          "language.name.en-US": "Английский",
          "language.name.ru-RU": "Русский",
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

### 语言名称 key

语言选择页的名称也是普通稳定消息，不再使用 `locale_labels` 元数据字段。每个启用
locale 必须自动拥有以下 key，并且每个 locale 都必须提供非空字符串：

```text
language.name.<locale>
```

例如 `language.name.ru-RU` 在中文、英文和俄语目录中分别可以是“俄语”、
`Russian` 和 `Русский`。key 由 locale code 确定，不允许自定义映射、删除、重命名或
放入 Profile overlay。上位机在语言管理页单独展示这组系统 key；语言代码新增、删除或
修改时同步维护对应 key。下位机按照当前界面语言查询目标语言名称，仍受现有语言选择页
最多 10 项的 UI 容量限制。

语言表格导入导出也使用这组 key：v2 表格的“类型”列将它们标记为“语言名称”，`auto`
列写入 `language.name.<locale>`。这些行不进入 `list_inner`，但会保留在 `list_translate`；
导入时必须为每个 locale 提供一行，不能用旧版按位置推断语言名称。

## 稳定消息 key

## Profile overlay

Profile overlay 是公共目录上的局部补丁，不拥有独立的 `default_locale` 或
`locale_order`：

```json
{
  "localization_overlay": {
    "locales": {
      "ru-RU": {
        "translations": {
          "controller.inmotion.speed": "Скорость тяги",
          "menu.root": "Меню Inmotion"
        }
      }
    }
  }
}
```

- `localization_overlay.locales` 的语言代码必须出现在公共 `localization.locale_order` 中。
- overlay 中的 key 可以是公共 key 的覆盖，也可以是当前 Profile 新增的稳定 key。
- 导出每个 Profile scope 时，按“公共目录 → 当前 Profile overlay”合并，合并后的完整目录
  独立编码为该 payload 的 `LVI2` 段。不同 scope 的 overlay 不互相覆盖。
- 公共语言页负责语言集合、顺序和 `language.name.*`；Profile 语言作用域只允许编辑 overlay，公共 key
  在 Profile 作用域中不可删除或重命名。

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

故障码目录的持久化来源是 `protocol_profiles.fault_code_profiles[]`；根级
`fault_code_info` 在 jc002 中禁止存在。故障码 Profile 与控制器、锂电 Profile 独立管理，
导出器分别把各自的 payload 写入同一个 `data.bin`。

```json
{
  "protocol_profiles": {
    "fault_code_profiles": [
      {
        "profile_id": "fault.default",
        "fault_family": "traction",
        "fault_revision": "2.x",
        "protocol": {
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
- jc002 fault Profile 不接受历史 MVP 的 `codes[]`，也不会从 `codes[]` 隐式迁移或回退。

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
