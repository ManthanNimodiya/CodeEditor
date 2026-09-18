import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { spawnPty, writePty, resizePty, killPty, onPtyOutput, onPtyExit } from "../lib/pty";

interface TerminalPaneProps {
  id: string;
  cwd: string | null;
  visible: boolean;
}

export default function TerminalPane({ id, cwd, visible }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const idRef = useRef(id);
  useEffect(() => {
    idRef.current = id;
  }, [id]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      allowProposedApi: true,
      scrollback: 10000,
      theme: {
        background: "#050507",
        foreground: "#d4d4d8",
        cursor: "#38bdf8",
        selectionBackground: "#1e3a5f",
        black: "#09090b",
        brightBlack: "#52525b",
        red: "#ef4444",
        brightRed: "#f87171",
        green: "#10b981",
        brightGreen: "#34d399",
        yellow: "#f59e0b",
        brightYellow: "#fbbf24",
        blue: "#0284c7",
        brightBlue: "#38bdf8",
        magenta: "#06b6d4",
        brightMagenta: "#22d3ee",
        cyan: "#14b8a6",
        brightCyan: "#2dd4bf",
        white: "#e4e4e7",
        brightWhite: "#ffffff",
      },
    });

    const fit = new FitAddon();
    const webLinks = new WebLinksAddon((event, uri) => {
      if (event.metaKey || event.ctrlKey) window.open(uri, "_blank");
    });

    term.loadAddon(fit);
    term.loadAddon(webLinks);
    term.open(el);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // Advanced macOS & custom shortcut interceptor
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (!active || !el.contains(active)) return;

      const currentId = idRef.current;

      // Option + Backspace -> Delete Word Backward (\x17 or \x1b\x7f)
      if (e.altKey && e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        writePty(currentId, "\x17").catch(() => {});
        return;
      }

      // Cmd + Backspace -> Clear Line to Left (\x15 - Unix kill line backward)
      if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        writePty(currentId, "\x15").catch(() => {});
        return;
      }

      // Cmd + K -> Clear terminal buffer
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        term.clear();
        writePty(currentId, "\x0c").catch(() => {});
        return;
      }

      // Option + Left -> Move Word Backward (\x1bb)
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        writePty(currentId, "\x1bb").catch(() => {});
        return;
      }

      // Option + Right -> Move Word Forward (\x1bf)
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        writePty(currentId, "\x1bf").catch(() => {});
        return;
      }

      // Cmd + Left -> Beginning of Line (\x01 - Ctrl+A)
      if ((e.metaKey || e.ctrlKey) && e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        writePty(currentId, "\x01").catch(() => {});
        return;
      }

      // Cmd + Right -> End of Line (\x05 - Ctrl+E)
      if ((e.metaKey || e.ctrlKey) && e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        writePty(currentId, "\x05").catch(() => {});
        return;
      }

      // Cmd + C -> Copy selected text if any
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && term.hasSelection()) {
        const sel = term.getSelection();
        navigator.clipboard.writeText(sel);
        return;
      }

      // Cmd + V -> Paste from clipboard
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        navigator.clipboard.readText().then((clip) => {
          if (clip) writePty(currentId, clip).catch(() => {});
        }).catch(() => {});
        return;
      }

      // Regular Backspace fallback for macOS WKWebView
      if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        writePty(currentId, "\x7f").catch(() => {});
      } else if (e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        writePty(currentId, "\x1b[3~").catch(() => {});
      }
    };

    el.addEventListener("keydown", handleKeyDown, true);
    const handleClick = () => term.focus();
    el.addEventListener("click", handleClick);

    const unlistenOutput = onPtyOutput(id, (data) => term.write(data));
    const unlistenExit = onPtyExit(id, () => term.write("\r\n[process exited]\r\n"));
    const onData = term.onData((data) => writePty(id, data));

    spawnPty(id, cwd, term.cols, term.rows).catch((err) =>
      term.write(`\r\nfailed to start shell: ${err}\r\n`)
    );

    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth === 0) return;
      fit.fit();
      if (term.cols > 0 && term.rows > 0) {
        resizePty(id, term.cols, term.rows).catch(() => {});
      }
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener("keydown", handleKeyDown, true);
      el.removeEventListener("click", handleClick);
      onData.dispose();
      unlistenOutput.then((f) => f());
      unlistenExit.then((f) => f());
      killPty(id).catch(() => {});
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (visible) {
      fitRef.current?.fit();
      termRef.current?.focus();
      const term = termRef.current;
      if (term && term.cols > 0 && term.rows > 0) {
        resizePty(id, term.cols, term.rows).catch(() => {});
      }
    }
  }, [visible, id]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", display: visible ? "block" : "none" }}
    />
  );
}
