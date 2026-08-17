# jc001 数据格式与 `.jcpro` 架构

> 本文只定义 `config_version: "jc001"`。`jc002` 不继承本文的 `language_info`、保存裁剪或语言索引规则。v2 请阅读 [jc002 项目数据格式](data-format-v2.md)，版本互斥规则见 [配置版本边界](configuration-versions.md)。
>
> 基于 jc001 的重构外挂 JSON（sidecar）机制已废弃，仅保留历史项目查看、迁移和兼容保存；新项目和新功能不得继续采用该机制。

## 格式定位

`.jcpro` 是面向旧版设备工具和固件配置链路的 JSON 项目文件，不是一个新的二进制格式。历史兼容流程会把 `.jcpro`、可选 v1 废弃重构 sidecar 和迁移默认值合成为一个完整编辑文档；保存和导出分别使用不同的裁剪/构建规则。

```text
编辑态完整文档
├── 旧版项目段：可直接保存到 .jcpro，也作为设备导出的兼容输入
└── 重构专属段：signal_dictionary / private_protocol / protocol_mapping
    └── .jcpro 项目使用同名 .refactor-config.json 保存
```

## `.jcpro` 项目文件

项目文件扩展名为 `.jcpro`，本质是 JSON 文件。

新建和保存的兼容版本标记为 `config_version: "jc001"`。加载旧文件时，应用会补齐必要段落，并在编辑态使用 `0.1.0-tauri-refactor` 作为迁移版本标记；这不代表保存后的 `.jcpro` 会使用该版本字符串。

### 顶层段落

| 字段 | 类型 | 用途 | 保存/导出角色 |
| --- | --- | --- | --- |
| `config_version` | string | 项目格式版本 | `.jcpro` 保存为 `jc001`；清单也使用 `jc001` |
| `project` | object | 项目名称、来源、目录和时间 | 项目元数据 |
| `export_info` | object | 发布目录和目标开关 | 控制导出路径、文件名和扩展段 |
| `device` | object | 设备分辨率等设备信息 | 写入清单 |
| `ui_info` | object | Logo、主页面和 UI 资源 | 生成 `screen_src` 并复制 `img/` |
| `pdo_simple_send_recv` | object | 面向表格的简化 PDO | 无高级 PDO 内容时转换为导出输入 |
| `pdo_global_param` | array | 高级 PDO 全局参数 | 二进制全局参数表 |
| `pdo_condition` | array | PDO 条件表达式 | 二进制条件表 |
| `pdo_recv` | array | 高级 PDO 接收帧 | 二进制 PDO 接收段 |
| `pdo_send` | array | 高级 PDO 发送帧 | 二进制 PDO 发送段 |
| `sdo_info` | object | SDO 菜单树和参数 | 二进制 SDO 段 |
| `language_info` | object | 语言代码、内部键和翻译值 | 二进制语言块、表格交换 |
| `fault_code_info` | object | 故障来源和故障码 | 可选二进制扩展段和清单描述 |
| `signal_dictionary` | object | 历史统一业务信号字典 | 编辑态；`.jcpro` 保存到 v1 废弃 sidecar |
| `private_protocol` | object | 私有协议帧模型 | 编辑态；`.jcpro` 保存到 v1 废弃 sidecar |
| `protocol_mapping` | array | Signal 到传输协议的映射 | 编辑态；`.jcpro` 保存到 v1 废弃 sidecar |

`history_ui` 等旧文件中可能存在的额外段会被保留；兼容格式化会优先按照已知字段排序，未知字段放在已知字段之后。

兼容保存的标准顶层顺序为：

```text
config_version → device → project → export_info → ui_info → language_info
→ fault_code_info → pdo_simple_send_recv → pdo_global_param → pdo_condition
→ pdo_recv → pdo_send → sdo_info → history_ui
```

顺序主要用于生成稳定 diff，不改变 JSON 语义。

## project

描述项目元数据。

常见字段：

- `name`
- `from`
- `base_path`
- `create_time`
- `update_time`

`project.base_path` 是旧项目资源定位的补充信息；实际加载资源时优先根据当前项目文件路径解析相对图片路径。

## export_info

```json
{
  "folder_name": "jc_export",
  "manifest_filename": "ConfigUpdate.json",
  "binary_filename": "pdo_sdo_data.bin",
  "fault_code_info": { "config": true, "bin": true }
}
```

- `folder_name`：输出目录名，默认为 `jc_export`；路径会被限制为最后一级目录名。
- `manifest_filename`：清单文件名，自动补 `.json`。
- `binary_filename`：二进制文件名，自动补 `.bin`。
- 每个扩展目标都有独立的 `config` 和 `bin` 开关：`bin` 控制是否打包二进制段，`config` 控制清单是否暴露对应配置描述。

缺少这些字段时，编辑器和 Rust 后端会按各自的默认值补齐；已有项目的其他字段不会被默认值覆盖。

## device

设备段当前至少包含：

- `resolution_w`
- `resolution_h`

导出时原样写入 `ConfigUpdate.json` 的 `device` 字段。

## ui_info

推荐结构为对象，而不是数组：

```json
{
  "logo": {
    "name": "开机 Logo",
    "x": 0,
    "y": 0,
    "w": 800,
    "h": 480,
    "handle": "show",
    "default_option": 0,
    "dest": ["logo/CustomerLogo"],
    "option": ["image/logo/logo.png"]
  },
  "main": { "name": "主界面", "item": {} }
}
```

资源项常见字段：

- `name`、`x`、`y`、`w`、`h`
- `handle`
- `default_option`
- `dest`
- `option`
- `pdo_param_index`

`handle` 决定 `option` 的解释方式：

| `handle` | `option` 形式 | 导出行为 |
| --- | --- | --- |
| `show` | 图片路径字符串数组 | 复制到 `img/`，清单中生成一个资源项 |
| `list` | `{ "list": [图片路径...] }` 数组 | 每个目标路径对应一张图片 |
| `anim` | `base_name`、`start_index`、`total`、`reserved`、`type` | 生成连续帧，复制到 `img/anim/`，清单带 `p_num` |

导出只使用 `default_option` 指向的选项。解析时会把负索引和越界索引归一化到可用范围；如果没有可用选项、资源文件缺失或 `dest` 为空，会产生警告或错误，`dest` 为空的资源不会生成设备端清单项。

## pdo_simple_send_recv

简化 PDO 配置，用于接收表/发送表和 UI 数据绑定。

```json
{
  "pdo_recv": [],
  "pdo_send": []
}
```

每个 CAN 帧包含：

- `id`
- `type`
- `desc`
- `data`

每个数据项包含：

- `pos`
- `len`
- `show_type`
- `pdo_param_index`
- 可选的 `pdo_param_name`

简单 PDO 主要用于表格编辑和兼容旧版配置。构建二进制时，若高级 PDO 没有有效内容，导出器会收集所有 `pdo_param_index`，生成临时全局参数 ID（`SIMPLE...`），再转换成与高级 PDO 相同的内部文档。

## 高级 PDO

高级 PDO 使用四个并列段：

- `pdo_global_param`：`param_id`、`name`、`def`、`reserved`、`type`、`inner`；
- `pdo_condition`：输出参数 `param_id`、处理类型 `process` 和输入参数 `data[]`；
- `pdo_recv` / `pdo_send`：`id`、`type`、`desc` 和 `data[]`；
- `data[]`：`pos`、`len`、`show_type`、`handle`、`handle_param`、`param_id`。

`data[].param_id` 引用 `pdo_global_param[].param_id`。二进制构建会按全局参数、索引、条件、接收帧、发送帧的顺序写入，并用帧数据是否引用条件参数决定帧描述中的触发标志。

## sdo_info

SDO 菜单树。

根节点通常包含：

- `type`
- `user_auth`
- `name_index`
- `name`
- `children`

参数节点常见字段：

- `control_protocol`
- `control_rw`
- `control_use_default`
- `control_use_min_max`
- `handle`
- `handle_param`
- `fid`
- `mid`
- `sid`
- `data_default`
- `data_min`
- `data_max`
- `pre_handle`
- `pre_handle_scale`
- `pre_handle_offset`
- `pre_handle_decimal`

根节点和菜单节点都使用 `children` 递归表达层级；参数节点以 `type: 1` 表示，并携带 CANopen 索引、子索引、读写控制、默认值、上下限、句柄和预处理字段。导出器会把树展平为设备端菜单记录，并为有子节点的记录写入子节点地址和数量。

## battery_monitor

jc001 不再定义锂电监控解析段。锂电监控已统一使用 jc002 的 Battery V2 契约，字段、消息 key 和二进制布局见 [v2 数据格式](data-format-v2.md#锂电监控)。

## fault_code_info

顶层字段为 `schema_version`、`enabled`、`version`、`sources[]` 和 `codes[]`。

- `sources[]` 定义来源 key/ID、类型字符、CAN ID、帧类型、取码字节、清除码和无效码；
- `codes[]` 定义来源引用、数值 code、等级、`message_key`/名称和启用状态。

保存为兼容 `.jcpro` 时，编辑态的 `groups`、`bindings`、`generated_from_group` 和 `group_key` 等重构生成辅助字段会被裁剪；设备文件只接收已展开的来源和故障码记录。

## language_info

多语言配置。

结构：

```json
{
  "list_code_language": ["zh", "en"],
  "language_labels": { "zh": "中文", "en": "英文" },
  "list_inner": ["确认", "取消"],
  "list_translate": {
    "确认": {
      "zh": "确认",
      "en": "OK"
    }
  }
}
```

- `list_code_language` 的顺序就是设备语言块的顺序；
- `list_inner` 保存语言名称和普通翻译项的有序键列表；
- `list_translate[key][code]` 保存每个键在各语言中的文本；
- jc001 导出器只收集 SDO 和故障码的旧语言条目；锂电监控不属于 jc001 发布包。

## 统一协议编辑段和 v1 废弃 sidecar

### `signal_dictionary`

```json
{
  "signals": [{
    "signal_id": "VEHICLE_SPEED",
    "name": "速度",
    "data_type": "u16",
    "default_value": "0",
    "inner": 0,
    "scale": { "scale_num": 1, "scale_den": 1, "offset": 0, "decimals": 0 },
    "display": { "unit": "km/h", "format": "decimal", "description": "" }
  }]
}
```

Signal 描述“是什么数据”，不直接描述 CAN 位域；传输位置由 `protocol_mapping` 决定。

### `private_protocol`

包含 `enabled` 和 `frames[]`。每个私有帧包含帧 ID、`frame_key`、帧类型、周期、校验、字节序、来源以及 `payload[]`；载荷项通过 `signal_id` 关联业务信号，并定义 bit offset/length。

### `protocol_mapping`

每一项包含 `signal_id` 和 `target`。目标类型包括：

- `can_open_sdo`：`index`、`subindex`；
- `can_open_pdo`：方向、帧 ID、位偏移和位长度；
- `private_frame`：帧 key、帧 ID、位偏移和位长度。

统一协议解析优先使用显式映射；没有显式映射时，会从旧版 CANopen/私有协议段推导兼容映射。“拍平统一协议”只回写 `pdo_global_param`、`pdo_recv` 和 `pdo_send`，不会覆盖 SDO、简化 PDO 或私有协议段。

### sidecar 文件（已废弃）

标准 sidecar 名称为 `<项目名>.refactor-config.json`，结构如下：

```json
{
  "config_version": "0.1.0-tauri-refactor-sidecar",
  "source_project": "D:/projects/demo.jcpro",
  "project": { "name": "demo" },
  "signal_dictionary": { "signals": [] },
  "private_protocol": { "enabled": false, "frames": [] },
  "protocol_mapping": []
}
```

打开 `.jcpro` 时，历史兼容流程会自动查找同名 `.refactor-config.json`，也会尝试同名 `.json`。合并时只覆盖上述三个重构专属段，sidecar 的 `project` 仅作为记录，不覆盖主项目元数据。保存 `.jcpro` 时，主文件只保留旧格式兼容字段，重构专属段写入已挂载 sidecar；若没有 sidecar，兼容保存动作会提示创建一个。该路径已废弃，jc002 不读取、不创建也不写入 sidecar。

## 表格导入导出

### SDO 表头

```text
主菜单名称,主菜单权限,子菜单名称,子菜单权限,参数名称,使用权限,协议类型,帧ID,主索引,子索引,读写权限,最大值,最小值,默认值,数据类型,bit开始位置,bit长度,数据预处理,缩放值,偏移值,保留小数
```

### PDO 简化表头

```text
主目录,帧ID,帧类型,帧描述,绑定变量名称,取数方式,开始位置,数据长度
```

### 多语言表头

```text
序号,类型,auto,中文_zh,英文_en,...
```

表格是交换视图，不是项目文件的第二个权威来源。导入流程先校验表头，再逐行转换为对应 JSON 段；导出流程从当前 JSON 段重新生成表格。单语言 CSV 导入只填充项目已存在且为空的目标语言值，不会覆盖已有翻译，也不会把未知 key 自动加入项目。
