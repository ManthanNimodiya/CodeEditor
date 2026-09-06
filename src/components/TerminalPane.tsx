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
  useEffect(() => { idRef.current = id; }, [id]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Menlo, Monaco, monospace",
      allowProposedApi: true,
      theme: {
        background: "#141414",
        foreground: "#cccccc",
        cursor: "#aeafad",
        selectionBackground: "#264f78",
        black: "#000000",  brightBlack: "#666666",
        red: "#cd3131",    brightRed: "#f14c4c",
        green: "#0dbc79",  brightGreen: "#23d18b",
        yellow: "#e5e510", brightYellow: "#f5f543",
        blue: "#2472c8",   brightBlue: "#3b8eea",
        magenta: "#bc3fbc",brightMagenta: "#d670d6",
        cyan: "#11a8cd",   brightCyan: "#29b8db",
        white: "#e5e5e5",  brightWhite: "#ffffff",
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

    // macOS WKWebView can intercept backspace/delete before xterm's textarea sees it.
    // Intercept in capture phase and write directly to the PTY as a fallback.
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (!active || !el.contains(active)) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        writePty(idRef.current, "\x7f").catch(() => {});
      } else if (e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        writePty(idRef.current, "\x1b[3~").catch(() => {});
      }
    };
    el.addEventListener("keydown", handleKeyDown, true);

    // Clicking anywhere in the terminal host should focus the xterm textarea.
    const handleClick = () => term.focus();
    el.addEventListener("click", handleClick);

    const unlistenOutput = onPtyOutput(id, (data) => term.write(data));
    const unlistenExit = onPtyExit(id, () => term.write("\r\n[process exited]\r\n"));
    const onData = term.onData((data) => writePty(id, data));

    spawnPty(id, cwd, term.cols, term.rows).catch((err) =>
      term.write(`\r\nfailed to start shell: ${err}\r\n`),
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
