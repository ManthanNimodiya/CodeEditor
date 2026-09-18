import { useState } from "react";

interface ProjectItem {
  id: string;
  name: string;
  root: string;
}

interface ActivityBarProps {
  projects: ProjectItem[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onAddProject: () => void;
  showExplorer: boolean;
  onToggleExplorer: () => void;
  width: number;
  onResizeWidth: (w: number) => void;
}

function getInitials(name: string): string {
  if (!name) return "PR";
  const clean = name.replace(/[^a-zA-Z0-9]/g, " ").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (name.length >= 2) {
    return name.slice(0, 2).toUpperCase();
  }
  return name.slice(0, 1).toUpperCase();
}

const PALETTE = [
  "#0284c7",
  "#059669",
  "#d97706",
  "#2563eb",
  "#0d9488",
  "#e11d48",
  "#475569",
];

function getColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

export default function ActivityBar({
  projects,
  activeProjectId,
  onSelectProject,
  onAddProject,
  showExplorer,
  onToggleExplorer,
  width,
}: ActivityBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const expanded = isHovered || width > 70;

  return (
    <div
      className={`activity-bar ${expanded ? "expanded" : ""}`}
      style={{ width: expanded ? Math.max(width, 210) : 52 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="activity-bar-top">
        {/* Explorer Toggle Action */}
        <div className="activity-nav-actions">
          <button
            className={`activity-icon-btn ${showExplorer ? "active" : ""}`}
            title="Toggle Explorer"
            onClick={onToggleExplorer}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            {expanded && <span className="activity-btn-label">Explorer</span>}
          </button>
        </div>

        <div className="activity-bar-sep" />

        {/* Project Section */}
        {expanded && <div className="activity-section-title">PROJECTS</div>}

        {/* Project Initial Avatar Rail */}
        <div className="activity-project-list">
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            const initials = getInitials(p.name);
            const bgColor = getColorForName(p.name);

            return (
              <div
                key={p.id}
                className={`project-pill-item ${isActive ? "active" : ""}`}
                onClick={() => onSelectProject(p.id)}
                title={`${p.name}\n${p.root}`}
              >
                <div
                  className="project-pill-avatar"
                  style={{ backgroundColor: bgColor }}
                >
                  <span className="project-initials">{initials}</span>
                  {isActive && <div className="pill-active-indicator" />}
                </div>

                {expanded && (
                  <div className="project-pill-details">
                    <span className="project-pill-name">{p.name}</span>
                    <span className="project-pill-path">{p.root.split("/").slice(-2).join("/")}</span>
                  </div>
                )}
              </div>
            );
          })}

          <button className="project-pill-add-row" title="Open / Add Project Folder" onClick={onAddProject}>
            <div className="project-pill-add-icon">+</div>
            {expanded && <span className="project-add-label">Open Folder...</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
