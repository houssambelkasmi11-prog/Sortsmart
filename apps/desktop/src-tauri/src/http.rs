//! The only network path of the desktop app (the webview's CSP blocks direct
//! requests). Validates URLs and headers, attaches keys from the credential
//! store only to the origin they were saved for, follows no redirects, caps
//! response size and supports cancellation. Nothing here logs request data.

use crate::{secrets, validate};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;
use tokio::sync::oneshot;

const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES: usize = 12 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthRef {
    provider_id: String,
    header: String,
    scheme: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    id: String,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout_ms: u64,
    auth: Option<AuthRef>,
}

#[derive(Serialize)]
pub struct HttpResponse {
    status: u16,
    body: String,
}

/// Mirrors ProviderError kinds on the TypeScript side.
#[derive(Serialize, Debug)]
pub struct HttpError {
    kind: &'static str,
    message: String,
}

impl HttpError {
    fn config(m: impl Into<String>) -> Self {
        Self { kind: "config", message: m.into() }
    }
    fn network(m: impl Into<String>) -> Self {
        Self { kind: "network", message: m.into() }
    }
}

pub struct HttpState {
    client: reqwest::Client,
    inflight: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

impl HttpState {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("SORTE-Desktop/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("HTTP client");
        Self { client, inflight: Mutex::new(HashMap::new()) }
    }
}

fn build(state: &HttpState, req: &HttpRequest) -> Result<reqwest::RequestBuilder, HttpError> {
    let url = validate::endpoint(&req.url).map_err(HttpError::config)?;
    let method = match req.method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        _ => return Err(HttpError::config("Unsupported method.")),
    };
    if req.body.as_ref().is_some_and(|b| b.len() > MAX_REQUEST_BYTES) {
        return Err(HttpError::config("Request body too large."));
    }
    let timeout = Duration::from_millis(req.timeout_ms.clamp(1_000, 300_000));
    let mut builder = state.client.request(method, url.clone()).timeout(timeout);
    for (name, value) in &req.headers {
        if !validate::allowed_header(name) {
            return Err(HttpError::config(format!("Header \"{name}\" is not allowed.")));
        }
        builder = builder.header(name.as_str(), value.as_str());
    }
    if let Some(auth) = &req.auth {
        let stored = secrets::load(&auth.provider_id)
            .map_err(HttpError::config)?
            .ok_or_else(|| HttpError::config("No API key saved for this provider."))?;
        if stored.origin != validate::origin_key(&url) {
            return Err(HttpError::config("This key is bound to a different host. Save it again for the current endpoint."));
        }
        let value = match (auth.header.as_str(), auth.scheme.as_str()) {
            ("authorization", "bearer") => format!("Bearer {}", stored.key),
            ("x-api-key", "raw") | ("x-goog-api-key", "raw") => stored.key,
            _ => return Err(HttpError::config("Unsupported auth scheme.")),
        };
        builder = builder.header(auth.header.as_str(), value);
    }
    if let Some(body) = &req.body {
        builder = builder.body(body.clone());
    }
    Ok(builder)
}

async fn send(builder: reqwest::RequestBuilder, timeout_ms: u64) -> Result<HttpResponse, HttpError> {
    let res = builder.send().await.map_err(|e| {
        if e.is_timeout() {
            HttpError { kind: "timeout", message: format!("No response within {timeout_ms} ms.") }
        } else if e.is_connect() {
            HttpError::network("Could not connect. Is the server running and reachable?")
        } else {
            HttpError::network("Network error.")
        }
    })?;
    let status = res.status().as_u16();
    if res.content_length().is_some_and(|l| l as usize > MAX_BODY_BYTES) {
        return Err(HttpError::network("Response too large."));
    }
    let bytes = res.bytes().await.map_err(|e| {
        if e.is_timeout() {
            HttpError { kind: "timeout", message: "Timed out reading the response.".into() }
        } else {
            HttpError::network("Connection dropped while reading the response.")
        }
    })?;
    if bytes.len() > MAX_BODY_BYTES {
        return Err(HttpError::network("Response too large."));
    }
    Ok(HttpResponse { status, body: String::from_utf8_lossy(&bytes).into_owned() })
}

#[tauri::command]
pub async fn http_request(state: State<'_, HttpState>, req: HttpRequest) -> Result<HttpResponse, HttpError> {
    let builder = build(&state, &req)?;
    let (tx, rx) = oneshot::channel();
    state.inflight.lock().unwrap().insert(req.id.clone(), tx);
    let result = tokio::select! {
        r = send(builder, req.timeout_ms) => r,
        _ = rx => Err(HttpError { kind: "aborted", message: "Request cancelled.".into() }),
    };
    state.inflight.lock().unwrap().remove(&req.id);
    result
}

#[tauri::command]
pub fn http_cancel(state: State<'_, HttpState>, id: String) {
    if let Some(tx) = state.inflight.lock().unwrap().remove(&id) {
        let _ = tx.send(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(url: &str, headers: &[(&str, &str)], auth: Option<AuthRef>) -> HttpRequest {
        HttpRequest {
            id: "t".into(),
            method: "GET".into(),
            url: url.into(),
            headers: headers.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
            body: None,
            timeout_ms: 5_000,
            auth,
        }
    }

    #[test]
    fn rejects_auth_headers_from_webview() {
        let s = HttpState::new();
        let e = build(&s, &req("https://api.openai.com/v1/models", &[("Authorization", "Bearer x")], None)).unwrap_err();
        assert_eq!(e.kind, "config");
    }

    #[test]
    fn rejects_remote_plain_http() {
        let s = HttpState::new();
        assert!(build(&s, &req("http://example.com/x", &[], None)).is_err());
        assert!(build(&s, &req("http://127.0.0.1:11434/api/tags", &[("content-type", "application/json")], None)).is_ok());
    }

    #[test]
    fn rejects_invalid_provider_id_for_auth() {
        let s = HttpState::new();
        let auth = AuthRef { provider_id: "../x".into(), header: "authorization".into(), scheme: "bearer".into() };
        assert!(build(&s, &req("https://api.openai.com/v1/models", &[], Some(auth))).is_err());
    }
}
