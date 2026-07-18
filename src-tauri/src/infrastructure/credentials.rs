//! 操作系统凭据库封装。

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};

const CREDENTIAL_SERVICE: &str = "com.jc.custom-platform";
const BAIDU_TRANSLATE_ACCOUNT: &str = "baidu-translate";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationCredentials {
    pub app_id: String,
    pub app_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTranslationCredentialsRequest {
    pub app_id: String,
    pub app_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TranslationCredentialStatus {
    pub app_id: String,
    pub has_app_key: bool,
}

fn credential_entry(service: &str, account: &str) -> Result<Entry, String> {
    Entry::new(service, account).map_err(|error| format!("无法访问系统凭据库：{error}"))
}

fn load_from(service: &str, account: &str) -> Result<Option<TranslationCredentials>, String> {
    let entry = credential_entry(service, account)?;
    let stored = match entry.get_password() {
        Ok(value) => value,
        Err(KeyringError::NoEntry) => return Ok(None),
        Err(error) => return Err(format!("读取系统凭据失败：{error}")),
    };
    serde_json::from_str(&stored)
        .map(Some)
        .map_err(|_| "系统凭据格式无效，请清空后重新保存翻译配置。".to_string())
}

fn save_to(
    service: &str,
    account: &str,
    credentials: &TranslationCredentials,
) -> Result<(), String> {
    let encoded = serde_json::to_string(credentials)
        .map_err(|error| format!("序列化翻译凭据失败：{error}"))?;
    credential_entry(service, account)?
        .set_password(&encoded)
        .map_err(|error| format!("保存系统凭据失败：{error}"))
}

fn clear_from(service: &str, account: &str) -> Result<(), String> {
    match credential_entry(service, account)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("删除系统凭据失败：{error}")),
    }
}

pub fn load_translation_credentials() -> Result<Option<TranslationCredentials>, String> {
    load_from(CREDENTIAL_SERVICE, BAIDU_TRANSLATE_ACCOUNT)
}

pub fn translation_credential_status() -> Result<TranslationCredentialStatus, String> {
    let credentials = load_translation_credentials()?;
    Ok(status_from(credentials.as_ref()))
}

fn status_from(credentials: Option<&TranslationCredentials>) -> TranslationCredentialStatus {
    TranslationCredentialStatus {
        app_id: credentials
            .map(|value| value.app_id.clone())
            .unwrap_or_default(),
        has_app_key: credentials.is_some_and(|value| !value.app_key.trim().is_empty()),
    }
}

pub fn save_translation_credentials(
    request: SaveTranslationCredentialsRequest,
) -> Result<TranslationCredentialStatus, String> {
    let app_id = request.app_id.trim().to_string();
    if app_id.is_empty() {
        return Err("请输入百度翻译 App ID。".to_string());
    }

    let existing = load_translation_credentials()?;
    let app_key = request
        .app_key
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .or_else(|| existing.map(|value| value.app_key))
        .ok_or_else(|| "请输入百度翻译 API Key。".to_string())?;

    save_to(
        CREDENTIAL_SERVICE,
        BAIDU_TRANSLATE_ACCOUNT,
        &TranslationCredentials {
            app_id: app_id.clone(),
            app_key,
        },
    )?;
    Ok(TranslationCredentialStatus {
        app_id,
        has_app_key: true,
    })
}

pub fn clear_translation_credentials() -> Result<(), String> {
    clear_from(CREDENTIAL_SERVICE, BAIDU_TRANSLATE_ACCOUNT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    fn stores_credentials_without_exposing_the_key_in_status() {
        let service = format!(
            "com.jc.custom-platform.test.{}.{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        );
        let account = "translation-test";
        let credentials = TranslationCredentials {
            app_id: "test-app".to_string(),
            app_key: "test-secret".to_string(),
        };

        save_to(&service, account, &credentials).expect("credential should save");
        let loaded = load_from(&service, account)
            .expect("credential should load")
            .expect("credential should exist");
        assert_eq!(loaded.app_id, "test-app");
        assert_eq!(loaded.app_key, "test-secret");
        let status = status_from(Some(&loaded));
        assert_eq!(status.app_id, "test-app");
        assert!(status.has_app_key);
        let serialized = serde_json::to_string(&status).expect("status should serialize");
        assert!(!serialized.contains("test-secret"));
        clear_from(&service, account).expect("credential should clear");
        assert!(load_from(&service, account)
            .expect("missing credential should not fail")
            .is_none());
    }
}
