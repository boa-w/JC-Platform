# jc002 发布包与二进制 ABI

## 发布边界

v2 发布包必须由 `config_version: "jc002"` 项目单独构建。不要把 v2 文件写入现有 v1 发布目录，也不要混用另一批次的清单和二进制。

```text
<v2-output>/jc_export_v2/
├── ConfigUpdate.json
├── bin/
│   └── pdo_sdo_data.bin
└── img/
```

目录名可配置；`jc_export_v2` 是建议命名，不是当前默认值。

## ConfigUpdate.json

核心结构：

```json
{
  "config_version": "jc002",
  "protocol_profiles": {
    "schema_version": 2,
    "controller_profiles": [
      { "profile_id": "acm", "controller_family": "ACM", "controller_revision": "1.x" },
      { "profile_id": "inmotion", "controller_family": "Inmotion", "controller_revision": "2.x" }
    ],
    "battery_profiles": [
      { "profile_id": "bms-a", "battery_family": "Lithium-A", "battery_revision": "1.x" }
    ],
    "fault_code_profiles": [
      { "profile_id": "fault.default", "fault_family": "generic", "fault_revision": "2.x" }
    ]
  },
  "device": { "version": "jxc_7size_meter" },
  "screen_src": {},
  "data_description": {
    "update": true,
    "format": "bin",
    "src": "bin/pdo_sdo_data",
    "dest": "bin/data",
    "file_size": 0,
    "crc": 0,
    "sdo_base_addr": 0,
    "sdo_version": 2,
    "i18n_base_addr": 0,
    "i18n_size": 0,
    "i18n_version": 2,
    "i18n_locale_total": 0,
    "i18n_message_total": 0,
    "protocol_profile_version": 2,
    "controller_profile_total": 2,
    "battery_profile_total": 1,
    "fault_code_profile_total": 1,
    "protocol_bundle_version": 1,
    "protocol_profile_payloads": [
      {
        "scope": "controller",
        "profile_id": "inmotion",
        "base_addr": 0,
        "file_size": 0,
        "crc": 0,
        "description": { "file_size": 0, "crc": 0 }
      }
    ]
  }
}
```

`protocol_profiles` 只是一段升级身份元数据，不是协议定义。上位机从项目中的控制器
Profile、锂电 Profile 和故障码 Profile 分别构建多个自包含 PDO、SDO、i18n、fault 和
可选 battery v2 payload，顺序写入同一个 `data.bin`；清单只记录三类 Profile 的身份和
payload 索引，避免把锂电帧、信号和显示项复制到 JSON。即使只有单套协议，也必须显式
提供一个 Profile，使用同一套 Bundle ABI。
下位机在升级前和启动加载时校验整包 CRC、选中 payload CRC 和索引一致性。

当前 ABI 是一个包含多套自描述 payload 的发布包；选中 payload 重定位后仍是一套运行时表：

```text
项目 controller_profiles[N] + battery_profiles[M] + fault_code_profiles[K]
          ↓ 分别生成独立 scope payload
controller payloads + battery payloads + fault payloads
           ↓
ConfigUpdate.json 身份/索引 + data.bin payload bundle
           ↓ 更新后重启
下位机按自身保存的各 scope 选择重定位对应 jc002 payload
```

因此切换 ACM/Inmotion 或不同锂电协议时，上位机只需在对应页面维护 Profile 并重新导出
整包；最终选择由下位机高级设置完成。当前下位机不在运行中切换协议，选择写入持久化设置
后重启读取对应 payload，也不读取设备 JSON 中的完整 Profile 定义。

上位机的 Profile 选择只存在于编辑器内存：CANopen 页面选择控制器 Profile，锂电页面选择
锂电 Profile，故障码页面选择故障码 Profile。复制或重命名 Profile 会修改 `.jcpro` 中相应
数组；协议编辑器的 PDO/SDO/battery/fault 改动会写回当前数组项。保存 `.jcpro` 时不会
写入 `active_*_profile_id`，导出器也不会把选择写入 manifest 或 `data.bin`。

例如同一文件可以长期保存以下组合素材：

```text
controller_profiles: [acm, inmotion6]
battery_profiles: [default, bms-a]
fault_code_profiles: [generic, inmotion]
```

需要切换到 ACM 时，设备在高级设置中选择 `acm`，无需修改 jcpro 的格式；上位机只需确保
`acm` Profile 已包含在本次发布包中。锂电和故障码同理，三个 scope 可以独立选择，是否能
搭配由下位机策略决定。

v2 禁止字段：

```text
language_addr
language_code
```

### display_data 清单段

如果项目声明了 jc002 根级 `display_data`，导出器会在 `ConfigUpdate.json` 顶层原样
写入该段。它是显示数据的规范化元数据，不会伪装成现有 `pdo_sdo_data.bin` 的固定
40 字节 SDO v2 记录，也不会改变二进制段地址。

小时计的运行时语义由以下链路组成：

```text
0x40 23 20 0F 00 00 00 00
          │
          ├─ 0x4B：Byte4~5，小端 U16，整数小时
          └─ 0x43：Byte4~7，小端 U32，0.1小时/bit
                         │
                         └─ parameter_ref -> 0:整数 / 1:一位小数
```

导出校验会检查响应命令字和原始类型匹配（`0x4B`/`u16`、`0x43`/`u32`）、取值范围、
字节偏移、非零 `scale_den`、格式引用以及 `format_selector.parameter_ref` 是否能在
控制器 Profile 的 `sdo_info.parameter_id` 中找到。选择参数的 SDO 对象仍由普通 SDO
菜单和二进制记录描述；`display_data` 只负责把同一个显示值的多个响应来源统一起来。

### battery v2 的清单边界

`.jcpro` 中 `battery_profiles[].protocol.battery_monitor` 是上位机编辑模型，包含完整的
帧、信号、显示项和格式化定义。导出时这些内容只写入 `data.bin` 的 battery v2 段。

因此，jc002 的 `ConfigUpdate.json` 不包含顶层 `battery_monitor` 大对象，只在
`data_description` 中提供以下运行时索引：

| 字段 | 含义 |
| --- | --- |
| `battery_monitor_base_addr` | battery v2 header 在 data.bin 中的偏移 |
| `battery_monitor_item_total` | 二进制显示项数量 |
| `battery_monitor_frame_total` | 二进制帧数量 |
| `battery_monitor_version` | battery 二进制 ABI 版本，当前为 `2` |

设备运行时从该地址读取 header、帧表、信号表和显示项表；清单与二进制必须来自同一
次构建，不能单独替换其中一个文件。

### v2 专属字段

| 字段 | 含义 |
| --- | --- |
| `sdo_version` | SDO 文本引用 ABI；当前固定为 `2` |
| `i18n_base_addr` | `LVI2` 包相对 data.bin 起始偏移 |
| `i18n_size` | `LVI2` 包字节数 |
| `i18n_version` | 动态包 schema；当前固定为 `2` |
| `i18n_locale_total` | 启用 locale 数量 |
| `i18n_message_total` | 消息目录条目数 |

其他 PDO、屏幕资源和可选段字段沿用公共导出名称，但记录中的文本字段按本页定义的 v2 ABI 编码。

## PDO 构建输入

`jc002` 的 `data.bin` 只从高级 PDO 四段读取：

```text
pdo_global_param + pdo_condition + pdo_recv + pdo_send
```

`pdo_simple_send_recv` 不属于 v2 项目文件，也不会作为构建 fallback。CSV/Excel 简化表只
能通过上位机实时数据页的“导入并转换 PDO”入口使用；转换报告通过后，四段会写回当前控制器
Profile。构建请求若残留简单段或任何根级协议字段会直接失败。

全局参数的 `inner` 在构建前还要通过 CommonCanPdo 固定 ABI 校验。`-1` 表示不绑定，
`0..16` 必须对应上位机随附的
[`common-can-pdo-inner-abi.json`](../src/data/common-can-pdo-inner-abi.json)；未知值或非
整数值会使构建失败。通过校验的绑定才会写入全局参数索引表，记录格式仍为
`param_index + inner_id`，下位机不读取参数名称。

## 总体布局

```text
[全局参数和默认值]
[全局参数索引]
[条件表]
[PDO 接收]
[PDO 发送]
[battery v2，可选]
[fault v2，可选]
[SDO v2]
[LVI2 动态语言包]
```

- 基础整数、浮点数和地址均为小端。
- `data_description` 段地址相对于 data.bin 起始位置。
- `LVI2` 内部偏移也相对于 `LVI2` 包自身起始位置。
- data.bin 的清单 CRC 是 CRC16-CCITT-FALSE；`LVI2` 另有独立 CRC32。

## 消息目录和 message_index

构建器收集所有 locale 的消息 key，并按以下顺序排序：

```text
FNV-1a 32-bit hash 升序 -> 原始 UTF-8 key 字典序
```

排序位置即 `message_index`。业务段保存 `u32 message_index`，但项目文件始终保存稳定 key。

重要限制：

- 新增、删除或重命名任何 key 都可能改变多个 index。
- 业务段和 `LVI2` 必须来自同一次构建。
- `0xFFFFFFFF` 只表示可选的空文本引用。
- 非空 key 不存在时构建失败，不能编码为 index 0。

## LVI2 动态语言包

### Header：40 bytes

| Offset | 类型 | 字段 |
| ---: | --- | --- |
| 0 | `u32` | magic，字节为 `LVI2` |
| 4 | `u16` | schema version，固定 2 |
| 6 | `u16` | flags，固定为 `I18N_FLAG_LOCALE_NAME_KEYS = 1` |
| 8 | `u32` | total size |
| 12 | `u16` | locale count |
| 14 | `u16` | default locale index |
| 16 | `u32` | message count |
| 20 | `u32` | locale table offset |
| 24 | `u32` | message table offset |
| 28 | `u32` | translation table offset |
| 32 | `u32` | UTF-8 string pool offset |
| 36 | `u32` | CRC32 |

CRC32 使用多项式 `0xEDB88320`。计算时把 header 的 36..39 字节视为 0，覆盖完整包。

### Locale record：16 bytes

| Offset | 类型 | 字段 |
| ---: | --- | --- |
| 0 | `u32` | locale 名称字符串偏移 |
| 4 | `u32` | 本 locale 翻译表偏移 |
| 8 | `u16` | plural rule ID |
| 10 | `u16` | direction：0 LTR，1 RTL |
| 12 | `u32` | 目标 locale 的语言名称 `message_index` |

plural rule ID：0 中日韩等无复数；1 英语型；2 俄语型；3 阿拉伯语型；4 法语/葡萄牙语型。

### Message record：16 bytes

| Offset | 类型 | 字段 |
| ---: | --- | --- |
| 0 | `u32` | FNV-1a hash |
| 4 | `u32` | 原始 key 字符串偏移 |
| 8 | `u8` | 全 locale 复数形式位掩码 |
| 9 | 3 bytes | reserved |
| 12 | `u32` | reserved |

运行时先按 hash 二分，再比较原始 key，不能只依赖 hash。语言名称记录必须精确指向
`language.name.<locale>`，并通过当前 locale 的普通翻译表读取显示文本。

### Translation table

布局顺序：

```text
locale -> message_index -> zero, one, two, few, many, other
```

每项是 `u32` UTF-8 字符串偏移。`0xFFFFFFFF` 表示缺失。字符串池中的所有文本和 key 都以 NUL 终止。

## SDO v2 记录

SDO 段没有独立 header；清单 `sdo_version=2` 和顶层 `config_version=jc002` 共同决定解释方式。

### 菜单节点：40 bytes

| Offset | 类型 | 字段 |
| ---: | --- | --- |
| 0 | `u16` | menu control |
| 2 | `u16` | message_index 低 16 位 |
| 4 | `u32` | children address |
| 8 | `u32` | child total |
| 12 | `u16` | message_index 高 16 位 |
| 14 | 26 bytes | reserved |

### 参数节点：40 bytes

| Offset | 类型 | 字段 |
| ---: | --- | --- |
| 0 | `u16` | menu control |
| 2 | `u16` | message_index 低 16 位 |
| 4 | `u16` | message_index 高 16 位（复用 v1 reserve） |
| 6 | `u8` | SDO control，后续业务字段偏移与 v1 相同 |
| 7 | `u8` | handle |
| 8 | `u32` | handle param |
| 12 | `u8` | fid |
| 13 | `u16` | mid |
| 15 | `u8` | sid |
| 16 | `u32` | default |
| 20 | `f32` | min |
| 24 | `f32` | max |
| 28 | `u32` | current |
| 32 | `u16` | calculation flags |
| 34 | `i16` | scale |
| 36 | `f32` | offset |

## Battery v2 文本 ABI

header 第 2 个 `u16` 为文本 ABI 版本，v2 固定为 2。frame record 仍为 12 bytes，signal record 仍为 32 bytes，item record 为 52 bytes。

signal record 的 offset 28 保存 `u32 name_message_index`。

item record：

| Offset | 类型 | 字段 |
| ---: | --- | --- |
| 0 | `u16` | signal index |
| 2 | `u32` | name message index |
| 6 | `u32` | fallback name message index |
| 10 | `u16` | frame index |
| 12 | `u8` | enabled |
| 13 | `u8` | order |
| 14 | `u8` | value type |
| 15 | `u8` | formatter kind |
| 16 | `f32` | formatter offset |
| 20 | `f32` | scale numerator |
| 24 | `f32` | scale denominator |
| 28 | `u8` | decimals |
| 29 | `u8` | display base |
| 30 | `u32` | unit message index |
| 34 | `u32` | true text message index |
| 38 | `u32` | false text message index |
| 42 | `u32` | empty text message index |
| 46 | `u16` | timeout ticks |
| 48 | 4 bytes | reserved |

## Fault v2 文本 ABI

fault header offset 2 的 `u16` 为文本 ABI 版本，v2 固定为 2。source record 保持 16 bytes，code record 为 12 bytes：

| Offset | 类型 | 字段 |
| ---: | --- | --- |
| 0 | `u8` | type character |
| 1 | `u8` | fault code |
| 2 | `u32` | message index |
| 6 | `u8` | severity |
| 7 | `u8` | reserved |
| 8 | 4 bytes | reserved |

## 校验顺序

上位机：

1. 校验项目版本和语言段互斥。
2. 构建 `LVI2` message catalog。
3. 解析所有业务 message key；缺 key 立即记为错误。
4. 构建业务段和 `LVI2`。
5. 写入段地址、数量、版本和 CRC。
6. 清单移除所有 v1 语言字段。

固件：

1. 只接受明确 `jc002`。
2. 拒绝清单中的 `language_addr/language_code`。
3. 校验 data.bin 声明长度和 CRC16。
4. 要求 `i18n_version=2`、`sdo_version=2`。
5. 校验 `i18n_base_addr + i18n_size` 不越界。
6. 校验 `LVI2` magic、版本、目录范围、字符串和 CRC32。
7. 任一步失败直接返回错误，不加载 v1 语言表。
