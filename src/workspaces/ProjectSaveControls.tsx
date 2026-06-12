import { RotateCcw, Save, Trash2 } from "lucide-react";

type ProjectSaveControlSave = {
  id: string;
  isDefault?: boolean;
  name: string;
};

export function ProjectSaveControls({
  busy,
  compact = false,
  onDelete,
  onRename,
  onSaveAs,
  onSelect,
  saves,
  selectedSaveId,
}: {
  busy: boolean;
  compact?: boolean;
  onDelete: () => void;
  onRename: () => void;
  onSaveAs: () => void;
  onSelect: (saveId: string) => void;
  saves: ProjectSaveControlSave[];
  selectedSaveId: string;
}) {
  const selectedSave = saves.find((save) => save.id === selectedSaveId);
  const namedSaveSelected = Boolean(selectedSave && !selectedSave.isDefault);
  return (
    <div className={`project-save-controls ${compact ? "compact" : ""}`}>
      <label className="project-save-picker">
        <span>Save</span>
        <select
          className="project-save-select"
          disabled={busy}
          value={selectedSaveId}
          onChange={(event) => onSelect(event.target.value)}
        >
          {saves.map((save) => (
            <option key={save.id} value={save.id}>
              {save.name}
            </option>
          ))}
        </select>
      </label>
      <div className="project-save-actions">
        <button disabled={busy} type="button" onClick={onSaveAs}>
          <Save /> Salvar como
        </button>
        <button
          disabled={busy || !namedSaveSelected}
          type="button"
          onClick={onRename}
        >
          <RotateCcw /> Renomear
        </button>
        <button
          className="danger-action"
          disabled={busy || !namedSaveSelected}
          type="button"
          onClick={onDelete}
        >
          <Trash2 /> Excluir
        </button>
      </div>
    </div>
  );
}
