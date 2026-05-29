# 数据格式说明

## 项目文件

项目文件扩展名为 `.jcpro`，本质是 JSON 文件。

主要顶层字段：

- `config_version`
- `project`
- `device`
- `ui_info`
- `pdo_simple_send_recv`
- `pdo_global_param`
- `pdo_condition`
- `pdo_recv`
- `pdo_send`
- `sdo_info`
- `language_info`

## project

描述项目元数据。

常见字段：

- `name`
- `from`
- `base_path`
- `create_time`
- `update_time`

## device

描述设备参数。

常见字段：

- `resolution_w`
- `resolution_h`

## ui_info

描述 UI 页面和图片资源。

包含：

- `logo`
- `main`
- `main.item[]`

资源项常见字段：

- `name`
- `x`
- `y`
- `w`
- `h`
- `handle`
- `option`
- `default_option`
- `dest`
- `pdo_param_index`

## pdo_simple_send_recv

简化 PDO 配置，用于接收表/发送表和 UI 数据绑定。

结构：

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

## language_info

多语言配置。

结构：

```json
{
  "list_code_language": ["zh", "en"],
  "list_inner": ["确认", "取消"],
  "list_translate": {
    "确认": {
      "zh": "确认",
      "en": "OK"
    }
  }
}
```

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
序号,auto,中文_zh,英文_en,...
```
