import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
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

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Menlo, Monaco, monospace",
      theme: { background: "#1c1c1c", foreground: "#d4d4d4" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const unlistenOutput = onPtyOutput(id, (data) => term.write(data));
    const unlistenExit = onPtyExit(id, () => term.write("\r\n[process exited]\r\n"));
    const onData = term.onData((data) => writePty(id, data));

    spawnPty(id, cwd, term.cols, term.rows).catch((err) =>
      term.write(`\r\nfailed to start shell: ${err}\r\n`),
    );

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && containerRef.current.clientWidth === 0) return;
      fit.fit();
      if (term.cols > 0 && term.rows > 0) {
        resizePty(id, term.cols, term.rows).catch(() => {});
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
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
