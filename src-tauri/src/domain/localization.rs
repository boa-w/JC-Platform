//! `jc002` dynamic language-pack codec compatible with LVGL `lv_i18n` semantics.
//!
//! This module deliberately does not read `jc001.language_info`. Version 1 is
//! handled by the legacy exporter; version 2 exclusively uses `localization`.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashMap};

pub const I18N_MAGIC: u32 = u32::from_le_bytes(*b"LVI2");
pub const I18N_SCHEMA_VERSION: u16 = 2;
pub const I18N_FLAG_LOCALE_NAME_KEYS: u16 = 1;
pub const LOCALE_NAME_KEY_PREFIX: &str = "language.name.";
pub const I18N_PLURAL_FORM_COUNT: usize = 6;
const HEADER_SIZE: usize = 40;
const LOCALE_RECORD_SIZE: usize = 16;
const MESSAGE_RECORD_SIZE: usize = 16;
const MISSING_OFFSET: u32 = u32::MAX;
const PLURAL_NAMES: [&str; I18N_PLURAL_FORM_COUNT] = ["zero", "one", "two", "few", "many", "other"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DynamicLanguagePackSummary {
    pub schema_version: u16,
    pub default_locale: String,
    pub locales: Vec<String>,
    pub message_count: usize,
    pub byte_length: usize,
}

#[derive(Debug, Clone)]
pub struct DynamicLanguagePackBuild {
    pub bytes: Vec<u8>,
    pub summary: DynamicLanguagePackSummary,
    pub message_indexes: HashMap<String, u32>,
}

impl DynamicLanguagePackBuild {
    pub fn require_message_index(&self, key: &str) -> Result<u32, String> {
        self.message_indexes
            .get(key)
            .copied()
            .ok_or_else(|| format!("jc002 localization 缺少消息 key：{key}"))
    }
}

type PluralForms = [Option<String>; I18N_PLURAL_FORM_COUNT];
type Messages = BTreeMap<String, HashMap<String, PluralForms>>;

struct SourcePack {
    default_locale: String,
    locales: Vec<String>,
    messages: Messages,
}

pub fn locale_name_key(locale: &str) -> String {
    format!("{LOCALE_NAME_KEY_PREFIX}{locale}")
}

pub fn build_dynamic_language_pack(document: &Value) -> Result<DynamicLanguagePackBuild, String> {
    require_jc002(document)?;
    let source = source_pack(document)?;
    let mut message_keys = source.messages.keys().cloned().collect::<Vec<_>>();
    message_keys.sort_by(|left, right| {
        fnv1a32(left.as_bytes())
            .cmp(&fnv1a32(right.as_bytes()))
            .then_with(|| left.cmp(right))
    });
    let locale_count = source.locales.len();
    let message_count = message_keys.len();
    let translation_count = locale_count
        .checked_mul(message_count)
        .and_then(|count| count.checked_mul(I18N_PLURAL_FORM_COUNT))
        .ok_or_else(|| "jc002 动态语言包翻译表大小溢出".to_string())?;
    if locale_count > u16::MAX as usize || message_count > u32::MAX as usize {
        return Err("jc002 动态语言包条目数量超过格式上限".to_string());
    }

    let locale_table_offset = HEADER_SIZE;
    let message_table_offset = locale_table_offset + locale_count * LOCALE_RECORD_SIZE;
    let translation_table_offset = message_table_offset + message_count * MESSAGE_RECORD_SIZE;
    let string_pool_offset = translation_table_offset + translation_count * 4;
    let mut string_pool = Vec::new();
    let mut string_offsets = HashMap::<String, u32>::new();
    let mut intern = |value: &str| -> Result<u32, String> {
        if let Some(offset) = string_offsets.get(value) {
            return Ok(*offset);
        }
        let absolute = string_pool_offset
            .checked_add(string_pool.len())
            .ok_or_else(|| "jc002 动态语言包字符串池偏移溢出".to_string())?;
        let offset =
            u32::try_from(absolute).map_err(|_| "jc002 动态语言包超过 4 GiB".to_string())?;
        string_pool.extend_from_slice(value.as_bytes());
        string_pool.push(0);
        string_offsets.insert(value.to_string(), offset);
        Ok(offset)
    };

    let locale_offsets = source
        .locales
        .iter()
        .map(|locale| intern(locale))
        .collect::<Result<Vec<_>, _>>()?;
    let message_indexes = message_keys
        .iter()
        .enumerate()
        .map(|(index, key)| (key.clone(), index as u32))
        .collect::<HashMap<_, _>>();
    let locale_name_message_indexes = source
        .locales
        .iter()
        .map(|locale| {
            message_indexes
                .get(&locale_name_key(locale))
                .copied()
                .ok_or_else(|| format!("jc002 语言 {locale} 缺少语言名称 key"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let key_offsets = message_keys
        .iter()
        .map(|key| intern(key))
        .collect::<Result<Vec<_>, _>>()?;
    let default_locale_index = source
        .locales
        .iter()
        .position(|locale| locale == &source.default_locale)
        .ok_or_else(|| "jc002 default_locale 未启用".to_string())?;
    let mut translations = vec![MISSING_OFFSET; translation_count];
    for (locale_index, locale) in source.locales.iter().enumerate() {
        for (message_index, key) in message_keys.iter().enumerate() {
            let Some(forms) = source
                .messages
                .get(key)
                .and_then(|translations| translations.get(locale))
            else {
                continue;
            };
            for (form_index, value) in forms.iter().enumerate() {
                let Some(value) = value.as_deref().filter(|value| !value.is_empty()) else {
                    continue;
                };
                let index = ((locale_index * message_count + message_index)
                    * I18N_PLURAL_FORM_COUNT)
                    + form_index;
                translations[index] = intern(value)?;
            }
        }
    }

    let flags = I18N_FLAG_LOCALE_NAME_KEYS;

    let total_size = string_pool_offset
        .checked_add(string_pool.len())
        .ok_or_else(|| "jc002 动态语言包总大小溢出".to_string())?;
    let mut bytes = Vec::with_capacity(total_size);
    write_u32(&mut bytes, I18N_MAGIC);
    write_u16(&mut bytes, I18N_SCHEMA_VERSION);
    write_u16(&mut bytes, flags);
    write_u32(&mut bytes, total_size as u32);
    write_u16(&mut bytes, locale_count as u16);
    write_u16(&mut bytes, default_locale_index as u16);
    write_u32(&mut bytes, message_count as u32);
    write_u32(&mut bytes, locale_table_offset as u32);
    write_u32(&mut bytes, message_table_offset as u32);
    write_u32(&mut bytes, translation_table_offset as u32);
    write_u32(&mut bytes, string_pool_offset as u32);
    write_u32(&mut bytes, 0);

    for (locale_index, locale) in source.locales.iter().enumerate() {
        let table_offset =
            translation_table_offset + locale_index * message_count * I18N_PLURAL_FORM_COUNT * 4;
        write_u32(&mut bytes, locale_offsets[locale_index]);
        write_u32(&mut bytes, table_offset as u32);
        write_u16(&mut bytes, plural_rule_id(locale));
        write_u16(&mut bytes, locale_direction(document, locale));
        write_u32(&mut bytes, locale_name_message_indexes[locale_index]);
    }
    for (message_index, key) in message_keys.iter().enumerate() {
        let forms_mask = source.messages[key].values().fold(0u8, |mask, forms| {
            forms.iter().enumerate().fold(mask, |mask, (index, value)| {
                mask | if value.is_some() { 1 << index } else { 0 }
            })
        });
        write_u32(&mut bytes, fnv1a32(key.as_bytes()));
        write_u32(&mut bytes, key_offsets[message_index]);
        bytes.extend_from_slice(&[forms_mask, 0, 0, 0]);
        write_u32(&mut bytes, 0);
    }
    for offset in translations {
        write_u32(&mut bytes, offset);
    }
    bytes.extend(string_pool);
    let checksum = crc32_with_zeroed_checksum(&bytes);
    bytes[36..40].copy_from_slice(&checksum.to_le_bytes());

    Ok(DynamicLanguagePackBuild {
        summary: DynamicLanguagePackSummary {
            schema_version: I18N_SCHEMA_VERSION,
            default_locale: source.default_locale,
            locales: source.locales,
            message_count,
            byte_length: bytes.len(),
        },
        bytes,
        message_indexes,
    })
}

pub fn validate_localization(document: &Value) -> Result<(), String> {
    require_jc002(document)?;
    source_pack(document).map(|_| ())
}

/// Validate a partial localization catalog owned by one protocol Profile.
///
/// The project-level catalog owns the locale set and its order. A Profile
/// overlay may only provide translations for those locales, while its message
/// keys may be shared with or additional to the public catalog.
pub fn validate_localization_overlay(
    document: &Value,
    overlay: &Value,
    label: &str,
) -> Result<(), String> {
    let base_locales = document
        .get("localization")
        .and_then(|value| value.get("locales"))
        .and_then(Value::as_object)
        .ok_or_else(|| format!("{label} 无法校验：项目缺少 localization.locales"))?;
    let overlay_object = overlay
        .as_object()
        .ok_or_else(|| format!("{label} 必须为对象"))?;
    if overlay_object.keys().any(|key| key != "locales") {
        return Err(format!(
            "{label} 只允许包含 locales，不得定义 default_locale 或 locale_order"
        ));
    }
    let empty_locales = Map::new();
    let locales = overlay_object
        .get("locales")
        .map(|value| {
            value
                .as_object()
                .ok_or_else(|| format!("{label}.locales 必须为对象"))
        })
        .transpose()?
        .unwrap_or(&empty_locales);

    for (locale, value) in locales {
        if !base_locales.contains_key(locale) {
            return Err(format!(
                "{label}.locales.{locale} 不在公共 localization.locale_order 中"
            ));
        }
        let locale_object = value
            .as_object()
            .ok_or_else(|| format!("{label}.locales.{locale} 必须为对象"))?;
        if locale_object.keys().any(|key| key != "translations") {
            return Err(format!("{label}.locales.{locale} 只允许包含 translations"));
        }
        let empty_translations = Map::new();
        let translations = locale_object
            .get("translations")
            .map(|value| {
                value
                    .as_object()
                    .ok_or_else(|| format!("{label}.locales.{locale}.translations 必须为对象"))
            })
            .transpose()?
            .unwrap_or(&empty_translations);
        for (key, message) in translations {
            if key.trim().is_empty() {
                return Err(format!("{label}.locales.{locale} 存在空消息 key"));
            }
            if key.starts_with(LOCALE_NAME_KEY_PREFIX) {
                return Err(format!(
                    "{label}.locales.{locale} 不得覆盖语言名称 key {key}"
                ));
            }
            parse_forms(message).map_err(|error| {
                format!("{label}.locales.{locale}.translations.{key} 无效：{error}")
            })?;
        }
    }
    Ok(())
}

/// Merge controller, battery, and fault-code overlays onto the common localization tree.
///
/// Overlay order is controller, battery, then fault code. If selected
/// Profiles define the same locale/key with different values, the combination
/// is rejected instead of relying on an undocumented precedence rule.
pub fn merge_localization_overlays(
    localization: &Value,
    overlays: &[(&str, &Value)],
) -> Result<Value, String> {
    let mut merged = localization.clone();
    let locales = merged
        .as_object_mut()
        .and_then(|root| root.get_mut("locales"))
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "jc002 localization.locales 必须为对象".to_string())?;
    let mut applied = HashMap::<(String, String), Value>::new();
    let empty_locales = Map::new();
    let empty_translations = Map::new();

    for (label, overlay) in overlays {
        let overlay_locales = overlay
            .get("locales")
            .and_then(Value::as_object)
            .unwrap_or(&empty_locales);
        for (locale, locale_value) in overlay_locales {
            let translations = locale_value
                .get("translations")
                .and_then(Value::as_object)
                .unwrap_or(&empty_translations);
            let locale_object = locales
                .get_mut(locale)
                .and_then(Value::as_object_mut)
                .ok_or_else(|| format!("{label}.locales.{locale} 不在公共语言目录中"))?;
            let target_translations = locale_object
                .entry("translations".to_string())
                .or_insert_with(|| Value::Object(Map::new()))
                .as_object_mut()
                .ok_or_else(|| format!("公共语言目录 {locale}.translations 必须为对象"))?;
            for (key, value) in translations {
                if key.starts_with(LOCALE_NAME_KEY_PREFIX) {
                    return Err(format!(
                        "{label}.locales.{locale} 不得覆盖语言名称 key {key}"
                    ));
                }
                let identity = (locale.clone(), key.clone());
                if let Some(previous) = applied.get(&identity) {
                    if previous != value {
                        return Err(format!(
                            "Profile overlay 文案冲突：{locale}/{key} 同时由多个 Profile 定义"
                        ));
                    }
                } else {
                    applied.insert(identity, value.clone());
                }
                target_translations.insert(key.clone(), value.clone());
            }
        }
    }
    Ok(merged)
}

pub fn decode_dynamic_language_pack(bytes: &[u8]) -> Result<DynamicLanguagePackSummary, String> {
    if bytes.len() < HEADER_SIZE || read_u32(bytes, 0)? != I18N_MAGIC {
        return Err("jc002 动态语言包头无效".to_string());
    }
    let schema_version = read_u16(bytes, 4)?;
    if schema_version != I18N_SCHEMA_VERSION {
        return Err(format!("不支持的 jc002 动态语言包版本：{schema_version}"));
    }
    let flags = read_u16(bytes, 6)?;
    if flags != I18N_FLAG_LOCALE_NAME_KEYS {
        return Err("jc002 动态语言包必须包含语言名称 message_index 扩展".to_string());
    }
    let total_size = read_u32(bytes, 8)? as usize;
    if total_size != bytes.len() {
        return Err(format!(
            "jc002 动态语言包长度不一致：声明 {total_size}，实际 {}",
            bytes.len()
        ));
    }
    if crc32_with_zeroed_checksum(bytes) != read_u32(bytes, 36)? {
        return Err("jc002 动态语言包 CRC32 校验失败".to_string());
    }
    let locale_count = read_u16(bytes, 12)? as usize;
    let default_index = read_u16(bytes, 14)? as usize;
    let message_count = read_u32(bytes, 16)? as usize;
    let locale_offset = read_u32(bytes, 20)? as usize;
    let message_offset = read_u32(bytes, 24)? as usize;
    let translation_offset = read_u32(bytes, 28)? as usize;
    let string_pool_offset = read_u32(bytes, 32)? as usize;
    checked_region(
        bytes,
        locale_offset,
        locale_count,
        LOCALE_RECORD_SIZE,
        "locale",
    )?;
    checked_region(
        bytes,
        message_offset,
        message_count,
        MESSAGE_RECORD_SIZE,
        "message",
    )?;
    checked_region(
        bytes,
        translation_offset,
        locale_count
            .checked_mul(message_count)
            .and_then(|value| value.checked_mul(I18N_PLURAL_FORM_COUNT))
            .ok_or_else(|| "translation 区大小溢出".to_string())?,
        4,
        "translation",
    )?;
    if locale_count == 0 || default_index >= locale_count || string_pool_offset > bytes.len() {
        return Err("jc002 动态语言包目录无效".to_string());
    }
    let mut locales = Vec::with_capacity(locale_count);
    for index in 0..locale_count {
        let record = locale_offset + index * LOCALE_RECORD_SIZE;
        locales.push(
            read_pool_string(bytes, string_pool_offset, read_u32(bytes, record)?)?.to_string(),
        );
    }
    let mut message_keys = Vec::with_capacity(message_count);
    for index in 0..message_count {
        let record = message_offset + index * MESSAGE_RECORD_SIZE;
        let key = read_pool_string(bytes, string_pool_offset, read_u32(bytes, record + 4)?)?;
        if fnv1a32(key.as_bytes()) != read_u32(bytes, record)? {
            return Err(format!("消息 {key} 的 hash 校验失败"));
        }
        message_keys.push(key);
    }
    for (locale_index, locale) in locales.iter().enumerate() {
        let record = locale_offset + locale_index * LOCALE_RECORD_SIZE;
        let name_message_index = read_u32(bytes, record + 12)? as usize;
        if name_message_index >= message_count
            || message_keys[name_message_index] != locale_name_key(locale)
        {
            return Err(format!("语言 {locale} 的名称 message_index 无效"));
        }
    }
    Ok(DynamicLanguagePackSummary {
        schema_version,
        default_locale: locales[default_index].clone(),
        locales,
        message_count,
        byte_length: bytes.len(),
    })
}

fn require_jc002(document: &Value) -> Result<(), String> {
    match document.get("config_version").and_then(Value::as_str) {
        Some("jc002") if document.get("language_info").is_some() => {
            Err("jc002 项目禁止包含 jc001 language_info".to_string())
        }
        Some("jc002") => Ok(()),
        Some(version) => Err(format!("jc002 动态语言编码器拒绝配置版本 {version}")),
        None => Err("jc002 项目缺少 config_version".to_string()),
    }
}

fn source_pack(document: &Value) -> Result<SourcePack, String> {
    let localization = document
        .get("localization")
        .ok_or_else(|| "jc002 项目缺少 localization".to_string())?;
    if localization.get("locale_labels").is_some() {
        return Err(
            "jc002 localization 禁止 locale_labels，请使用 language.name.<locale> key".to_string(),
        );
    }
    let locales_object = localization
        .get("locales")
        .and_then(Value::as_object)
        .ok_or_else(|| "jc002 localization.locales 必须是对象".to_string())?;
    let enabled_locales = locales_object
        .iter()
        .filter(|(_, item)| item.get("enabled").and_then(Value::as_bool).unwrap_or(true))
        .map(|(locale, _)| locale.clone())
        .collect::<std::collections::HashSet<_>>();
    let locales = localization
        .get("locale_order")
        .and_then(Value::as_array)
        .ok_or_else(|| "jc002 localization.locale_order 必填".to_string())?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| "jc002 locale_order 只能包含语言代码".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let ordered_locales = locales
        .iter()
        .cloned()
        .collect::<std::collections::HashSet<_>>();
    if locales.len() != ordered_locales.len() || ordered_locales != enabled_locales {
        return Err("jc002 locale_order 必须无重复地列出全部启用语言".to_string());
    }
    let default_locale = localization
        .get("default_locale")
        .and_then(Value::as_str)
        .ok_or_else(|| "jc002 localization.default_locale 必填".to_string())?
        .to_string();
    if locales.is_empty() || !locales.contains(&default_locale) {
        return Err("jc002 default_locale 必须是启用语言".to_string());
    }
    let mut messages = Messages::new();
    for locale in &locales {
        let translations = locales_object
            .get(locale)
            .and_then(|item| item.get("translations"))
            .and_then(Value::as_object)
            .ok_or_else(|| format!("jc002 语言 {locale} 缺少 translations"))?;
        for (key, value) in translations {
            if key.trim().is_empty() {
                return Err(format!("jc002 语言 {locale} 存在空消息 key"));
            }
            messages
                .entry(key.clone())
                .or_default()
                .insert(locale.clone(), parse_forms(value)?);
        }
    }
    for display_locale in &locales {
        let translations = locales_object
            .get(display_locale)
            .and_then(|item| item.get("translations"))
            .and_then(Value::as_object)
            .ok_or_else(|| format!("jc002 语言 {display_locale} 缺少 translations"))?;
        for target_locale in &locales {
            let key = locale_name_key(target_locale);
            let value = translations
                .get(&key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .ok_or_else(|| {
                    format!("jc002 语言 {display_locale} 缺少非空语言名称翻译 key {key}")
                })?;
            if value.is_empty() {
                return Err(format!("jc002 语言名称翻译 key {key} 不能为空"));
            }
        }
    }
    if messages.is_empty() {
        return Err("jc002 localization 没有消息".to_string());
    }
    Ok(SourcePack {
        default_locale,
        locales,
        messages,
    })
}

fn parse_forms(value: &Value) -> Result<PluralForms, String> {
    let mut forms = std::array::from_fn(|_| None);
    if let Some(value) = value.as_str() {
        forms[5] = Some(value.to_string());
        return Ok(forms);
    }
    let object = value
        .as_object()
        .ok_or_else(|| "翻译值必须是字符串或 CLDR 复数对象".to_string())?;
    for (index, name) in PLURAL_NAMES.iter().enumerate() {
        forms[index] = object
            .get(*name)
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    if forms.iter().all(Option::is_none) {
        return Err("CLDR 复数对象至少需要一个有效形式".to_string());
    }
    Ok(forms)
}

fn locale_direction(document: &Value, locale: &str) -> u16 {
    let explicit = document["localization"]["locales"][locale]["direction"].as_str();
    if explicit == Some("rtl")
        || matches!(
            locale.split(['-', '_']).next(),
            Some("ar" | "fa" | "he" | "ur")
        )
    {
        1
    } else {
        0
    }
}

fn plural_rule_id(locale: &str) -> u16 {
    match locale
        .to_ascii_lowercase()
        .split(['-', '_'])
        .next()
        .unwrap_or("")
    {
        "ru" | "uk" | "be" => 2,
        "ar" => 3,
        "fr" | "pt" => 4,
        "zh" | "ja" | "ko" | "vi" | "th" => 0,
        _ => 1,
    }
}

pub fn fnv1a32(bytes: &[u8]) -> u32 {
    bytes.iter().fold(0x811c9dc5u32, |hash, byte| {
        (hash ^ u32::from(*byte)).wrapping_mul(0x01000193)
    })
}

fn crc32_with_zeroed_checksum(bytes: &[u8]) -> u32 {
    let mut crc = u32::MAX;
    for (index, byte) in bytes.iter().enumerate() {
        let byte = if (36..40).contains(&index) { 0 } else { *byte };
        crc ^= u32::from(byte);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb88320 & (0u32.wrapping_sub(crc & 1)));
        }
    }
    !crc
}

fn checked_region(
    bytes: &[u8],
    offset: usize,
    count: usize,
    item_size: usize,
    label: &str,
) -> Result<(), String> {
    let end = count
        .checked_mul(item_size)
        .and_then(|size| offset.checked_add(size))
        .ok_or_else(|| format!("{label} 区大小溢出"))?;
    if end > bytes.len() {
        return Err(format!("{label} 区越界"));
    }
    Ok(())
}

fn read_c_string(bytes: &[u8], offset: usize) -> Result<&str, String> {
    if offset >= bytes.len() {
        return Err("字符串偏移越界".to_string());
    }
    let end = bytes[offset..]
        .iter()
        .position(|byte| *byte == 0)
        .map(|length| offset + length)
        .ok_or_else(|| "字符串没有 NUL 终止符".to_string())?;
    std::str::from_utf8(&bytes[offset..end]).map_err(|_| "jc002 语言包字符串不是 UTF-8".to_string())
}

fn read_pool_string(bytes: &[u8], string_pool_offset: usize, offset: u32) -> Result<&str, String> {
    if offset == MISSING_OFFSET || (offset as usize) < string_pool_offset {
        return Err("字符串偏移不在 jc002 字符串池中".to_string());
    }
    read_c_string(bytes, offset as usize)
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let value = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| "读取 u16 越界".to_string())?;
    Ok(u16::from_le_bytes([value[0], value[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let value = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "读取 u32 越界".to_string())?;
    Ok(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
}

fn write_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend(value.to_le_bytes());
}

fn write_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend(value.to_le_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn invalid_order_fixture() -> Value {
        serde_json::from_str(include_str!(
            "../../tests/fixtures/i18n/jc002-invalid-order.json"
        ))
        .unwrap()
    }

    #[test]
    fn rejects_jc001_instead_of_falling_back() {
        let document = json!({
            "config_version": "jc001",
            "language_info": { "list_code_language": ["zh"], "list_inner": [], "list_translate": {} }
        });
        assert!(build_dynamic_language_pack(&document)
            .unwrap_err()
            .contains("拒绝配置版本 jc001"));
    }

    #[test]
    fn builds_plural_jc002_pack_and_rejects_corruption() {
        let document = json!({
            "config_version": "jc002",
            "localization": {
                "default_locale": "en-US",
                "locale_order": ["en-US", "ru-RU"],
                "locales": {
                    "en-US": { "enabled": true, "translations": {
                        "language.name.en-US": "English",
                        "language.name.ru-RU": "Russian",
                        "fault.count": { "one": "%d fault", "other": "%d faults" }
                    }},
                    "ru-RU": { "enabled": true, "translations": {
                        "language.name.en-US": "Английский",
                        "language.name.ru-RU": "Русский",
                        "fault.count": { "one": "%d ошибка", "few": "%d ошибки", "many": "%d ошибок", "other": "%d ошибки" }
                    }}
                }
            }
        });
        let mut bytes = build_dynamic_language_pack(&document).unwrap().bytes;
        let summary = decode_dynamic_language_pack(&bytes).unwrap();
        assert_eq!(summary.default_locale, "en-US");
        assert_eq!(summary.locales, vec!["en-US", "ru-RU"]);
        assert_eq!(summary.message_count, 3);
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        assert!(decode_dynamic_language_pack(&bytes)
            .unwrap_err()
            .contains("CRC32"));
    }

    #[test]
    fn rejects_incomplete_or_duplicate_locale_order() {
        let error = build_dynamic_language_pack(&invalid_order_fixture()).unwrap_err();
        assert!(error.contains("locale_order 必须无重复"));
    }

    #[test]
    fn requires_complete_locale_name_keys_in_v2() {
        let mut document = serde_json::from_str::<Value>(include_str!(
            "../../tests/fixtures/i18n/jc002-valid.json"
        ))
        .unwrap();
        document["localization"]["locales"]["ru-RU"]["translations"]
            .as_object_mut()
            .unwrap()
            .remove("language.name.en-US");
        assert!(build_dynamic_language_pack(&document)
            .unwrap_err()
            .contains("language.name.en-US"));

        let mut bytes = build_dynamic_language_pack(
            &serde_json::from_str(include_str!("../../tests/fixtures/i18n/jc002-valid.json"))
                .unwrap(),
        )
        .unwrap()
        .bytes;
        bytes[6] = 0;
        bytes[7] = 0;
        assert!(decode_dynamic_language_pack(&bytes)
            .unwrap_err()
            .contains("语言名称 message_index 扩展"));
    }
}
