//! JSON 文件的读取与序列化写入。

use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs;
use std::path::Path;
use thiserror::Error;

/// JSON 存储操作错误。
#[derive(Debug, Error)]
pub enum JsonStoreError {
    #[error("failed to read json file {path}: {source}")]
    Read {
        path: String,
        source: std::io::Error,
    },
    #[error("failed to write json file {path}: {source}")]
    Write {
        path: String,
        source: std::io::Error,
    },
    #[error("failed to parse json file {path}: {source}")]
    Parse {
        path: String,
        source: serde_json::Error,
    },
    #[error("failed to serialize json: {0}")]
    Serialize(serde_json::Error),
}

/// 从文件读取 JSON 并反序列化为指定类型。
pub fn read_json<T: DeserializeOwned>(path: impl AsRef<Path>) -> Result<T, JsonStoreError> {
    let path_ref = path.as_ref();
    let content = fs::read_to_string(path_ref).map_err(|source| JsonStoreError::Read {
        path: path_ref.display().to_string(),
        source,
    })?;
    serde_json::from_str(content.strip_prefix('\u{FEFF}').unwrap_or(&content)).map_err(|source| {
        JsonStoreError::Parse {
            path: path_ref.display().to_string(),
            source,
        }
    })
}

/// 将值序列化为格式化 JSON 并写入文件。
pub fn write_json<T: Serialize>(path: impl AsRef<Path>, value: &T) -> Result<(), JsonStoreError> {
    let path_ref = path.as_ref();
    let content = serde_json::to_string_pretty(value).map_err(JsonStoreError::Serialize)?;
    fs::write(path_ref, content).map_err(|source| JsonStoreError::Write {
        path: path_ref.display().to_string(),
        source,
    })
}

#[cfg(test)]
mod tests {
    use super::read_json;
    use serde_json::Value;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn read_json_accepts_utf8_bom() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("jc-json-store-{unique}.json"));
        fs::write(&path, "\u{FEFF}{\"enabled\":true}").expect("write test JSON");

        let value: Value = read_json(&path).expect("read JSON with BOM");
        fs::remove_file(path).expect("remove test JSON");

        assert_eq!(value["enabled"], true);
    }
}
