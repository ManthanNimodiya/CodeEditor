import { useState } from "react";
import TerminalPane from "./TerminalPane";
import { writePty } from "../lib/pty";

export interface TerminalTabItem {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  projectRoot: string;
}

interface TerminalGridProps {
  terminals: TerminalTabItem[];
  activeTerminalId: string | null;
  onSelectTerminal: (id: string) => void;
  onAddTerminal: (projectId: string) => void;
  onCloseTerminal: (projectId: string, id: string) => void;
  onRenameTerminal: (projectId: string, id: string, name: string) => void;
  onReorderTerminals: (reordered: TerminalTabItem[]) => void;
  activeProjectId: string | null;
}

export default function TerminalGrid({
  terminals,
  activeTerminalId,
  onSelectTerminal,
  onAddTerminal,
  onCloseTerminal,
  onRenameTerminal,
  onReorderTerminals,
  activeProjectId,
}: TerminalGridProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const displayedTerminals = maximizedId
    ? terminals.filter((t) => t.id === maximizedId)
    : terminals;

  function handleStartRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameDraft(currentName);
  }

  function handleCommitRename(projectId: string, id: string, fallbackName: string) {
    const finalName = renameDraft.trim() || fallbackName;
    onRenameTerminal(projectId, id, finalName);
    setRenamingId(null);
  }

  function handleClearTerminal(id: string) {
    writePty(id, "\x0c").catch(() => {});
  }

  function onDragStart(index: number) {
    setDraggedIndex(index);
  }

  function onDragOver(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const next = [...terminals];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDraggedIndex(targetIndex);
    onReorderTerminals(next);
  }

  function onDragEnd() {
    setDraggedIndex(null);
  }

  function moveTerminal(fromIndex: number, direction: -1 | 1) {
    const targetIndex = fromIndex + direction;
    if (targetIndex < 0 || targetIndex >= terminals.length) return;
    const next = [...terminals];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(targetIndex, 0, moved);
    onReorderTerminals(next);
  }

  return (
    <div className="terminal-grid-wrapper">
      {/* Top Header Strip without sandbox status or emojis */}
      <div className="terminal-grid-header">
        <div className="terminal-grid-title-group">
          <span className="terminal-grid-title">Active Terminals</span>
          <span className="terminal-count-badge">{terminals.length}</span>
          {activeProjectId && (
            <button
              className="terminal-grid-add-btn"
              title="Spawn New Terminal"
              onClick={() => onAddTerminal(activeProjectId)}
            >
              + Terminal
            </button>
          )}
        </div>
      </div>

      {/* Cards Row / Grid */}
      <div className={`terminal-cards-container ${maximizedId ? "maximized" : ""}`}>
        {displayedTerminals.length === 0 ? (
          <div className="terminal-empty-state">
            <span>No active terminal sessions.</span>
            {activeProjectId && (
              <button
                className="pipeline-btn pipeline-btn-accent"
                onClick={() => onAddTerminal(activeProjectId)}
              >
                + Launch Terminal
              </button>
            )}
          </div>
        ) : (
          displayedTerminals.map((t, index) => {
            const isActive = t.id === activeTerminalId;
            const isMax = t.id === maximizedId;

            return (
              <div
                key={t.id}
                draggable={!maximizedId && renamingId !== t.id}
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDragEnd={onDragEnd}
                className={`terminal-card ${isActive ? "active" : ""} ${draggedIndex === index ? "dragging" : ""}`}
                onClick={() => onSelectTerminal(t.id)}
              >
                {/* Card Header */}
                <div className="terminal-card-header">
                  <div
                    className="terminal-card-title"
                    onDoubleClick={() => handleStartRename(t.id, t.name)}
                    title="Drag to rearrange / Double-click to rename"
                  >
                    <span className="terminal-drag-handle">::</span>
                    <span className="terminal-prompt-glyph">&gt;_</span>
                    {renamingId === t.id ? (
                      <input
                        className="tab-rename-input"
                        autoFocus
                        value={renameDraft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => handleCommitRename(t.projectId, t.id, t.name)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleCommitRename(t.projectId, t.id, t.name);
                          } else if (e.key === "Escape") {
                            setRenamingId(null);
                          }
                        }}
                      />
                    ) : (
                      <span className="terminal-name-text">{t.name}</span>
                    )}
                  </div>

                  <div className="terminal-card-controls">
                    {terminals.length > 1 && !maximizedId && (
                      <>
                        <button
                          className="terminal-card-ctrl-btn"
                          title="Move Left"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveTerminal(index, -1);
                          }}
                        >
                          &lt;
                        </button>
                        <button
                          className="terminal-card-ctrl-btn"
                          title="Move Right"
                          disabled={index === terminals.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveTerminal(index, 1);
                          }}
                        >
                          &gt;
                        </button>
                      </>
                    )}

                    <button
                      className="terminal-card-ctrl-btn"
                      title="Rename terminal"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartRename(t.id, t.name);
                      }}
                    >
                      edit
                    </button>

                    <button
                      className="terminal-card-ctrl-btn"
                      title="Clear screen (⌘K)"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearTerminal(t.id);
                      }}
                    >
                      clear
                    </button>

                    <button
                      className="terminal-card-ctrl-btn"
                      title={isMax ? "Restore grid" : "Maximize"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMaximizedId(isMax ? null : t.id);
                      }}
                    >
                      {isMax ? "restore" : "max"}
                    </button>

                    <button
                      className="terminal-card-ctrl-btn ctrl-close"
                      title="Close terminal"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (maximizedId === t.id) setMaximizedId(null);
                        onCloseTerminal(t.projectId, t.id);
                      }}
                    >
                      &times;
                    </button>
                  </div>
                </div>

                {/* Live Terminal Body */}
                <div className="terminal-card-body">
                  <TerminalPane
                    id={t.id}
                    cwd={t.projectRoot}
                    visible={true}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
