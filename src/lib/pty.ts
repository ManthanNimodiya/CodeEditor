import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export function spawnPty(id: string, cwd: string | null, cols: number, rows: number) {
  return invoke<void>("pty_spawn", { id, cwd, cols, rows });
}

export function writePty(id: string, data: string) {
  return invoke<void>("pty_write", { id, data });
}

export function resizePty(id: string, cols: number, rows: number) {
  return invoke<void>("pty_resize", { id, cols, rows });
}

export function killPty(id: string) {
  return invoke<void>("pty_kill", { id });
}

export function onPtyOutput(id: string, handler: (data: string) => void): Promise<UnlistenFn> {
  return listen<string>(`pty-output-${id}`, (event) => handler(event.payload));
}

export function onPtyExit(id: string, handler: () => void): Promise<UnlistenFn> {
  return listen<void>(`pty-exit-${id}`, () => handler());
}
