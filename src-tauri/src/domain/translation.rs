//! 在线翻译服务集成。

use serde::{Deserialize, Serialize};

const BAIDU_TRANSLATE_URL: &str = "https://fanyi-api.baidu.com/api/trans/vip/translate";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaiduTranslateRequest {
    pub app_id: String,
    pub app_key: String,
    pub from: String,
    pub to: String,
    pub texts: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BaiduTranslateResponse {
    pub translations: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct BaiduApiResponse {
    trans_result: Option<Vec<BaiduTranslationItem>>,
    error_code: Option<String>,
    error_msg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BaiduTranslationItem {
    dst: String,
}

pub async fn translate_with_baidu(
    request: BaiduTranslateRequest,
) -> Result<BaiduTranslateResponse, String> {
    let app_id = request.app_id.trim();
    let app_key = request.app_key.trim();
    if app_id.is_empty() || app_key.is_empty() {
        return Err("请先填写百度翻译 App ID 和 API Key".to_string());
    }

    let from = normalize_baidu_language_code(&request.from);
    let to = normalize_baidu_language_code(&request.to);
    if from == to {
        return Err("源语言和目标语言不能相同".to_string());
    }

    let client = reqwest::Client::new();
    let mut translations = Vec::with_capacity(request.texts.len());

    for text in request.texts {
        let query = text.trim();
        if query.is_empty() {
            translations.push(String::new());
            continue;
        }

        let salt = salt_for_query(query);
        let sign_source = format!("{app_id}{query}{salt}{app_key}");
        let sign = format!("{:x}", md5::compute(sign_source.as_bytes()));
        let params = [
            ("appid", app_id.to_string()),
            ("q", query.to_string()),
            ("from", from.clone()),
            ("to", to.clone()),
            ("salt", salt),
            ("sign", sign),
        ];

        let response = client
            .post(BAIDU_TRANSLATE_URL)
            .form(&params)
            .send()
            .await
            .map_err(|error| format!("百度翻译请求失败：{error}"))?;

        if !response.status().is_success() {
            return Err(format!("百度翻译请求失败：HTTP {}", response.status()));
        }

        let payload = response
            .json::<BaiduApiResponse>()
            .await
            .map_err(|error| format!("解析百度翻译响应失败：{error}"))?;

        if let Some(code) = payload.error_code {
            let message = payload.error_msg.unwrap_or_else(|| "未知错误".to_string());
            return Err(format!("百度翻译失败：{code} {message}"));
        }

        let translated = payload
            .trans_result
            .and_then(|items| items.into_iter().next())
            .map(|item| item.dst)
            .unwrap_or_default();
        translations.push(translated);
    }

    Ok(BaiduTranslateResponse { translations })
}

fn salt_for_query(query: &str) -> String {
    let digest = md5::compute(query.as_bytes());
    let mut bytes = [0u8; 4];
    bytes.copy_from_slice(&digest[0..4]);
    let value = u32::from_le_bytes(bytes);
    (32768 + value % 32768).to_string()
}

fn normalize_baidu_language_code(code: &str) -> String {
    match code.trim().to_lowercase().as_str() {
        "zh-cn" | "zh_hans" | "zh-hans" => "zh".to_string(),
        "zh-tw" | "zh_hant" | "zh-hant" | "tw" => "cht".to_string(),
        "ja" => "jp".to_string(),
        "ko" => "kor".to_string(),
        "fr" => "fra".to_string(),
        "es" => "spa".to_string(),
        "ar" => "ara".to_string(),
        "vi" => "vie".to_string(),
        "sv" => "swe".to_string(),
        "id" => "ind".to_string(),
        "ms" => "may".to_string(),
        other => other.to_string(),
    }
}
