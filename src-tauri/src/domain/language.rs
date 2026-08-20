//! 多语言翻译领域模型。
//!
//! 旧版表格接口使用 `language_info` 投影；jc002 页面通过同一投影读写
//! `localization`，并保留 `language.name.<locale>` 语言名称消息：
//! - `list_code_language`：语言代码列表（如 `["zh", "en"]`）
//! - `list_inner`：普通翻译条目列表（v2 不包含语言名称 key）
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
const LOCALE_NAME_KEY_PREFIX: &str = "language.name.";

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

/// 单语言 CSV 导入结果。只更新项目已配置且目标语言为空的键。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleLanguageImportReport {
    pub valid: bool,
    pub language_code: String,
    pub filled: usize,
    pub skipped_existing: usize,
    pub skipped_unknown: usize,
    pub skipped_empty: usize,
    pub skipped_duplicate: usize,
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
    let is_v2 = document
        .get("language_name_keys")
        .and_then(Value::as_object)
        .is_some();
    let mut headers = vec!["序号".to_string(), "类型".to_string(), "auto".to_string()];
    headers.extend(codes.iter().map(|code| {
        let label = labels.get(code).map(String::as_str).unwrap_or("语言");
        format!("{}_{}", label, code)
    }));

    let mut export_keys = if is_v2 {
        codes
            .iter()
            .map(|code| {
                let key = locale_name_key(code);
                (key, LANGUAGE_TYPE_NAME.to_string())
            })
            .collect::<Vec<_>>()
    } else {
        keys.iter()
            .enumerate()
            .map(|(index, key)| {
                let row_type = if index < codes.len() {
                    LANGUAGE_TYPE_NAME
                } else {
                    LANGUAGE_TYPE_NORMAL
                };
                (key.clone(), row_type.to_string())
            })
            .collect::<Vec<_>>()
    };

    if is_v2 {
        export_keys.extend(
            keys.iter()
                .filter(|key| !is_locale_name_key(key))
                .map(|key| (key.clone(), LANGUAGE_TYPE_NORMAL.to_string())),
        );
    }

    let indexed_keys = export_keys
        .iter()
        .map(|(key, _)| key.clone())
        .collect::<HashSet<_>>();
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
    let is_v2_name_table = has_type_column
        && document.rows.iter().any(|row| {
            cell(row, 1) == LANGUAGE_TYPE_NAME
                && cell(row, key_column).starts_with(LOCALE_NAME_KEY_PREFIX)
        });
    let mut inner_keys = if is_v2_name_table {
        Vec::new()
    } else {
        language_headers
            .iter()
            .map(|(label, _)| label.clone())
            .collect::<Vec<_>>()
    };
    let mut translations = Map::new();
    let mut language_name_keys = Map::new();

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
            if is_v2_name_table && is_language_name {
                let Some(code) = key.strip_prefix(LOCALE_NAME_KEY_PREFIX) else {
                    errors.push(format!("语言名称 key 无效：{}", key));
                    continue;
                };
                if !language_codes.iter().any(|item| item == code) {
                    errors.push(format!("语言名称 key 引用了未配置语言：{}", key));
                    continue;
                }
                if key != locale_name_key(code) {
                    errors.push(format!(
                        "语言名称 key 必须精确为：{}",
                        locale_name_key(code)
                    ));
                    continue;
                }
                if language_name_keys
                    .insert(code.to_string(), Value::String(key.clone()))
                    .is_some()
                {
                    errors.push(format!("语言名称 key 重复：{}", key));
                    continue;
                }
            } else if is_v2_name_table && is_locale_name_key(&key) {
                errors.push(format!(
                    "v2 语言名称 key 必须使用 `{}` 类型：{}",
                    LANGUAGE_TYPE_NAME, key
                ));
                continue;
            } else if !is_language_name && !is_external && inner_keys.contains(&key) {
                errors.push(format!("auto 重复：{}", key));
                continue;
            }

            let mut values = Map::new();
            for (language_index, code) in language_codes.iter().enumerate() {
                let value = cell(row, language_index + language_column_start);
                values.insert(code.clone(), Value::String(value));
            }
            if !is_v2_name_table
                && !is_language_name
                && !is_external
                && language_codes.iter().any(|code| code == "zh")
            {
                values.insert("zh".to_string(), Value::String(key.clone()));
            }
            if !is_language_name && !is_external {
                inner_keys.push(key.clone());
            }
            translations.insert(key, Value::Object(values));
        }
    }

    if is_v2_name_table {
        for code in &language_codes {
            let key = locale_name_key(code);
            if language_name_keys.get(code).is_none() {
                errors.push(format!("v2 表格缺少语言名称行：{}", key));
            }
        }
    }

    let valid = errors.is_empty();
    let document = if valid {
        if is_v2_name_table {
            Some(json!({
                "list_code_language": language_codes,
                "default_locale": language_headers.first().map(|(_, code)| code).cloned().unwrap_or_default(),
                "language_name_keys": language_name_keys,
                "list_inner": inner_keys,
                "list_translate": translations
            }))
        } else {
            Some(json!({
                "list_code_language": language_codes,
                "language_labels": language_labels,
                "list_inner": inner_keys,
                "list_translate": translations
            }))
        }
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

/// 将两列 CSV 数据按 key 合并到单个目标语言。
///
/// CSV 行顺序不影响结果；未知 key 不会加入项目，已有非空翻译不会被覆盖。
pub fn merge_single_language_rows(
    document: &Value,
    language_code: &str,
    rows: Vec<Vec<String>>,
) -> SingleLanguageImportReport {
    let language_code = language_code.trim().to_string();
    let codes = document
        .get("list_code_language")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>())
        .unwrap_or_default();
    let mut errors = Vec::new();
    if !document.is_object() {
        errors.push("项目多国语言配置格式无效。".to_string());
    }
    if !codes.iter().any(|code| *code == language_code) {
        errors.push(format!("目标语言未在项目中配置：{}", language_code));
    }

    let inner_keys = document
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
    let indexed_keys = inner_keys.iter().cloned().collect::<HashSet<_>>();
    let mut configured_keys = inner_keys.iter().cloned().collect::<HashSet<_>>();
    if let Some(translations) = document.get("list_translate").and_then(Value::as_object) {
        configured_keys.extend(
            translations
                .keys()
                .filter(|key| !indexed_keys.contains(*key))
                .cloned(),
        );
        if translations.values().any(|value| !value.is_object()) {
            errors.push("项目翻译映射格式无效。".to_string());
        }
    } else {
        errors.push("项目缺少翻译映射。".to_string());
    }

    let data_rows = rows
        .into_iter()
        .enumerate()
        .filter_map(|(index, row)| {
            if index == 0 && is_single_language_header(&row) {
                None
            } else {
                Some(row)
            }
        })
        .collect::<Vec<_>>();
    if data_rows.iter().all(|row| row.len() < 2) {
        errors.push("CSV 必须包含两列：key 和翻译内容。".to_string());
    }

    if !errors.is_empty() {
        return SingleLanguageImportReport {
            valid: false,
            language_code,
            filled: 0,
            skipped_existing: 0,
            skipped_unknown: 0,
            skipped_empty: 0,
            skipped_duplicate: 0,
            errors,
            document: None,
        };
    }

    let mut next_document = document.clone();
    let translations = next_document
        .as_object_mut()
        .expect("language document must be an object")
        .entry("list_translate")
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .expect("list_translate must be an object");
    let mut seen = HashSet::new();
    let mut filled = 0;
    let mut skipped_existing = 0;
    let mut skipped_unknown = 0;
    let mut skipped_empty = 0;
    let mut skipped_duplicate = 0;

    for row in data_rows {
        let key = row.first().map(|value| value.trim()).unwrap_or_default();
        let value = row.get(1).map(|value| value.trim()).unwrap_or_default();
        if key.is_empty() || value.is_empty() {
            skipped_empty += 1;
            continue;
        }
        if !seen.insert(key.to_string()) {
            skipped_duplicate += 1;
            continue;
        }
        if !configured_keys.contains(key) {
            skipped_unknown += 1;
            continue;
        }

        let values = translations
            .entry(key.to_string())
            .or_insert_with(|| Value::Object(Map::new()))
            .as_object_mut()
            .expect("translation entry must be an object");
        let existing = values
            .get(&language_code)
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !existing.trim().is_empty() {
            skipped_existing += 1;
            continue;
        }
        values.insert(language_code.clone(), Value::String(value.to_string()));
        filled += 1;
    }

    SingleLanguageImportReport {
        valid: true,
        language_code,
        filled,
        skipped_existing,
        skipped_unknown,
        skipped_empty,
        skipped_duplicate,
        errors,
        document: Some(next_document),
    }
}

fn is_single_language_header(row: &[String]) -> bool {
    let first = row
        .first()
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_default();
    if matches!(
        first.as_str(),
        "key" | "auto" | "translation_key" | "translation key" | "翻译键" | "键"
    ) {
        return true;
    }

    row.first()
        .is_some_and(|value| is_language_column_header(value))
        && row
            .get(1)
            .is_some_and(|value| is_language_column_header(value))
}

fn is_language_column_header(value: &str) -> bool {
    let Some((label, code)) = value.trim().rsplit_once('_') else {
        return false;
    };
    !label.trim().is_empty()
        && !code.is_empty()
        && code.len() <= 16
        && code
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
        && code
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_alphabetic())
}

fn language_labels_from_document(
    document: &Value,
    codes: &[String],
    keys: &[String],
) -> BTreeMap<String, String> {
    if document
        .get("language_name_keys")
        .and_then(Value::as_object)
        .is_some()
    {
        let display_locale = document
            .get("default_locale")
            .and_then(Value::as_str)
            .or_else(|| codes.first().map(String::as_str));
        return codes
            .iter()
            .map(|code| {
                let key = document
                    .get("language_name_keys")
                    .and_then(Value::as_object)
                    .and_then(|items| items.get(code))
                    .and_then(Value::as_str)
                    .unwrap_or_else(|| "");
                let label = display_locale
                    .and_then(|locale| {
                        document
                            .get("list_translate")
                            .and_then(Value::as_object)
                            .and_then(|items| items.get(key))
                            .and_then(Value::as_object)
                            .and_then(|items| items.get(locale))
                    })
                    .and_then(Value::as_str)
                    .filter(|item| !item.trim().is_empty())
                    .unwrap_or(code)
                    .to_string();
                (code.clone(), label)
            })
            .collect();
    }
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

fn locale_name_key(locale: &str) -> String {
    format!("{LOCALE_NAME_KEY_PREFIX}{locale}")
}

fn is_locale_name_key(key: &str) -> bool {
    key.starts_with(LOCALE_NAME_KEY_PREFIX)
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
    fn v2_language_table_round_trip_keeps_locale_name_keys_out_of_list_inner() {
        let document = json!({
            "list_code_language": ["zh-CN", "en-US"],
            "default_locale": "zh-CN",
            "language_name_keys": {
                "zh-CN": "language.name.zh-CN",
                "en-US": "language.name.en-US"
            },
            "list_inner": ["menu.root"],
            "list_translate": {
                "language.name.zh-CN": { "zh-CN": "中文", "en-US": "Chinese" },
                "language.name.en-US": { "zh-CN": "英文", "en-US": "English" },
                "menu.root": { "zh-CN": "菜单", "en-US": "Menu" }
            }
        });

        let table = language_document_to_table(&document);
        assert_eq!(
            table.headers,
            vec!["序号", "类型", "auto", "中文_zh-CN", "英文_en-US"]
        );
        assert_eq!(table.rows[0][1], LANGUAGE_TYPE_NAME);
        assert_eq!(table.rows[0][2], "language.name.zh-CN");
        assert_eq!(table.rows[1][2], "language.name.en-US");
        assert_eq!(table.rows[2][1], LANGUAGE_TYPE_NORMAL);

        let imported = parse_language_table(table).document.unwrap();
        assert_eq!(
            imported["language_name_keys"]["en-US"],
            "language.name.en-US"
        );
        assert_eq!(imported["list_inner"], json!(["menu.root"]));
        assert_eq!(
            imported["list_translate"]["language.name.en-US"]["en-US"],
            "English"
        );
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

    #[test]
    fn single_language_import_matches_keys_and_only_fills_empty_values() {
        let document = json!({
            "list_code_language": ["zh", "en"],
            "language_labels": { "zh": "中文", "en": "英文" },
            "list_inner": ["中文", "英文", "speed", "parking"],
            "list_translate": {
                "中文": { "zh": "中文", "en": "Chinese" },
                "英文": { "zh": "英文", "en": "English" },
                "speed": { "zh": "车速", "en": "Speed" },
                "parking": { "zh": "驻车", "en": "" },
                "external_fault": { "zh": "外部故障", "en": "" }
            }
        });
        let original_inner = document["list_inner"].clone();
        let rows = vec![
            vec!["key".to_string(), "English".to_string()],
            vec!["external_fault".to_string(), "Fault, external".to_string()],
            vec!["parking".to_string(), "Parking".to_string()],
            vec!["speed".to_string(), "New speed".to_string()],
            vec!["unknown".to_string(), "Unknown".to_string()],
            vec!["parking".to_string(), "Duplicate".to_string()],
            vec!["empty".to_string(), "".to_string()],
        ];

        let report = merge_single_language_rows(&document, "en", rows);

        assert!(report.valid, "{:?}", report.errors);
        assert_eq!(report.filled, 2);
        assert_eq!(report.skipped_existing, 1);
        assert_eq!(report.skipped_unknown, 1);
        assert_eq!(report.skipped_empty, 1);
        assert_eq!(report.skipped_duplicate, 1);
        let imported = report.document.unwrap();
        assert_eq!(imported["list_inner"], original_inner);
        assert_eq!(imported["list_translate"]["speed"]["en"], "Speed");
        assert_eq!(imported["list_translate"]["parking"]["en"], "Parking");
        assert_eq!(
            imported["list_translate"]["external_fault"]["en"],
            "Fault, external"
        );
        assert!(imported["list_translate"].get("unknown").is_none());
    }

    #[test]
    fn single_language_import_accepts_headerless_rows_and_rejects_unknown_language() {
        let document = json!({
            "list_code_language": ["zh", "en"],
            "list_inner": ["中文", "英文", "parking"],
            "list_translate": { "parking": { "zh": "驻车", "en": "" } }
        });
        let rows = vec![vec!["parking".to_string(), "Parking".to_string()]];

        let report = merge_single_language_rows(&document, "en", rows.clone());
        assert!(report.valid);
        assert_eq!(report.filled, 1);

        let invalid = merge_single_language_rows(&document, "de", rows);
        assert!(!invalid.valid);
        assert!(invalid.document.is_none());
        assert!(invalid.errors[0].contains("de"));
    }

    #[test]
    fn single_language_import_skips_language_pair_header() {
        let document = json!({
            "list_code_language": ["zh", "uk"],
            "list_inner": ["中文", "英文"],
            "list_translate": {
                "中文": { "zh": "中文", "uk": "" },
                "英文": { "zh": "英文", "uk": "" }
            }
        });
        let rows = vec![
            vec!["中文_zh".to_string(), "乌克兰语_uk".to_string()],
            vec!["中文".to_string(), "Китайська".to_string()],
            vec!["英文".to_string(), "Англійська".to_string()],
        ];

        let report = merge_single_language_rows(&document, "uk", rows);

        assert!(report.valid, "{:?}", report.errors);
        assert_eq!(report.filled, 2);
        assert_eq!(report.skipped_unknown, 0);
        let imported = report.document.unwrap();
        assert_eq!(imported["list_translate"]["中文"]["uk"], "Китайська");
        assert_eq!(imported["list_translate"]["英文"]["uk"], "Англійська");
    }
}
