mod pty;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Default)]
struct PendingOpenPath(Mutex<Option<String>>);

#[tauri::command]
fn take_pending_open_path(state: tauri::State<PendingOpenPath>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[tauri::command]
fn get_launch_path() -> Option<String> {
    std::env::args().nth(1)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(pty::PtyState::default())
        .manage(PendingOpenPath::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            get_launch_path,
            take_pending_open_path,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |app_handle, event| {
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        if let tauri::RunEvent::Opened { urls } = &event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    let path_str = path.to_string_lossy().to_string();
                    let _ = app_handle.emit("open-path", path_str.clone());
                    *app_handle.state::<PendingOpenPath>().0.lock().unwrap() = Some(path_str);
                }
            }
        }
        let _ = &event;
    });
}
