//! Input validation shared by every command. The webview is treated as
//! untrusted: everything it sends is checked here before use.

use reqwest::Url;

pub fn provider_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    if ok {
        Ok(())
    } else {
        Err("Invalid provider id.".into())
    }
}

pub fn is_loopback(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]") || host.ends_with(".localhost")
}

/// HTTPS anywhere, plain HTTP only on loopback. No embedded credentials.
pub fn endpoint(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "Invalid URL.".to_string())?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Credentials must not be embedded in the URL.".into());
    }
    let host = url.host_str().ok_or("URL has no host.")?;
    match url.scheme() {
        "https" => Ok(url),
        "http" if is_loopback(host) => Ok(url),
        "http" => Err("Plain HTTP is only allowed for localhost.".into()),
        _ => Err("Only http(s) URLs are supported.".into()),
    }
}

/// Host + port identity a secret is bound to.
pub fn origin_key(url: &Url) -> String {
    format!("{}://{}:{}", url.scheme(), url.host_str().unwrap_or(""), url.port_or_known_default().unwrap_or(0))
}

/// Headers the webview may set. Authentication headers are never accepted from JS.
pub fn allowed_header(name: &str) -> bool {
    matches!(name.to_ascii_lowercase().as_str(), "content-type" | "accept" | "anthropic-version")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_ids() {
        assert!(provider_id("openai-1a2b3c").is_ok());
        assert!(provider_id("").is_err());
        assert!(provider_id("../etc").is_err());
        assert!(provider_id("UPPER").is_err());
        assert!(provider_id(&"a".repeat(65)).is_err());
    }

    #[test]
    fn endpoints() {
        assert!(endpoint("https://api.openai.com/v1").is_ok());
        assert!(endpoint("http://127.0.0.1:11434").is_ok());
        assert!(endpoint("http://localhost:1234/v1").is_ok());
        assert!(endpoint("http://api.openai.com/v1").is_err());
        assert!(endpoint("http://192.168.1.10:11434").is_err());
        assert!(endpoint("https://user:pw@api.openai.com").is_err());
        assert!(endpoint("file:///etc/passwd").is_err());
    }

    #[test]
    fn origins_differ_by_host_and_port() {
        let a = origin_key(&endpoint("https://api.openai.com/v1").unwrap());
        let b = origin_key(&endpoint("https://api.openai.com/v1/chat/completions").unwrap());
        let c = origin_key(&endpoint("https://evil.example.com/v1").unwrap());
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn headers() {
        assert!(allowed_header("Content-Type"));
        assert!(allowed_header("anthropic-version"));
        assert!(!allowed_header("Authorization"));
        assert!(!allowed_header("x-api-key"));
        assert!(!allowed_header("cookie"));
    }
}
