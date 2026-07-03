//! CSV / Excel 表格文件的读写与校验。
//!
//! 支持两种格式：
//! - **CSV**：自定义分隔格式（逗号分隔，值内逗号替换为空格）
//! - **Excel XML**：通过 `calamine` 库读取 `.xlsx`/`.xls`，导出为 Excel XML 格式
//!
//! 所有表格统一表示为 [`TableDocument`]（表头 + 行数据）。

use calamine::{open_workbook_auto, Reader};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use thiserror::Error;

/// SDO 表格标准表头（21 列）。
pub const SDO_HEADERS: &[&str] = &[
    "主菜单名称",
    "主菜单权限",
    "子菜单名称",
    "子菜单权限",
    "参数名称",
    "使用权限",
    "协议类型",
    "帧ID",
    "主索引",
    "子索引",
    "读写权限",
    "最大值",
    "最小值",
    "默认值",
    "数据类型",
    "bit开始位置",
    "bit长度",
    "数据预处理",
    "缩放值",
    "偏移值",
    "保留小数",
];

/// PDO 简单模式表格标准表头（8 列）。
pub const PDO_SIMPLE_HEADERS: &[&str] = &[
    "主目录",
    "帧ID",
    "帧类型",
    "帧描述",
    "绑定变量名称",
    "取数方式",
    "开始位置",
    "数据长度",
];

/// 多语言表格必须的前缀表头。
pub const LANGUAGE_REQUIRED_PREFIX_HEADERS: &[&str] = &["序号", "auto"];

/// 通用表格文档 —— 表头 + 二维行数据。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableDocument {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

impl TableDocument {
    pub fn new(headers: Vec<String>, rows: Vec<Vec<String>>) -> Self {
        Self { headers, rows }
    }

    pub fn validate_headers(&self, expected: &[&str]) -> TableValidationReport {
        validate_headers(&self.headers, expected)
    }
}

/// 表格文件读取请求。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableFileRequest {
    pub path: String,
}

/// 表格文件导出请求。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportTableRequest {
    pub path: String,
    pub document: TableDocument,
}

/// 表格文件操作错误。
#[derive(Debug, Error)]
pub enum TableFileError {
    #[error("failed to read table file {path}: {source}")]
    Read {
        path: String,
        source: std::io::Error,
    },
    #[error("failed to write table file {path}: {source}")]
    Write {
        path: String,
        source: std::io::Error,
    },
    #[error("failed to open workbook {path}: {source}")]
    WorkbookOpen {
        path: String,
        source: calamine::Error,
    },
    #[error("failed to read workbook sheet {path}: {source}")]
    WorkbookSheet {
        path: String,
        source: calamine::Error,
    },
    #[error("workbook {path} has no sheets")]
    NoSheets { path: String },
    #[error("table file {path} is empty")]
    Empty { path: String },
}

/// 读取 CSV 文件为表格文档。
///
/// 使用逗号分隔，行尾 `\r` 自动去除，空行跳过。
pub fn read_csv(path: impl AsRef<Path>) -> Result<TableDocument, TableFileError> {
    let path_ref = path.as_ref();
    let content = fs::read_to_string(path_ref).map_err(|source| TableFileError::Read {
        path: path_ref.display().to_string(),
        source,
    })?;
    let mut lines = content.lines();
    let Some(header_line) = lines.next() else {
        return Err(TableFileError::Empty {
            path: path_ref.display().to_string(),
        });
    };
    let headers = split_legacy_csv_line(header_line);
    let rows = lines
        .filter(|line| !line.trim().is_empty())
        .map(split_legacy_csv_line)
        .collect::<Vec<_>>();

    Ok(TableDocument { headers, rows })
}

/// 将表格文档写入 CSV 文件。
///
/// 值内的逗号会被替换为空格（兼容旧版格式）。
pub fn write_csv(path: impl AsRef<Path>, document: &TableDocument) -> Result<(), TableFileError> {
    let path_ref = path.as_ref();
    let mut lines = Vec::with_capacity(document.rows.len() + 1);
    lines.push(join_legacy_csv_line(&document.headers));
    lines.extend(document.rows.iter().map(|row| join_legacy_csv_line(row)));
    let mut content = lines.join("\n");
    content.push('\n');

    fs::write(path_ref, content).map_err(|source| TableFileError::Write {
        path: path_ref.display().to_string(),
        source,
    })
}

/// 读取 Excel 工作簿（`.xlsx`/`.xls`）的第一个工作表为表格文档。
pub fn read_workbook(path: impl AsRef<Path>) -> Result<TableDocument, TableFileError> {
    let path_ref = path.as_ref();
    let mut workbook =
        open_workbook_auto(path_ref).map_err(|source| TableFileError::WorkbookOpen {
            path: path_ref.display().to_string(),
            source,
        })?;
    let sheet_name =
        workbook
            .sheet_names()
            .first()
            .cloned()
            .ok_or_else(|| TableFileError::NoSheets {
                path: path_ref.display().to_string(),
            })?;
    let range =
        workbook
            .worksheet_range(&sheet_name)
            .map_err(|source| TableFileError::WorkbookSheet {
                path: path_ref.display().to_string(),
                source,
            })?;
    let mut rows = range.rows().map(|row| {
        row.iter()
            .map(ToString::to_string)
            .map(|item| item.trim().to_string())
            .collect::<Vec<_>>()
    });
    let Some(headers) = rows.next() else {
        return Err(TableFileError::Empty {
            path: path_ref.display().to_string(),
        });
    };

    Ok(TableDocument {
        headers,
        rows: rows
            .filter(|row| row.iter().any(|cell| !cell.is_empty()))
            .collect(),
    })
}

/// 将表格文档导出为 Excel XML 格式（可直接用 Excel 打开）。
pub fn write_workbook_xml(
    path: impl AsRef<Path>,
    document: &TableDocument,
) -> Result<(), TableFileError> {
    let path_ref = path.as_ref();
    let mut content = String::from(
        r#"<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="protocol"><Table>
"#,
    );
    content.push_str(&workbook_row_xml(&document.headers));
    for row in &document.rows {
        content.push_str(&workbook_row_xml(row));
    }
    content.push_str("</Table></Worksheet></Workbook>\n");

    fs::write(path_ref, content).map_err(|source| TableFileError::Write {
        path: path_ref.display().to_string(),
        source,
    })
}

fn workbook_row_xml(row: &[String]) -> String {
    let cells = row
        .iter()
        .map(|cell| {
            format!(
                "<Cell><Data ss:Type=\"String\">{}</Data></Cell>",
                escape_xml(cell)
            )
        })
        .collect::<String>();
    format!("<Row>{}</Row>\n", cells)
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn split_legacy_csv_line(line: &str) -> Vec<String> {
    line.trim_end_matches('\r')
        .split(',')
        .map(|item| item.trim().to_string())
        .collect()
}

fn join_legacy_csv_line(row: &[String]) -> String {
    row.iter()
        .map(|item| item.replace(',', " "))
        .collect::<Vec<_>>()
        .join(",")
}

/// 表头校验报告。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableValidationReport {
    pub valid: bool,
    pub expected_headers: Vec<String>,
    pub actual_headers: Vec<String>,
    pub errors: Vec<String>,
}

/// 校验实际表头是否与期望完全匹配（列数和每列表头文本）。
pub fn validate_headers(actual: &[String], expected: &[&str]) -> TableValidationReport {
    let expected_headers = expected
        .iter()
        .map(|item| (*item).to_string())
        .collect::<Vec<_>>();
    let mut errors = Vec::new();

    if actual.len() != expected.len() {
        errors.push(format!(
            "表头数量错误：期望 {} 列，实际 {} 列",
            expected.len(),
            actual.len()
        ));
    }

    for (index, expected_header) in expected.iter().enumerate() {
        let actual_header = actual.get(index).map(String::as_str).unwrap_or("");
        if actual_header != *expected_header {
            errors.push(format!(
                "第 {} 列表头错误：期望 `{}`，实际 `{}`",
                index + 1,
                expected_header,
                actual_header
            ));
        }
    }

    TableValidationReport {
        valid: errors.is_empty(),
        expected_headers,
        actual_headers: actual.to_vec(),
        errors,
    }
}

/// 校验多语言表头：前两列固定，或使用新版 `序号、类型、auto` 前缀；后续列需包含 `_` 分隔的语言代码。
pub fn validate_language_headers(actual: &[String]) -> TableValidationReport {
    let mut errors = Vec::new();
    let has_type_column = actual.get(1).map(String::as_str) == Some("类型");
    let prefix_headers: &[&str] = if has_type_column {
        &["序号", "类型", "auto"]
    } else {
        LANGUAGE_REQUIRED_PREFIX_HEADERS
    };
    let min_columns = prefix_headers.len() + 1;

    if actual.len() < min_columns {
        errors.push("多语言表至少需要包含：序号、auto、一个语言列".to_string());
    }

    for (index, expected_header) in prefix_headers.iter().enumerate() {
        let actual_header = actual.get(index).map(String::as_str).unwrap_or("");
        if actual_header != *expected_header {
            errors.push(format!(
                "第 {} 列表头错误：期望 `{}`，实际 `{}`",
                index + 1,
                expected_header,
                actual_header
            ));
        }
    }

    for header in actual.iter().skip(prefix_headers.len()) {
        if !header.contains('_') {
            errors.push(format!(
                "语言列表头 `{}` 缺少语言代码后缀，例如 中文_zh",
                header
            ));
        }
    }

    TableValidationReport {
        valid: errors.is_empty(),
        expected_headers: vec![
            "序号".to_string(),
            "类型".to_string(),
            "auto".to_string(),
            "中文_zh".to_string(),
        ],
        actual_headers: actual.to_vec(),
        errors,
    }
}
