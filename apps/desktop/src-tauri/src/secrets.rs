//! API keys in the OS credential store. The full key never returns to the
//! webview: `secret_set` answers with the last four characters only, and the
//! key is read back exclusively by the HTTP proxy (http.rs).

use crate::validate;
use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "app.sorte.desktop";
const MAX_SECRET_LEN: usize = 4096;

/// What is stored in the keychain: the key plus the origin it may be sent to.
#[derive(Serialize, Deserialize)]
pub struct StoredSecret {
    pub key: String,
    pub origin: String,
}

fn entry(provider_id: &str) -> Result<Entry, String> {
    validate::provider_id(provider_id)?;
    Entry::new(SERVICE, provider_id).map_err(|e| format!("Credential store unavailable: {e}"))
}

pub fn load(provider_id: &str) -> Result<Option<StoredSecret>, String> {
    match entry(provider_id)?.get_password() {
        Ok(raw) => serde_json::from_str(&raw).map(Some).map_err(|_| "Stored credential is unreadable. Save the key again.".into()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Credential store error: {e}")),
    }
}

#[tauri::command]
pub fn secret_set(provider_id: String, secret: String, endpoint: String) -> Result<String, String> {
    let secret = secret.trim().to_string();
    if secret.is_empty() || secret.len() > MAX_SECRET_LEN || secret.chars().any(char::is_control) {
        return Err("That doesn't look like a valid API key.".into());
    }
    let url = validate::endpoint(&endpoint)?;
    let stored = StoredSecret { key: secret, origin: validate::origin_key(&url) };
    let json = serde_json::to_string(&stored).map_err(|e| e.to_string())?;
    entry(&provider_id)?.set_password(&json).map_err(|e| format!("Could not save to credential store: {e}"))?;
    let tail: String = stored.key.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    Ok(tail)
}

#[tauri::command]
pub fn secret_delete(provider_id: String) -> Result<(), String> {
    match entry(&provider_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not delete credential: {e}")),
    }
}

#[tauri::command]
pub fn secret_exists(provider_id: String) -> Result<bool, String> {
    Ok(load(&provider_id)?.is_some())
}
