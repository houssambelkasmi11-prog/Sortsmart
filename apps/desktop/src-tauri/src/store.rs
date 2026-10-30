//! Small JSON stores for settings and history. Only two fixed names are
//! accepted, writes are atomic, and files are owner-only on Unix.
//! Secrets never pass through here.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const MAX_BYTES: usize = 20 * 1024 * 1024;

fn path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = match name {
        "settings" => app.path().app_config_dir(),
        "history" => app.path().app_data_dir(),
        _ => return Err("Unknown store.".into()),
    }
    .map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{name}.json")))
}

#[tauri::command]
pub fn store_read(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let p = path(&app, &name)?;
    match fs::read_to_string(&p) {
        Ok(s) if s.len() <= MAX_BYTES => Ok(Some(s)),
        Ok(_) => Err("Store file too large.".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read {name}: {e}")),
    }
}

#[tauri::command]
pub fn store_write(app: AppHandle, name: String, contents: String) -> Result<(), String> {
    if contents.len() > MAX_BYTES {
        return Err("Data too large.".into());
    }
    let p = path(&app, &name)?;
    let dir = p.parent().ok_or("Invalid path.")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&tmp).map_err(|e| e.to_string())?;
        f.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn store_location(app: AppHandle) -> Result<String, String> {
    Ok(path(&app, "settings")?.display().to_string())
}
