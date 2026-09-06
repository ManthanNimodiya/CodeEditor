use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

struct PtyHandle {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState(Mutex<HashMap<String, PtyHandle>>);

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<PtyState>,
    id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(shell);
    // GUI-launched apps on macOS inherit a minimal PATH (no .zprofile/.bash_profile
    // sourcing), so without -l, tools installed via Homebrew/nvm/etc. won't resolve.
    cmd.arg("-l");
    cmd.env("TERM", "xterm-256color");
    // CommandBuilder inherits our own process's environment, which (in dev, when
    // launched from inside a VS Code terminal) can carry TERM_PROGRAM=vscode and
    // VSCODE_* vars. Tools run inside our terminal would then misdetect themselves
    // as running in VS Code. Strip that ambient identity and declare our own.
    for (key, _) in std::env::vars() {
        if key.starts_with("VSCODE_") || key == "TERM_PROGRAM" || key == "TERM_PROGRAM_VERSION" {
            cmd.env_remove(&key);
        }
    }
    cmd.env("TERM_PROGRAM", "code-editor");
    cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
    cmd.cwd(cwd.unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| "/".to_string())));

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let emit_id = id.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        // A multi-byte UTF-8 character can land across two separate read()s.
        // Carry any incomplete trailing bytes over to the next read instead of
        // decoding each raw chunk independently (which corrupts split chars).
        let mut leftover: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    leftover.extend_from_slice(&buf[..n]);
                    match std::str::from_utf8(&leftover) {
                        Ok(s) => {
                            let _ = app_handle.emit(&format!("pty-output-{}", emit_id), s.to_string());
                            leftover.clear();
                        }
                        Err(e) => {
                            let valid_up_to = e.valid_up_to();
                            if valid_up_to > 0 {
                                let s = std::str::from_utf8(&leftover[..valid_up_to]).unwrap().to_string();
                                let _ = app_handle.emit(&format!("pty-output-{}", emit_id), s);
                            }
                            let remaining = leftover[valid_up_to..].to_vec();
                            leftover = match e.error_len() {
                                // Definitely invalid bytes, not just an incomplete
                                // trailing sequence — emit lossily rather than stall.
                                Some(_) => {
                                    let lossy = String::from_utf8_lossy(&remaining).to_string();
                                    let _ = app_handle.emit(&format!("pty-output-{}", emit_id), lossy);
                                    Vec::new()
                                }
                                None => remaining,
                            };
                        }
                    }
                }
            }
        }
        let _ = app_handle.emit(&format!("pty-exit-{}", emit_id), ());
    });

    state.0.lock().unwrap().insert(
        id,
        PtyHandle {
            writer,
            master: pair.master,
            child,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn pty_write(state: State<PtyState>, id: String, data: String) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    let handle = map.get_mut(&id).ok_or("no such pty")?;
    handle.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(state: State<PtyState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    let handle = map.get(&id).ok_or("no such pty")?;
    handle
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: State<PtyState>, id: String) -> Result<(), String> {
    if let Some(mut handle) = state.0.lock().unwrap().remove(&id) {
        let _ = handle.child.kill();
    }
    Ok(())
}
