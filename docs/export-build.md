# jc001 导出文件构建机制

> 本文只定义 `config_version: "jc001"` 的发布清单、旧索引语言块和二进制 ABI。`jc002` 使用独立的 `LVI2` 包和 `u32 message_index`，详见 [jc002 发布包与二进制 ABI](export-build-v2.md)。禁止用本文规则解释 v2 文件。

## 导出目标

项目导出把当前完整编辑文档转换为设备更新流程使用的目录。默认目标为项目目录下的 `jc_export`，也可以在导出页面修改输出根目录和三个名称设置：

```text
<output_dir>/<folder_name>/
├── ConfigUpdate.json
├── bin/
│   └── pdo_sdo_data.bin
├── img/
│   └── <静态图片>
└── img/anim/
    └── <动画帧>
```

默认文件名来自 `.jcpro` 的 `export_info`：

```json
{
  "folder_name": "jc_export",
  "manifest_filename": "ConfigUpdate.json",
  "binary_filename": "pdo_sdo_data.bin"
}
```

请求参数中的名称优先于文档中的名称；空值使用默认值。目录名只保留最后一级，文件名只保留文件名部分，并分别补齐 `.json` 和 `.bin` 扩展名。

## 两个阶段

导出引擎提供两个相互独立的阶段：

1. `build_project_export_plan`：只分析，不写文件，返回目标目录、路径、屏幕资源清单、二进制数据描述、错误和警告；
2. `export_project_package_command`：执行完整写出，返回实际复制文件、二进制报告和清单路径。

“构建二进制报告”和“复制 UI 图片”也可以单独执行，用于预览或排查，不会自动生成完整发布包。

## 完整执行顺序

```text
读取请求和 export_info
        ↓
解析 ui_info，检查资源路径和默认选项
        ↓
构建 PDO/SDO/扩展协议/语言二进制报告
        ↓
生成 screen_src 和 data_description 计划
        ↓ 计划无错误
清理并创建导出目录
        ↓
复制 img/ 和 img/anim/ 资源
        ↓
写入 bin/<binary_filename>
        ↓
生成并写入 <manifest_filename>
```

计划或二进制构建存在错误时，不进入目录清理和文件写出。写出过程不是事务，不提供回滚；如果复制、二进制写入或清单写入中途失败，目标目录可能已经包含部分新文件。

完整导出会清理目标下已有的 `img/` 和 `bin/`，再重新创建 `img/anim/`；输出根目录下的其他文件不会被统一清理。单独执行“复制 UI 图片”时也会清理并重建 `img/` 和 `img/anim/`，但不会清理 `bin/`，也不会写入二进制或清单。

## `ConfigUpdate.json`

清单是兼容旧版更新程序的 JSON，核心结构如下：

```json
{
  "config_version": "jc001",
  "device": {
    "resolution_w": 800,
    "resolution_h": 480
  },
  "screen_src": {
    "update": true,
    "num": 2,
    "page_01": { "name": "page_logo", "num": 0 },
    "page_02": { "name": "page_main", "num": 0 }
  },
  "data_description": {
    "update": true,
    "format": "bin",
    "src": "bin/pdo_sdo_data",
    "dest": "bin/data",
    "file_size": 0,
    "crc": 0,
    "language_code": [],
    "language_addr": []
  }
}
```

实际清单还会包含各数据段的地址和数量。地址是相对于二进制文件起始位置的字节偏移；未生成的段使用 `-1` 地址和 `0` 数量。`src`、`dest` 是设备更新流程使用的逻辑路径，不是本地绝对路径。当前 `data_description.src` 默认保持兼容值 `bin/pdo_sdo_data`；即使通过 `export_info` 修改了本地二进制文件名，实际写出路径仍是 `bin/<binary_filename>`，清单中的逻辑 `src` 不会自动改成自定义文件名。

### `screen_src`

当前兼容输出固定包含两个页面：

- `page_01` / `page_logo`：来自 `ui_info.logo`；
- `page_02` / `page_main`：来自 `ui_info.main.item`。

资源项包含 `x`、`y`、`w`、`h`、设备端 `dest`、资源 `src` 和 `format`；动画项额外包含 `p_num`。清单只使用每个资源的 `default_option`：

- `show`：复制一张图片到 `img/`，`src` 通常去掉 `.png`/`.jpg` 扩展名；
- `list`：按 `dest` 和图片源一一配对复制到 `img/`；
- `anim`：复制连续帧到 `img/anim/`，按旧版命名规则生成 `src` 和 `p_num`。

资源源路径先按项目文件目录解析相对路径，绝对路径直接使用。清单中的路径使用 `/`，实际文件写入使用当前操作系统路径。

## `data_description`

`data_description` 是设备定位二进制段的索引，不是二进制文件的重复内容。

| 字段 | 含义 |
| --- | --- |
| `file_size` | 二进制字节数，不包含额外的 CRC 尾部 |
| `crc` | 对整个二进制字节流计算的 CRC16-CCITT-FALSE |
| `global_param_base_addr` / `global_param_total` | 全局参数表地址和条数 |
| `global_param_index_base_addr` / `global_param_index_total` | `inner` 有效的全局参数索引表地址和条数 |
| `global_condition_base_addr` / `global_condition_total` | 条件表地址和条数 |
| `pdo_recv_base_addr` / `pdo_recv_total` | PDO 接收段地址和帧数 |
| `pdo_send_base_addr` / `pdo_send_total` | PDO 发送段地址和帧数 |
| `fault_code_base_addr` | 故障码扩展段地址 |
| `fault_source_total` / `fault_code_total` | 故障来源数和故障码数 |
| `fault_code_version` | 故障码二进制版本 |
| `sdo_base_addr` | SDO 菜单树地址 |
| `language_addr` | 每种语言文本块的起始地址数组 |
| `language_code` | 与 `language_addr` 同序的语言代码数组 |

当 `config` 关闭时，清单会删除对应扩展段的描述字段；当 `bin` 关闭时，二进制不会包含该段，但如果 `config` 仍开启，清单会保留该扩展配置，地址和数量会被置为未生成状态。两个开关独立存在：例如可以让配置对象进入清单但不写入二进制，或写入二进制但隐藏其清单描述；设备部署时应保持两者的意图一致。

## 二进制输入选择

导出器按以下规则取得 PDO 输入：

1. 解析高级段 `pdo_global_param`、`pdo_condition`、`pdo_recv`、`pdo_send`；
2. 高级段有内容时使用高级 PDO 文档；
3. 高级段没有有效内容时，从 `pdo_simple_send_recv` 收集 `pdo_param_index`，生成临时全局参数和高级帧结构，再使用同一套打包器。

统一协议段不会在二进制构建时自动替代旧 PDO 段。统一协议编辑完成后，需要先执行“拍平统一协议”，把合法映射写回高级 PDO 段；否则设备导出可能仍使用旧的 PDO 配置。

## `pdo_sdo_data.bin` 布局

所有基础整数、浮点数和地址按小端序写入。整体布局从低地址到高地址为：

```text
[全局参数表]
[全局参数默认值区]
[全局参数索引表]
[条件表达式表]
[PDO 接收帧描述 + 数据项]
[PDO 发送帧描述 + 数据项]
[故障码段，可选]
[SDO 菜单树]
[语言块 × 语言数量]
```

每个段的起始位置由构建时当前 `bytes.len()` 记录到 `data_description`，所以新增或删除前置段会使后续地址整体变化。

### 基础 PDO 段

- 全局参数表记录默认值区的偏移、数据类型和保留信息；默认值区按参数数据宽度写入；
- 有效 `inner` 的参数另外写入 `u16` 参数表索引和内部变量索引；
- 条件记录包含输入数、输出参数索引和处理类型，再跟随输入参数索引；
- 每个 PDO 帧描述为 12 字节，包含 CAN ID、数据区地址、数据项数量、帧类型和条件触发标记；
- 每个 PDO 数据项为 8 字节，包含位置、长度、全局参数索引、句柄和句柄参数。

### 锂电监控

jc001 不包含锂电监控二进制段。Battery V2 的段布局和发布边界见 [jc002 发布包与二进制 ABI](export-build-v2.md#battery-v2-的清单边界)。

### 故障码段

段头 20 字节，随后为来源表、故障码表和无效码字节区：

```text
header: 20 bytes
source record: 16 bytes × enabled_source_total
code record: 8 bytes × enabled_code_total
invalid code bytes: variable length
```

故障码会先按启用状态过滤，并跳过引用不存在或已禁用来源的项目。来源记录包含 CAN ID、无效码区地址、帧类型、来源 ID、类型字符、取码字节、清除码和无效码数量；故障码记录包含类型字符、code、语言文本索引和等级。

### SDO 菜单段

SDO 根节点和普通菜单节点按 40 字节记录写入，参数节点按当前编码器的 36 字节记录写入。构建器按树层级组织输出，并在有子节点的记录中回填子节点地址和数量。参数记录包含控制位、语言名称索引、句柄、CANopen `fid/mid/sid`、默认值、范围和预处理参数。

### 语言块

每种选中语言各写一个独立块，`language_addr[i]` 与 `language_code[i]` 一一对应。一个块由文本数量、文本偏移索引表和以 NUL 结尾的文本组成。文本索引来源于统一收集的内部键、SDO 名称和故障码文案 key；如果某个语言的翻译键缺失，设备块写入对应 key/默认文本。项目中明确保存的空字符串会按空字符串写入，不会被导出器自动改写。

## 校验和与旧文件比较

CRC 使用 CRC16-CCITT-FALSE：多项式 `0x1021`，初始值 `0xFFFF`，对完整二进制字节流计算。CRC 当前作为报告和清单元数据保存，不追加为二进制末尾的独立字节段。

项目导出页面可以选择旧版 `.bin` 做逐字节比较。比较报告给出生成文件大小、旧文件大小、首个差异偏移以及两侧字节值；它不会修改旧文件，也不会自动修复项目配置。

## 相关实现入口

- 前端导出控制：[useProjectExport.ts](../src/features/project-export/useProjectExport.ts)
- 前端导出页面：[ProjectExportPage.tsx](../src/features/project-export/ProjectExportPage.tsx)
- Rust 导出领域：[export.rs](../src-tauri/src/domain/export.rs)
- 项目兼容保存：[project_compat.rs](../src-tauri/src/domain/project_compat.rs)
- 项目结构模型：[project.rs](../src-tauri/src/domain/project.rs)
