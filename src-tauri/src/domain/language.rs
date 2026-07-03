//! 多语言翻译领域模型。
//!
//! 翻译数据存储在项目文件的 `language_info` 段落中：
//! - `list_code_language`：语言代码列表（如 `["zh", "en"]`）
//! - `list_inner`：内部键列表（含语言名称前缀 + 翻译条目）
//! - `list_translate`：翻译映射表（`key → {code → text}`）
//!
//! 表格导入时，表头格式为 `{语言名}_{语言代码}`（如 `中文_zh`）。

use crate::infrastructure::csv_excel::{
    validate_language_headers, TableDocument, TableValidationReport,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashSet};

const LANGUAGE_TYPE_NAME: &str = "语言名称";
const LANGUAGE_TYPE_NORMAL: &str = "普通";
const LANGUAGE_TYPE_EXTERNAL: &str = "外部引用";

/// 多语言配置的强类型表示。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageConfig {
    pub language_codes: Vec<String>,
    pub inner_keys: Vec<String>,
    pub translations: BTreeMap<String, BTreeMap<String, String>>,
}

/// 多语言表格导入结果报告。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageImportReport {
    pub valid: bool,
    pub table: TableValidationReport,
    pub errors: Vec<String>,
    pub document: Option<Value>,
}

/// 将项目中的 `language_info` JSON 转换为表格文档（用于导出）。
///
/// 导出完整翻译表：语言名称前缀、`list_inner` 中普通项，以及仅存在于
/// `list_translate` 的外部引用项。`类型` 列用于导入时保持兼容语义。
pub fn language_document_to_table(document: &Value) -> TableDocument {
    let codes = document
        .get("list_code_language")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let keys = document
        .get("list_inner")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let translations = document.get("list_translate").and_then(Value::as_object);
    let labels = language_labels_from_document(document, &codes, &keys);
    let config_prefix_len = codes.len();
    let mut headers = vec!["序号".to_string(), "类型".to_string(), "auto".to_string()];
    headers.extend(codes.iter().map(|code| {
        let label = labels.get(code).map(String::as_str).unwrap_or("语言");
        format!("{}_{}", label, code)
    }));

    let mut export_keys = keys
        .iter()
        .enumerate()
        .map(|(index, key)| {
            let row_type = if index < config_prefix_len {
                LANGUAGE_TYPE_NAME
            } else {
                LANGUAGE_TYPE_NORMAL
            };
            (key.clone(), row_type.to_string())
        })
        .collect::<Vec<_>>();

    let indexed_keys = keys.iter().cloned().collect::<HashSet<_>>();
    if let Some(items) = translations {
        export_keys.extend(
            items
                .keys()
                .filter(|key| !indexed_keys.contains(key.as_str()))
                .map(|key| (key.clone(), LANGUAGE_TYPE_EXTERNAL.to_string())),
        );
    }

    let rows = export_keys
        .iter()
        .enumerate()
        .map(|(index, (key, row_type))| {
            let mut row = vec![(index + 1).to_string(), row_type.clone(), key.clone()];
            let values = translations
                .and_then(|items| items.get(key))
                .and_then(Value::as_object);
            row.extend(codes.iter().map(|code| {
                values
                    .and_then(|items| items.get(code))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string()
            }));
            row
        })
        .collect();

    TableDocument { headers, rows }
}

/// 将表格文档解析为 `language_info` JSON。
///
/// 流程：校验表头 → 提取语言代码 → 逐行解析翻译条目 → 构建 JSON。
pub fn parse_language_table(document: TableDocument) -> LanguageImportReport {
    let table = validate_language_headers(&document.headers);
    let mut errors = table.errors.clone();
    let has_type_column = document.headers.get(1).map(String::as_str) == Some("类型");
    let key_column = if has_type_column { 2 } else { 1 };
    let language_column_start = key_column + 1;
    let language_headers =
        language_headers_from_headers(&document.headers, language_column_start, &mut errors);
    let language_codes = language_headers
        .iter()
        .map(|(_, code)| code.clone())
        .collect::<Vec<_>>();
    let language_labels = language_headers
        .iter()
        .map(|(label, code)| (code.clone(), Value::String(label.clone())))
        .collect::<Map<_, _>>();
    let mut inner_keys = language_headers
        .iter()
        .map(|(label, _)| label.clone())
        .collect::<Vec<_>>();
    let mut translations = Map::new();

    if table.valid && errors.is_empty() {
        for (index, row) in document.rows.iter().enumerate() {
            if row.len() <= key_column {
                errors.push(format!("数据长度错误 line:{}", index + 1));
                continue;
            }
            let row_type = if has_type_column {
                cell(row, 1)
            } else {
                LANGUAGE_TYPE_NORMAL.to_string()
            };
            let key = cell(row, key_column);
            if key.is_empty() {
                errors.push(format!("auto 为空 line:{}", index + 1));
                continue;
            }
            let is_language_name = row_type == LANGUAGE_TYPE_NAME;
            let is_external = row_type == LANGUAGE_TYPE_EXTERNAL;
            if !is_language_name && !is_external && inner_keys.contains(&key) {
                errors.push(format!("auto 重复：{}", key));
                continue;
            }

            let mut values = Map::new();
            for (language_index, code) in language_codes.iter().enumerate() {
                let value = cell(row, language_index + language_column_start);
                values.insert(code.clone(), Value::String(value));
            }
            if !is_language_name && !is_external && language_codes.iter().any(|code| code == "zh") {
                values.insert("zh".to_string(), Value::String(key.clone()));
            }
            if !is_language_name && !is_external {
                inner_keys.push(key.clone());
            }
            translations.insert(key, Value::Object(values));
        }
    }

    let valid = errors.is_empty();
    let document = if valid {
        Some(json!({
            "list_code_language": language_codes,
            "language_labels": language_labels,
            "list_inner": inner_keys,
            "list_translate": translations
        }))
    } else {
        None
    };

    LanguageImportReport {
        valid,
        table,
        errors,
        document,
    }
}

fn language_labels_from_document(
    document: &Value,
    codes: &[String],
    keys: &[String],
) -> BTreeMap<String, String> {
    let configured = document.get("language_labels").and_then(Value::as_object);
    codes
        .iter()
        .enumerate()
        .map(|(index, code)| {
            let label = configured
                .and_then(|items| items.get(code))
                .and_then(Value::as_str)
                .filter(|item| !item.trim().is_empty())
                .or_else(|| keys.get(index).map(String::as_str))
                .unwrap_or("语言")
                .to_string();
            (code.clone(), label)
        })
        .collect()
}

fn language_headers_from_headers(
    headers: &[String],
    start_index: usize,
    errors: &mut Vec<String>,
) -> Vec<(String, String)> {
    headers
        .iter()
        .skip(start_index)
        .filter_map(|header| {
            let Some((label, code)) = header.rsplit_once('_') else {
                errors.push(format!(
                    "语言列表头 `{}` 缺少语言代码后缀，例如 中文_zh",
                    header
                ));
                return None;
            };
            let label = label.trim();
            let code = code.trim();
            if label.is_empty() {
                errors.push(format!("语言列表头 `{}` 语言显示名为空", header));
                None
            } else if code.is_empty() {
                errors.push(format!("语言列表头 `{}` 语言代码为空", header));
                None
            } else {
                Some((label.to_string(), code.to_string()))
            }
        })
        .collect()
}

fn cell(cells: &[String], index: usize) -> String {
    cells
        .get(index)
        .map(|item| item.trim().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_table_export_includes_type_and_external_translation_keys() {
        let document = json!({
            "list_code_language": ["zh", "en"],
            "language_labels": { "zh": "中文", "en": "英文" },
            "list_inner": ["中文", "英文", "开启"],
            "list_translate": {
                "中文": { "zh": "中文", "en": "Chinese" },
                "英文": { "zh": "英文", "en": "English" },
                "开启": { "zh": "开启", "en": "Open" },
                "菜单": { "zh": "菜单", "en": "Menu" }
            }
        });

        let table = language_document_to_table(&document);

        assert_eq!(
            table.headers,
            vec!["序号", "类型", "auto", "中文_zh", "英文_en"]
        );
        assert_eq!(table.rows[0][1], LANGUAGE_TYPE_NAME);
        assert_eq!(table.rows[0][2], "中文");
        assert_eq!(table.rows[2][1], LANGUAGE_TYPE_NORMAL);
        assert_eq!(table.rows[2][2], "开启");
        assert_eq!(table.rows[3][1], LANGUAGE_TYPE_EXTERNAL);
        assert_eq!(table.rows[3][2], "菜单");
    }

    #[test]
    fn parse_language_table_keeps_external_keys_out_of_list_inner() {
        let table = TableDocument {
            headers: vec![
                "序号".to_string(),
                "类型".to_string(),
                "auto".to_string(),
                "中文_zh".to_string(),
                "英文_en".to_string(),
            ],
            rows: vec![
                vec![
                    "1".to_string(),
                    LANGUAGE_TYPE_NAME.to_string(),
                    "中文".to_string(),
                    "中文".to_string(),
                    "Chinese".to_string(),
                ],
                vec![
                    "2".to_string(),
                    LANGUAGE_TYPE_NAME.to_string(),
                    "英文".to_string(),
                    "英文".to_string(),
                    "English".to_string(),
                ],
                vec![
                    "3".to_string(),
                    LANGUAGE_TYPE_NORMAL.to_string(),
                    "开启".to_string(),
                    "开启".to_string(),
                    "Open".to_string(),
                ],
                vec![
                    "4".to_string(),
                    LANGUAGE_TYPE_EXTERNAL.to_string(),
                    "菜单".to_string(),
                    "菜单".to_string(),
                    "Menu".to_string(),
                ],
            ],
        };

        let report = parse_language_table(table);
        assert!(report.valid, "{:?}", report.errors);
        let document = report.document.unwrap();
        let inner = document
            .get("list_inner")
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>();
        assert_eq!(inner, vec!["中文", "英文", "开启"]);
        assert_eq!(
            document
                .get("list_translate")
                .and_then(|items| items.get("菜单"))
                .and_then(|item| item.get("en"))
                .and_then(Value::as_str),
            Some("Menu")
        );
    }
}
