mod http;
mod secrets;
mod store;
mod validate;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(http::HttpState::new())
        .invoke_handler(tauri::generate_handler![
            http::http_request,
            http::http_cancel,
            secrets::secret_set,
            secrets::secret_delete,
            secrets::secret_exists,
            store::store_read,
            store::store_write,
            store::store_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SORTÉ");
}
