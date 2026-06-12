import { Disc3 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

export function ArtworkFrame({ artworkSrc }: { artworkSrc?: string }) {
  return (
    <span className="artwork-frame">
      {artworkSrc ? <img alt="" src={artworkSrc} /> : <Disc3 />}
    </span>
  );
}

export function EmptyReviewState() {
  return (
    <div className="empty-review-state">
      <Disc3 />
      <strong>Nenhuma faixa no escopo atual</strong>
      <span>
        Selecione arquivos no lote ou escolha uma faixa na biblioteca.
      </span>
    </div>
  );
}

export function PanelResizeHandle({
  active,
  className,
  label,
  onPointerDown,
  onReset,
}: {
  active: boolean;
  className: string;
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onReset: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-orientation="vertical"
      className={`panel-resize-handle ${className} ${active ? "active" : ""}`}
      title={`${label}. Duplo clique redefine o tamanho.`}
      type="button"
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onReset();
      }}
      onPointerDown={onPointerDown}
    />
  );
}
