# jc002 独立控制器、锂电与故障码 Profile

## 目标

`jc002` 将控制器协议、锂电监控协议和故障码解析作为三个独立的配置维度管理。一个
控制器协议可以搭配多个锂电协议和多个故障码目录；同一故障码目录也可以在不同控制器、
锂电组合之间复用。持久化配置不把三者绑定在同一个 Profile 记录中。

## 数据边界

```text
项目公共层
├── localization          稳定消息 key、locale、复数文本
│   └── locale_order       所有 Profile 共用的语言索引顺序
└── ui_info                页面和资源

控制器协议层
└── protocol_profiles.controller_profiles[]
    ├── pdo_global_param / pdo_condition
    ├── pdo_recv / pdo_send
    ├── sdo_info
    └── canopen              可选的节点、PDO、SDO 语义

锂电协议层
└── protocol_profiles.battery_profiles[]
    └── battery_monitor      帧、信号、显示项和超时规则

故障码协议层
└── protocol_profiles.fault_code_profiles[]
    ├── fault_code_info       来源、定义和报码绑定
    └── localization_overlay  故障目录专属文案
```

控制器 Profile 不得包含 `battery_monitor`，锂电 Profile 不得包含 PDO、SDO 或
`canopen`；故障码 Profile 只包含 `fault_code_info`。公共 localization 保存语言集合和共享消息；每个 Profile 可选
`localization_overlay` 保存新增或覆盖的消息。overlay 不能改变 locale 集合和顺序，各
scope 的 overlay 独立编码，不由上位机强行合并或判断协议搭配关系。

## 项目结构

```json
{
  "config_version": "jc002",
  "protocol_profiles": {
    "schema_version": 2,
    "controller_profiles": [
      {
        "profile_id": "acm",
        "controller_family": "ACM",
        "controller_revision": "1.x",
        "protocol": {
          "pdo_global_param": [],
          "pdo_condition": [],
          "pdo_recv": [],
          "pdo_send": [],
          "sdo_info": {},
          "canopen": {}
        }
      },
      {
        "profile_id": "inmotion",
        "controller_family": "Inmotion",
        "controller_revision": "2.x",
        "protocol": {
          "pdo_global_param": [],
          "pdo_condition": [],
          "pdo_recv": [],
          "pdo_send": [],
          "sdo_info": {}
        }
      }
    ],
    "battery_profiles": [
      {
        "profile_id": "bms-a",
        "battery_family": "Lithium-A",
        "battery_revision": "1.x",
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

校验要求：

- `schema_version` 固定为 `2`。
- `controller_profiles` 必须非空；`battery_profiles` 和 `fault_code_profiles` 可以为空。
- 三个集合分别校验 `profile_id` 唯一，ID 不超过 63 个 UTF-8 字节。
- 控制器 Profile 必须包含四个 PDO 数组、`sdo_info` 对象和控制器族/版本字段。
- 锂电 Profile 必须只包含一个 `battery_monitor` 对象和电池族/版本字段。
- 故障码 Profile 必须只包含一个 `fault_code_info` 对象和故障族/版本字段；故障目录固定
  使用 schema v2 的 `sources[]`、`definitions[]`、`bindings[]`，不接受历史 `codes[]`。
- `localization_overlay` 若存在，必须只包含 `locales`；locale 必须属于公共
  `localization.locale_order`，不允许在 Profile 中定义 `default_locale` 或语言顺序。
- overlay 可以覆盖公共消息或增加 Profile 专属消息；公共 key 在 Profile 语言页中保留
  为不可删除的继承项。
- `jc001` 不得包含 `protocol_profiles`；不通过旧 Profile 结构或 v1 fallback 解释该字段。
- jc002 不接受缺少 `protocol_profiles` 的旧 v2 文档，也不从根级协议字段自动生成 Profile。
- `active_*_profile_id` 只存在于上位机编辑器内存，用于当前表单选择；保存 `.jcpro` 时必须
  移除，构建清单和 `data.bin` 也不得包含这些字段。

## 上位机操作

CANopen 页面、锂电页面和故障码页面分别显示自己的 Profile 管理栏。控制器 Profile 栏属于 jc002
入口，即使项目暂未填写可选的 `canopen` 拓扑，也可以先管理 PDO/SDO Profile；拓扑
初始化和 Profile 管理是两个独立动作：

1. 在 CANopen 页面启用或选择控制器协议 Profile，编辑 PDO、SDO 和 CANopen 拓扑。
2. 在锂电页面启用或选择锂电监控 Profile，编辑帧、信号、显示项和超时策略。
3. 在故障码页面启用或选择故障码 Profile，编辑来源、故障定义和报码绑定。
4. 三个页面都支持复制、删除、重命名 Profile ID、编辑备注和族/版本信息。
5. 导出页面同时显示当前控制器、锂电和故障码 Profile。
6. 多国语言页的“公共语言目录”作用域维护 locale 集合、顺序和公共消息；选择控制器、
   锂电或故障码作用域后，页面显示公共消息与当前 overlay 的合并结果。编辑公共 key 会写回
   当前 Profile overlay，新增 key 也只进入当前 overlay；Profile 作用域不能修改语言集合。

切换控制器、锂电或故障码只改变上位机内存中的当前 Profile 选择；表单读取和写回都直接
定位到对应 Profile。`protocol_profiles` 是持久化的唯一来源，jc002 文件不保存顶层协议
编辑镜像。

## 同一 jcpro 管理多个 Profile

一个 `.jcpro` 必须保存一份 `protocol_profiles`，其中三个数组分别维护三类协议。单协议
项目也显式保存一个对应 Profile；缺少 Profile Bundle 的文档直接无效，不自动包装、不自动
迁移：

```text
同一个 jcpro
├── controller_profiles
│   ├── acm
│   └── inmotion6
└── battery_profiles
    ├── default
    └── bms-a
└── fault_code_profiles
    ├── default
    └── controller-faults
```

前端操作路径如下：

1. 打开 CANopen 页面，在“当前控制器协议”下拉框中选择控制器 Profile。
2. 点击“新增空白 Profile”创建独立的控制器协议；新项包含空的 PDO、SDO 和 CANopen
   拓扑，不会复制当前协议内容，并立即成为当前项。
3. 如需以已有协议为起点，点击“复制 Profile”；复制项会自动生成唯一 ID（例如
   `inmotion6_2`）并立即成为当前项。
4. 修改 Profile ID、控制器协议族、版本和备注。Profile ID 是持久化引用键，不能为空、
   不能与同一数组中的其他 ID 重复，且不超过 63 个 UTF-8 字节。
5. 在当前 CANopen/PDO/SDO 编辑器中修改协议内容；这些修改只写回当前控制器 Profile。
6. 打开锂电页面，使用同样的流程维护 `battery_profiles`。控制器和锂电 ID 属于两个
   独立命名空间，即使两边都叫 `default` 也不会冲突。
7. 打开故障码页面，使用同样的流程维护 `fault_code_profiles`。故障码 Profile 与控制器、
   锂电 Profile 的 ID 也属于独立命名空间。
8. 删除时需要确认。控制器至少保留一个 Profile；锂电和故障码 Profile 可以删除到空集合，
   分别表示项目暂不配置锂电协议或故障码目录。

前端实现对应以下纯数据接口，页面不直接修改另一侧数组：

```ts
readProtocolProfiles(document)
createNewProtocolProfileSections(document, 'controller' | 'battery' | 'fault')
protocolProfileSectionsForSelection(document, 'controller' | 'battery' | 'fault', profileId)
addProtocolProfileSections(document, 'controller' | 'battery' | 'fault')
renameProtocolProfileSections(document, scope, currentProfileId, nextProfileId)
updateProtocolProfileMetadataSections(document, scope, profileId, patch)
removeProtocolProfileSections(document, scope, profileId)
syncProtocolProfileSections(document, sections)
```

`syncProtocolProfileSections` 是页面编辑器的统一写回入口。它把当前表单修改写回对应的
内存选择 Profile，不创建根级协议段。因此：

- 切换控制器时，控制器表单切换到对应 Profile，当前锂电和故障码选择保持不变；
- 切换锂电时，锂电表单切换到对应 Profile，当前控制器和故障码选择保持不变；
- 切换故障码时，故障码表单切换到对应 Profile，当前控制器和锂电选择保持不变；
- 保存 `.jcpro` 时只保留完整 Profile 数组；导出时为每个控制器、锂电和故障码 Profile
  分别构建独立 payload，并全部写入同一个 `data.bin`。

上位机不在构建文件中保存控制器与锂电的搭配选择。设备需要 ACM 时，在下位机高级设置
选择 `acm`；锂电和故障码选择也由下位机分别完成，重启后生效。

## 构建和下发

运行时采用“一个 data.bin、多套自描述 payload”的构建过程：

```text
controller_profiles[] + battery_profiles[] + fault_code_profiles[]
                ↓
     每个 Profile 独立构建对应 scope 的 PDO/SDO/battery/fault/i18n 段
                ↓
 ConfigUpdate.json 写入整包和各 payload 索引
```

每个 payload 内部仍使用原有 v2 相对偏移 ABI；`base_addr` 只属于整包索引，选中的
payload 被下位机重定位为新的地址空间后，PDO、SDO、故障和锂电地址无需改写。
当前实现为每个 Profile 各自携带一份动态 i18n 段，保证不同 payload 的本地偏移完全隔离。
控制器 payload 的语言来源为公共 localization → 控制器 overlay；锂电和故障码 payload
分别合并自己的 overlay。公共 locale_order 和 `language.name.*` 公共消息会
原样复制到每个 LVI2 包，overlay 只影响消息 key/value，不会改变固件语言索引。

`ConfigUpdate.json` 不包含完整控制器、锂电或故障码协议对象，只包含身份和 payload 索引：

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
  ├── scope（controller / battery / fault）
  ├── profile_id
  ├── base_addr / file_size / crc
  └── description（该 payload 内部的相对偏移和数量）
```

根级 `data_description.file_size`/`crc` 校验整个 `data.bin`；每个 payload 的
`file_size`/`crc` 校验对应局部段。下位机在升级检查和冷启动加载时校验清单与 bin
描述的版本、三个集合数量、Profile scope 索引以及整包/局部 CRC。`ConfigUpdate.json`
和 `data.bin` 必须来自同一次构建。

## 协议切换生命周期

切换控制器、锂电协议或故障码目录时：

1. 在上位机 Profile 页面维护控制器、锂电和故障码 Profile 集合。
2. 导出完整升级包，构建器将各类 Profile payload 写入同一个 `bin/data`。
3. 将同一次构建产生的 `ConfigUpdate.json` 和 `bin/data` 一起更新。
4. 下位机高级设置分别选择控制器、锂电和故障码 Profile；选择写入设备持久化设置。
5. 设备重启后，Common PDO loader 与 jc002 loader 按各自 scope 选择加载对应 payload。

当前不支持在线切换，也不在下位机加载所有 Profile 的 JSON。这样可以保持现有
`aic_ui.c` 初始化链路和单套二进制地址 ABI 稳定；Profile 切换只发生在重启时。

## 固件查询 API

```c
const char *jclib_get_active_controller_profile_id(void);
const char *jclib_get_active_battery_profile_id(void);
const char *jclib_get_active_fault_code_profile_id(void);
u32 jclib_get_controller_profile_total(void);
u32 jclib_get_battery_profile_total(void);
u32 jclib_get_fault_code_profile_total(void);
u32 jclib_get_protocol_profile_version(void);
```

统一的 jc002 Profile Bundle 返回版本 `2`，以及控制器、锂电、故障码三类集合的数量和实际加载的
Profile ID。单协议导出包也会包含显式的单 Profile 结构；没有锂电或故障码协议时，
对应数量为 `0`，激活 ID 返回 `NULL`。

下位机 Profile 选择接口：

```c
int CommonProtocolProfile_SaveSelection(const char *controller_profile_id,
                                        const char *battery_profile_id);
unsigned int CommonProtocolProfile_GetControllerCount(void);
const char *CommonProtocolProfile_GetControllerId(unsigned int index);
const char *CommonProtocolProfile_GetControllerFamily(unsigned int index);
```

## 验证

上位机回归覆盖：

- 控制器、锂电和故障码集合独立初始化、复制与切换；
- 任一 Profile 切换不覆盖另外两侧的选择；
- 跨集合重复 Profile ID、编辑态未知选择和错误协议段拒绝；
- 导出清单和 `data_description` 的三组身份元数据及独立 scope payload。

下位机静态实现覆盖：

- jc002 独立控制器/锂电/故障码清单、ID 唯一性和激活 ID 校验；
- 清单与 bin 描述版本、数量、Profile scope 索引和 CRC 一致性校验；
- 初始化后公开已加载的三类 Profile 身份；
- 不修改 `aic_ui.c`，不恢复旧的 v1 协议入口。

目标固件的 SCons 构建、真实 CAN 总线和断电重启测试仍需要在对应开发环境中执行。
