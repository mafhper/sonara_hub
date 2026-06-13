import { ChevronDown, FolderOpen, Music2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type ProjectSwitcherProject = {
  id: string;
  name: string;
  trackCount: number;
};

// Replaces the old duplicated pair (project-profile card + separate
// library-project-picker <select>). The profile card itself is now the trigger:
// it shows the active album cover + name and opens a popover listing every
// project to switch between. With a single project it stays a static card.
export function ProjectSwitcher<P extends ProjectSwitcherProject>({
  projects,
  selectedProjectId,
  folderName,
  coverSrc,
  subtitle,
  projectLabel,
  onSelect,
  onOpenSetup,
}: {
  projects: P[];
  selectedProjectId: string;
  folderName: string;
  coverSrc?: string | null;
  subtitle: string;
  projectLabel: (project: P) => string;
  onSelect: (projectId: string) => void;
  onOpenSetup: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const switchable = projects.length > 1;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const cover = coverSrc ? <img alt="" src={coverSrc} /> : <Music2 />;

  return (
    <div className="project-switcher" ref={rootRef}>
      <div className="project-profile">
        <button
          aria-expanded={switchable ? open : undefined}
          aria-haspopup={switchable ? "listbox" : undefined}
          className="project-switcher-trigger"
          disabled={!switchable}
          type="button"
          onClick={() => switchable && setOpen((value) => !value)}
        >
          <span className="project-profile-cover">{cover}</span>
          <span className="project-profile-copy">
            <strong>{folderName}</strong>
            <small>{subtitle}</small>
          </span>
          {switchable && <ChevronDown className="project-switcher-chevron" />}
        </button>
        <button
          aria-label="Abrir Setup"
          className="icon-button"
          title="Trocar pastas / projeto (Setup)"
          type="button"
          onClick={onOpenSetup}
        >
          <FolderOpen />
        </button>
      </div>
      {switchable && open && (
        <ul className="project-switcher-popover" id={listboxId} role="listbox">
          {projects.map((project) => (
            <li key={project.id} role="presentation">
              <button
                aria-selected={project.id === selectedProjectId}
                className={`project-switcher-item ${
                  project.id === selectedProjectId ? "is-active" : ""
                }`}
                role="option"
                type="button"
                onClick={() => {
                  onSelect(project.id);
                  setOpen(false);
                }}
              >
                <span className="project-switcher-item-cover">
                  {project.id === selectedProjectId && coverSrc ? (
                    <img alt="" src={coverSrc} />
                  ) : (
                    <Music2 />
                  )}
                </span>
                <span className="project-switcher-item-label">
                  {projectLabel(project)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
