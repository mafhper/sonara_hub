import { Copy, FileAudio, Layers3, RotateCcw } from "lucide-react";

import type { TrackMetadata } from "../types";
import { InspectorGroup, TextArea, TextField } from "./fields";

export function MusicInspector({
  metadata,
  onApplySuggestions,
  onApplyCommonBatch,
  onChange,
  onCreateVariation,
  onReplaceAudio,
  versionSuggestions,
}: {
  metadata: TrackMetadata;
  onApplyCommonBatch?: () => void;
  onApplySuggestions: () => void;
  onChange: (patch: Partial<TrackMetadata>) => void;
  onCreateVariation: () => void;
  onReplaceAudio?: () => void;
  versionSuggestions: string[];
}) {
  return (
    <>
      <InspectorGroup title="Faixa" open scope="track">
        <div className="inspector-subsection">
          <p className="inspector-kicker">Identidade</p>
          <TextField
            label="Título"
            value={metadata.title}
            onChange={(title) => onChange({ title })}
          />
          <TextField
            label="Artista"
            value={metadata.artist}
            placeholder={metadata.albumArtist || ""}
            onChange={(artist) => onChange({ artist })}
          />
          <TextField
            label="Álbum"
            value={metadata.album}
            onChange={(album) => onChange({ album })}
          />
          <TextField
            label="Versão"
            suggestions={versionSuggestions}
            value={metadata.version}
            onChange={(version) => onChange({ version })}
          />
        </div>
        <div className="inspector-subsection">
          <p className="inspector-kicker">Ações</p>
          <div className="inline-actions">
            <button type="button" onClick={onApplySuggestions}>
              <RotateCcw /> Usar dados do áudio
            </button>
            <button type="button" onClick={onCreateVariation}>
              <Copy /> Criar variação
            </button>
          </div>
          {onReplaceAudio && (
            <button
              className="upload-action"
              type="button"
              onClick={onReplaceAudio}
            >
              <FileAudio /> Trocar áudio desta versão
            </button>
          )}
          {onApplyCommonBatch && (
            <button
              className="upload-action"
              type="button"
              onClick={onApplyCommonBatch}
            >
              <Layers3 /> Aplicar álbum e artista ao lote
            </button>
          )}
        </div>
      </InspectorGroup>
      <InspectorGroup title="Descrição e publicação" scope="track">
        <div className="inspector-subsection">
          <p className="inspector-kicker">Descrição</p>
          <TextArea
            label="Descrição do vídeo (YouTube)"
            value={metadata.description}
            onChange={(description) => onChange({ description })}
          />
          <p className="helper-copy">
            Texto da página do vídeo no YouTube. A letra da música é um campo
            separado, na Biblioteca de áudio › Letra.
          </p>
        </div>
        <div className="inspector-subsection">
          <p className="inspector-kicker">Tags</p>
          <TextField
            label="Tags"
            value={metadata.tags}
            onChange={(tags) => onChange({ tags })}
          />
        </div>
      </InspectorGroup>
    </>
  );
}
