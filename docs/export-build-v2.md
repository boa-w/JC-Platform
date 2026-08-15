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
    "i18n_message_total": 0
  }
}
```

v2 禁止字段：

```text
language_addr
language_code
```

### battery v2 的清单边界

`.jcpro` 中的 `battery_monitor` 是上位机编辑模型，包含完整的帧、信号、显示项和
格式化定义。导出时这些内容只写入 `data.bin` 的 battery v2 段。

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
| 6 | `u16` | reserved |
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
| 12 | `u32` | reserved |

plural rule ID：0 中日韩等无复数；1 英语型；2 俄语型；3 阿拉伯语型；4 法语/葡萄牙语型。

### Message record：16 bytes

| Offset | 类型 | 字段 |
| ---: | --- | --- |
| 0 | `u32` | FNV-1a hash |
| 4 | `u32` | 原始 key 字符串偏移 |
| 8 | `u8` | 全 locale 复数形式位掩码 |
| 9 | 3 bytes | reserved |
| 12 | `u32` | reserved |

运行时先按 hash 二分，再比较原始 key，不能只依赖 hash。

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
