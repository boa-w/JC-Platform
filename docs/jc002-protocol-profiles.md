# jc002 独立控制器与锂电 Profile

## 目标

`jc002` 将控制器协议和锂电监控协议作为两个独立的配置维度管理。一个控制器协议
可以搭配多个锂电协议，锂电协议也可以在不同控制器之间复用。持久化配置不再把两者
绑定在同一个 Profile 记录中。

## 数据边界

```text
项目公共层
├── localization          稳定消息 key、locale、复数文本
├── fault_code_info        故障来源、故障定义和绑定
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
```

控制器 Profile 不得包含 `battery_monitor`，锂电 Profile 不得包含 PDO、SDO 或
`canopen`。公共多国语言和故障消息仍只保存一份，两个协议层可以共同引用这些消息 key。

## 项目结构

```json
{
  "config_version": "jc002",
  "protocol_profiles": {
    "schema_version": 2,
    "active_controller_profile_id": "inmotion",
    "active_battery_profile_id": "bms-a",
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
    ]
  }
}
```

校验要求：

- `schema_version` 固定为 `2`。
- `controller_profiles` 必须非空；`active_controller_profile_id` 必须引用现有控制器 Profile。
- `battery_profiles` 可以为空；非空时必须设置并引用 `active_battery_profile_id`。
- 两个集合分别校验 `profile_id` 唯一，ID 不超过 63 个 UTF-8 字节。
- 控制器 Profile 必须包含四个 PDO 数组、`sdo_info` 对象和控制器族/版本字段。
- 锂电 Profile 必须只包含一个 `battery_monitor` 对象和电池族/版本字段。
- `jc001` 不得包含 `protocol_profiles`；不通过旧 Profile 结构或 v1 fallback 解释该字段。

## 上位机操作

CANopen 页面和锂电页面分别显示自己的 Profile 管理栏。控制器 Profile 栏属于 jc002
入口，即使项目暂未填写可选的 `canopen` 拓扑，也可以先管理 PDO/SDO Profile；拓扑
初始化和 Profile 管理是两个独立动作：

1. 在 CANopen 页面启用或选择控制器协议 Profile，编辑 PDO、SDO 和 CANopen 拓扑。
2. 在锂电页面启用或选择锂电监控 Profile，编辑帧、信号、显示项和超时策略。
3. 两个页面都支持复制、删除、重命名 Profile ID、编辑备注和族/版本信息。
4. 导出页面同时显示当前控制器 Profile 和锂电 Profile。

切换控制器只替换 PDO/SDO/CANopen 顶层编辑镜像，切换锂电只替换
`battery_monitor` 镜像；另一侧的激活选择不会被覆盖。`protocol_profiles` 是持久化的
唯一来源，顶层协议段只是当前激活项的编辑镜像。

## 同一 jcpro 管理多个 Profile

一个 `.jcpro` 只保存一份 `protocol_profiles`，其中两个数组分别维护两类协议：

```text
同一个 jcpro
├── controller_profiles
│   ├── acm
│   └── inmotion6
└── battery_profiles
    ├── default
    └── bms-a
```

前端操作路径如下：

1. 打开 CANopen 页面，在“当前控制器协议”下拉框中选择控制器 Profile。
2. 点击“复制 Profile”复制当前控制器协议；复制项会自动生成唯一 ID（例如
   `inmotion6_2`）并立即成为当前项。
3. 修改 Profile ID、控制器协议族、版本和备注。Profile ID 是持久化引用键，不能为空、
   不能与同一数组中的其他 ID 重复，且不超过 63 个 UTF-8 字节。
4. 在当前 CANopen/PDO/SDO 编辑器中修改协议内容；这些修改只写回当前控制器 Profile。
5. 打开锂电页面，使用同样的流程维护 `battery_profiles`。控制器和锂电 ID 属于两个
   独立命名空间，即使两边都叫 `default` 也不会冲突。
6. 删除时需要确认。控制器至少保留一个 Profile；锂电可以删除到空集合，表示项目暂不
   配置锂电协议。

前端实现对应以下纯数据接口，页面不直接修改另一侧数组：

```ts
readProtocolProfiles(document)
protocolProfileSectionsForSelection(document, 'controller' | 'battery', profileId)
addProtocolProfileSections(document, 'controller' | 'battery')
renameProtocolProfileSections(document, scope, currentProfileId, nextProfileId)
updateProtocolProfileMetadataSections(document, scope, profileId, patch)
removeProtocolProfileSections(document, scope, profileId)
syncProtocolProfileSections(document, sections)
```

`syncProtocolProfileSections` 是页面编辑器的统一写回入口。它把当前顶层编辑镜像写回
对应的激活 Profile，同时重新生成两个激活项的镜像。因此：

- 切换控制器时，控制器 PDO/SDO/CANopen 会切换，当前锂电镜像保持不变；
- 切换锂电时，只替换 `battery_monitor`，当前控制器镜像保持不变；
- 保存 `.jcpro` 时，完整 Profile 数组和两个激活 ID 都会保留；
- 导出时只物化两个激活项，不会把全部 Profile 打进设备运行时表。

以当前 Inmotion6 项目为例，持久化选择是：

```json
{
  "active_controller_profile_id": "inmotion6",
  "active_battery_profile_id": "default"
}
```

如果要切换成 ACM 控制器搭配同一个默认锂电协议，只需要把控制器激活 ID 改为 `acm`，
锂电激活 ID 继续保持 `default`，然后重新导出完整升级包。

## 构建和下发

当前下位机 ABI 仍是单套运行时表，构建过程如下：

```text
active_controller_profile_id ─┐
                              ├─ 组合当前激活协议
active_battery_profile_id ───┘
                                      ↓
                         PDO/SDO/battery v2 写入 data.bin
                                      ↓
                         ConfigUpdate.json 写入身份元数据
```

`ConfigUpdate.json` 不包含完整控制器或锂电协议对象，只包含身份信息：

```text
protocol_profiles.schema_version
protocol_profiles.active_controller_profile_id
protocol_profiles.active_battery_profile_id（可选）
protocol_profiles.controller_profiles[].profile_id/controller_family/controller_revision
protocol_profiles.battery_profiles[].profile_id/battery_family/battery_revision
data_description.protocol_profile_version
data_description.controller_profile_total
data_description.active_controller_profile_id
data_description.battery_profile_total
data_description.active_battery_profile_id（可选）
```

下位机在升级检查、数据复制和冷启动加载时校验清单与 bin 描述的版本、两个集合数量
及两个激活 ID。`ConfigUpdate.json` 和 `data.bin` 必须来自同一次构建。

## 协议切换生命周期

切换控制器、锂电协议或两者的组合时：

1. 在对应页面选择目标控制器 Profile 和/或锂电 Profile。
2. 重新构建并导出完整升级包。
3. 将同一次构建产生的 `ConfigUpdate.json` 和 `bin/data` 一起更新。
4. 更新成功后重启设备。
5. 现有 jc002 动态 PDO/SDO/battery loader 使用组合后的物化表。

当前不支持在线切换，也不在下位机加载所有 Profile 的 JSON。这样可以保持现有
`aic_ui.c` 初始化链路和单套二进制地址 ABI 稳定。

## 固件查询 API

```c
const char *jclib_get_active_controller_profile_id(void);
const char *jclib_get_active_battery_profile_id(void);
u32 jclib_get_controller_profile_total(void);
u32 jclib_get_battery_profile_total(void);
u32 jclib_get_protocol_profile_version(void);
```

没有多协议元数据的普通 jc002 单套包返回版本和数量 `0`；带独立 Profile 集合的包返回
版本 `2`，以及控制器/锂电各自的数量和激活 ID。没有锂电协议时，锂电数量为 `0`，
激活锂电 ID 返回 `NULL`。

## 验证

上位机回归覆盖：

- 控制器和锂电集合独立初始化、复制与切换；
- 控制器切换不覆盖锂电选择，锂电切换不覆盖控制器选择；
- 跨集合重复 Profile ID、未知激活 ID 和错误协议段拒绝；
- 导出清单和 `data_description` 的两组身份元数据。

下位机静态实现覆盖：

- jc002 独立控制器/锂电清单、ID 唯一性和激活 ID 校验；
- 清单与 bin 描述版本、数量、两个激活 ID 一致性校验；
- 初始化后公开已加载的两类 Profile 身份；
- 不修改 `aic_ui.c`，不恢复旧的 v1 协议入口。

目标固件的 SCons 构建、真实 CAN 总线和断电重启测试仍需要在对应开发环境中执行。
