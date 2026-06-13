import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  X,
} from "lucide-react";
import { Fragment, type DragEvent as ReactDragEvent, useState } from "react";

import { groupAudioTracks } from "../../shared/audio-batch.mjs";
import type {
  BatchApplyMode,
  BatchCommon as BatchCommonDraft,
} from "../../shared/audio-batch.mjs";
import { buildNameFromPattern } from "../../shared/file-naming.mjs";
import { BatchJobBoard } from "../jobs/BatchJobBoard";
import { CheckField, TextArea, TextField } from "../inspectors/fields";
import type { FileNamePattern } from "../inspectors/FileNamePattern";
import { genreSuggestions, TagSelectField } from "../inspectors/TagSelectField";
import type {
  AudioTechnicalAnalysis,
  RenderJob,
  TrackDraft,
  TrackMetadata,
} from "../types";
import type { PreviewAudioBands as AudioBands } from "./CompositionPreview";
import {
  AnalyticalWaveform,
  Metric,
  StaticWaveform,
} from "./AudioPreviewPrimitives";
export function AudioLibraryWorkspace({
  audioBands,
  batchApplyMode,
  batchCommon,
  fileNamePattern,
  folderImportProgress,
  jobs,
  onApplyBatchCommon,
  onBatchApplyMode,
  onBatchCommon,
  onCancelAllJobs,
  onCancelJob,
  onClearTerminalJobs,
  onPauseQueue,
  onResumeQueue,
  onReorderTrack,
  onSelectTrack,
  onToggleTrack,
  onToggleTracks,
  onTrackMetadata,
  queuePaused,
  selectedTrack,
  selectedTrackId,
  staticWaveformPeaks,
  tracks,
  workflowMode,
}: {
  audioBands: AudioBands;
  fileNamePattern: FileNamePattern;
  staticWaveformPeaks?: number[];
  batchApplyMode: BatchApplyMode;
  batchCommon: BatchCommonDraft;
  folderImportProgress: { current: number; total: number; name: string } | null;
  jobs: RenderJob[];
  onApplyBatchCommon: () => void;
  onBatchApplyMode: (mode: BatchApplyMode) => void;
  onBatchCommon: (patch: BatchCommonDraft) => void;
  onCancelAllJobs: () => void;
  onCancelJob: (id: string) => void;
  onClearTerminalJobs: () => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
  onReorderTrack: (sourceId: string, targetId: string) => void;
  onSelectTrack: (id: string) => void;
  onToggleTrack: (id: string, selected: boolean) => void;
  onToggleTracks: (ids: string[], selected: boolean) => void;
  onTrackMetadata: (id: string, patch: Partial<TrackMetadata>) => void;
  queuePaused: boolean;
  selectedTrack?: TrackDraft;
  selectedTrackId: string;
  tracks: TrackDraft[];
  workflowMode: "single" | "batch";
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [draggedTrackId, setDraggedTrackId] = useState("");
  const [dragOverTrackId, setDragOverTrackId] = useState("");
  if (workflowMode === "batch") {
    const selectedCount = tracks.filter(
      (track) => track.selectedForBatch,
    ).length;
    const groups = groupAudioTracks(tracks);
    const toggleGroup = (id: string) =>
      setCollapsedGroups((current) =>
        current.includes(id)
          ? current.filter((groupId) => groupId !== id)
          : [...current, id],
      );
    const toggleRow = (id: string) =>
      setExpandedRows((current) =>
        current.includes(id)
          ? current.filter((trackId) => trackId !== id)
          : [...current, id],
      );
    const startTrackDrag = (
      event: ReactDragEvent<HTMLButtonElement>,
      trackId: string,
    ) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", trackId);
      setDraggedTrackId(trackId);
      setDragOverTrackId("");
    };
    const dropTrackOn = (
      event: ReactDragEvent<HTMLTableRowElement>,
      targetId: string,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const sourceId =
        event.dataTransfer.getData("text/plain") || draggedTrackId;
      setDraggedTrackId("");
      setDragOverTrackId("");
      onReorderTrack(sourceId, targetId);
    };
    const finishTrackDrag = () => {
      setDraggedTrackId("");
      setDragOverTrackId("");
    };
    return (
      <div className="audio-library batch-library">
        <header className="audio-library-heading">
          <div>
            <span className="overline">Biblioteca de áudio</span>
            <h1>Revisão e tratamento do lote</h1>
          </div>
          <strong>{selectedCount} selecionadas</strong>
        </header>
        {folderImportProgress && (
          <div className="batch-progress-note">
            <span>
              Importando {folderImportProgress.current}/
              {folderImportProgress.total || "--"}
            </span>
            <strong>{folderImportProgress.name}</strong>
          </div>
        )}
        <details
          className="batch-toolbar"
          aria-label="Dados comuns do lote"
          open
        >
          <summary className="batch-toolbar-head">
            <div>
              <span className="overline">Dados comuns do lote</span>
              <strong>
                Preencha uma vez e aplique nas linhas selecionadas
              </strong>
            </div>
            <ChevronDown />
          </summary>
          <div className="batch-toolbar-body">
            <div className="batch-apply-mode" aria-label="Modo de aplicação">
              <button
                className={batchApplyMode === "fill-empty" ? "active" : ""}
                type="button"
                onClick={() => onBatchApplyMode("fill-empty")}
              >
                Preencher vazios
              </button>
              <button
                className={batchApplyMode === "overwrite" ? "active" : ""}
                type="button"
                onClick={() => onBatchApplyMode("overwrite")}
              >
                Sobrescrever informados
              </button>
            </div>
            <p className="batch-mode-note">
              {batchApplyMode === "fill-empty"
                ? "Mantém valores já revisados em cada linha e completa somente lacunas."
                : "Substitui os campos preenchidos abaixo nos arquivos selecionados."}
            </p>
            <div className="batch-toolbar-grid">
              <TextField
                label="Artista principal"
                value={batchCommon.artist}
                onChange={(artist) => onBatchCommon({ ...batchCommon, artist })}
              />
              <TextField
                label="Álbum"
                value={batchCommon.album}
                onChange={(album) => onBatchCommon({ ...batchCommon, album })}
              />
              <TextField
                label="Artista do álbum"
                value={batchCommon.albumArtist}
                onChange={(albumArtist) =>
                  onBatchCommon({ ...batchCommon, albumArtist })
                }
              />
              <TextField
                label="Compositor"
                value={batchCommon.composer}
                onChange={(composer) =>
                  onBatchCommon({ ...batchCommon, composer })
                }
              />
              <TextField
                label="Ano"
                value={batchCommon.year}
                onChange={(year) => onBatchCommon({ ...batchCommon, year })}
              />
              <TextField
                label="Copyright"
                value={batchCommon.copyright}
                onChange={(copyright) =>
                  onBatchCommon({ ...batchCommon, copyright })
                }
              />
              <TagSelectField
                label="Gênero"
                value={batchCommon.genre}
                suggestions={genreSuggestions}
                storageKey="sonara.customGenres"
                placeholder="Buscar ou adicionar gênero…"
                onChange={(genre) => onBatchCommon({ ...batchCommon, genre })}
              />
              <TextArea
                label="Comentário ID3"
                rows={2}
                value={batchCommon.comment}
                onChange={(comment) =>
                  onBatchCommon({ ...batchCommon, comment })
                }
              />
            </div>
            <div className="batch-toolbar-actions">
              <TextField
                label="Total de faixas"
                value={
                  batchCommon.trackTotal ? String(batchCommon.trackTotal) : ""
                }
                onChange={(value) =>
                  onBatchCommon({
                    ...batchCommon,
                    trackTotal: Math.max(0, Number(value) || 0),
                  })
                }
              />
              <button
                className="primary-action"
                disabled={selectedCount === 0}
                type="button"
                onClick={onApplyBatchCommon}
              >
                <Check /> Aplicar aos selecionados
              </button>
            </div>
          </div>
        </details>
        <BatchJobBoard
          jobs={jobs}
          onCancelAll={onCancelAllJobs}
          onCancelJob={onCancelJob}
          onClearTerminal={onClearTerminalJobs}
          onPause={onPauseQueue}
          onResume={onResumeQueue}
          queuePaused={queuePaused}
        />
        <div className="batch-table-wrap">
          <div className="batch-table-toolbar">
            <div>
              <span className="overline">Arquivos revisáveis</span>
              <strong>
                {tracks.length} arquivo{tracks.length === 1 ? "" : "s"} em{" "}
                {groups.length} grupo{groups.length === 1 ? "" : "s"}
              </strong>
            </div>
            <div className="batch-table-actions">
              <button
                type="button"
                onClick={() =>
                  onToggleTracks(
                    tracks.map((track) => track.id),
                    true,
                  )
                }
              >
                <Check /> Selecionar todos
              </button>
              <button
                type="button"
                onClick={() =>
                  onToggleTracks(
                    tracks.map((track) => track.id),
                    false,
                  )
                }
              >
                <X /> Limpar seleção
              </button>
            </div>
          </div>
          <table className="batch-table">
            <thead>
              <tr>
                <th className="batch-col-drag" aria-label="Ordem"></th>
                <th className="batch-col-select"></th>
                <th className="batch-col-expand"></th>
                <th className="batch-col-track">Faixa</th>
                <th className="batch-col-disk">Disco</th>
                <th className="batch-col-title">Título</th>
                <th className="batch-col-artist">Artista</th>
                <th className="batch-col-album">Álbum</th>
                <th className="batch-col-package">Pacote</th>
                <th className="batch-col-lufs">LUFS</th>
                <th className="batch-col-tp">TP</th>
                <th className="batch-col-normalize">Normalizar</th>
              </tr>
            </thead>
            {groups.map((group) => {
              const collapsed = collapsedGroups.includes(group.id);
              return (
                <tbody className="batch-table-group" key={group.id}>
                  <tr className="batch-group-row">
                    <td colSpan={12}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                      >
                        {collapsed ? <ChevronRight /> : <ChevronDown />}
                        <strong>{group.label}</strong>
                        <span>
                          {group.selectedCount}/{group.trackCount} selecionadas
                        </span>
                      </button>
                    </td>
                  </tr>
                  {!collapsed &&
                    group.tracks.map((track) => {
                      const expanded = expandedRows.includes(track.id);
                      return (
                        <Fragment key={track.id}>
                          <tr
                            className={`batch-main-row ${track.id === selectedTrackId ? "selected" : ""} ${expanded ? "is-expanded" : ""} ${draggedTrackId === track.id ? "is-dragging" : ""} ${dragOverTrackId === track.id ? "is-drag-over" : ""}`}
                            onDragLeave={() => {
                              if (dragOverTrackId === track.id) {
                                setDragOverTrackId("");
                              }
                            }}
                            onDragOver={(event) => {
                              if (
                                draggedTrackId &&
                                draggedTrackId !== track.id
                              ) {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setDragOverTrackId(track.id);
                              }
                            }}
                            onDrop={(event) => dropTrackOn(event, track.id)}
                            onClick={() => onSelectTrack(track.id)}
                          >
                            <td className="batch-col-drag">
                              <button
                                aria-label={`Arrastar ${track.metadata.title} para reordenar`}
                                className="batch-row-drag"
                                draggable
                                type="button"
                                onClick={(event) => event.stopPropagation()}
                                onDragEnd={finishTrackDrag}
                                onDragStart={(event) =>
                                  startTrackDrag(event, track.id)
                                }
                              >
                                <GripVertical />
                              </button>
                            </td>
                            <td className="batch-col-select">
                              <input
                                aria-label={`Selecionar ${track.metadata.title}`}
                                checked={track.selectedForBatch}
                                type="checkbox"
                                onChange={(event) =>
                                  onToggleTrack(track.id, event.target.checked)
                                }
                                onClick={(event) => event.stopPropagation()}
                              />
                            </td>
                            <td className="batch-col-expand">
                              <button
                                aria-label={
                                  expanded
                                    ? `Recolher detalhes de ${track.metadata.title}`
                                    : `Expandir detalhes de ${track.metadata.title}`
                                }
                                className="batch-row-expand"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onSelectTrack(track.id);
                                  toggleRow(track.id);
                                }}
                              >
                                <ChevronDown className="expand-closed-icon" />
                                <ChevronUp className="expand-open-icon" />
                              </button>
                            </td>
                            <td className="batch-col-track">
                              <input
                                aria-label="Faixa"
                                className="batch-wide-field"
                                value={String(track.metadata.trackNumber)}
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    trackNumber: Math.max(
                                      1,
                                      Number(event.target.value) || 1,
                                    ),
                                  })
                                }
                              />
                              <span className="batch-compact-value">
                                {track.metadata.trackNumber}
                              </span>
                            </td>
                            <td className="batch-col-disk">
                              <input
                                aria-label="Disco"
                                value={String(track.metadata.diskNumber)}
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    diskNumber: Math.max(
                                      1,
                                      Number(event.target.value) || 1,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td className="batch-col-title">
                              <input
                                aria-label="Título"
                                className="batch-wide-field"
                                value={track.metadata.title}
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    title: event.target.value,
                                  })
                                }
                              />
                              <strong className="batch-compact-value">
                                {track.metadata.title || "Título ausente"}
                              </strong>
                            </td>
                            <td className="batch-col-artist">
                              <input
                                aria-label="Artista"
                                value={track.metadata.artist}
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    artist: event.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="batch-col-album">
                              <input
                                aria-label="Álbum"
                                value={track.metadata.album}
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    album: event.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="batch-col-package">
                              <span
                                className={`quality-badge ${track.packageStatus ?? "original"}`}
                              >
                                {track.packageStatus === "treated"
                                  ? "Tratado"
                                  : "Original"}
                              </span>
                            </td>
                            <td className="batch-col-lufs">
                              {formatMetric(
                                track.audioInfo?.analysis?.integratedLufs,
                                " LUFS",
                              )}
                            </td>
                            <td className="batch-col-tp">
                              {formatMetric(
                                track.audioInfo?.analysis?.truePeakDbtp,
                                " dBTP",
                              )}
                            </td>
                            <td className="batch-col-normalize">
                              <input
                                aria-label="Normalizar"
                                checked={track.metadata.normalizationEnabled}
                                type="checkbox"
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    normalizationEnabled: event.target.checked,
                                  })
                                }
                                onClick={(event) => event.stopPropagation()}
                              />
                            </td>
                          </tr>
                          <tr
                            className={`batch-detail-row ${expanded ? "is-expanded" : ""} ${track.id === selectedTrackId ? "is-focused" : ""}`}
                          >
                            <td colSpan={12}>
                              <div className="batch-row-details">
                                <label className="batch-detail-edit batch-detail-track">
                                  <span>Faixa</span>
                                  <input
                                    aria-label="Faixa detalhada"
                                    value={String(track.metadata.trackNumber)}
                                    onChange={(event) =>
                                      onTrackMetadata(track.id, {
                                        trackNumber: Math.max(
                                          1,
                                          Number(event.target.value) || 1,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label className="batch-detail-edit batch-detail-title">
                                  <span>Título</span>
                                  <input
                                    aria-label="Título detalhado"
                                    value={track.metadata.title}
                                    onChange={(event) =>
                                      onTrackMetadata(track.id, {
                                        title: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label className="batch-detail-edit batch-detail-disk">
                                  <span>Disco</span>
                                  <input
                                    aria-label="Disco detalhado"
                                    value={String(track.metadata.diskNumber)}
                                    onChange={(event) =>
                                      onTrackMetadata(track.id, {
                                        diskNumber: Math.max(
                                          1,
                                          Number(event.target.value) || 1,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label className="batch-detail-edit batch-detail-artist">
                                  <span>Artista</span>
                                  <input
                                    aria-label="Artista detalhado"
                                    value={track.metadata.artist}
                                    onChange={(event) =>
                                      onTrackMetadata(track.id, {
                                        artist: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label className="batch-detail-edit batch-detail-album">
                                  <span>Álbum</span>
                                  <input
                                    aria-label="Álbum detalhado"
                                    value={track.metadata.album}
                                    onChange={(event) =>
                                      onTrackMetadata(track.id, {
                                        album: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <div className="batch-detail-tags">
                                  <label className="batch-detail-tag">
                                    <span>Artista do álbum</span>
                                    <input
                                      aria-label="Artista do álbum"
                                      value={track.metadata.albumArtist}
                                      onChange={(event) =>
                                        onTrackMetadata(track.id, {
                                          albumArtist: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="batch-detail-tag">
                                    <span>Compositor</span>
                                    <input
                                      aria-label="Compositor"
                                      value={track.metadata.composer}
                                      onChange={(event) =>
                                        onTrackMetadata(track.id, {
                                          composer: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="batch-detail-tag">
                                    <span>Gênero</span>
                                    <input
                                      aria-label="Gênero"
                                      value={track.metadata.genre}
                                      onChange={(event) =>
                                        onTrackMetadata(track.id, {
                                          genre: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="batch-detail-tag">
                                    <span>Ano</span>
                                    <input
                                      aria-label="Ano"
                                      value={track.metadata.year}
                                      onChange={(event) =>
                                        onTrackMetadata(track.id, {
                                          year: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="batch-detail-tag">
                                    <span>Versão</span>
                                    <input
                                      aria-label="Versão"
                                      value={track.metadata.version}
                                      onChange={(event) =>
                                        onTrackMetadata(track.id, {
                                          version: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="batch-detail-tag">
                                    <span>Copyright</span>
                                    <input
                                      aria-label="Copyright"
                                      value={track.metadata.copyright}
                                      onChange={(event) =>
                                        onTrackMetadata(track.id, {
                                          copyright: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="batch-detail-tag batch-detail-tag-wide">
                                    <span>Comentário</span>
                                    <input
                                      aria-label="Comentário"
                                      value={track.metadata.comment}
                                      onChange={(event) =>
                                        onTrackMetadata(track.id, {
                                          comment: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                </div>
                                <div className="batch-detail-file">
                                  <span>Arquivo tratado</span>
                                  <strong>
                                    {previewTreatedFileName(
                                      track.metadata,
                                      fileNamePattern,
                                    )}
                                  </strong>
                                </div>
                                <div className="batch-detail-metric">
                                  <span>LUFS</span>
                                  <strong>
                                    {formatMetric(
                                      track.audioInfo?.analysis?.integratedLufs,
                                      " LUFS",
                                    )}
                                  </strong>
                                </div>
                                <div className="batch-detail-metric">
                                  <span>TP</span>
                                  <strong>
                                    {formatMetric(
                                      track.audioInfo?.analysis?.truePeakDbtp,
                                      " dBTP",
                                    )}
                                  </strong>
                                </div>
                                <CheckField
                                  label="Normalizar cópia"
                                  checked={track.metadata.normalizationEnabled}
                                  onChange={(normalizationEnabled) =>
                                    onTrackMetadata(track.id, {
                                      normalizationEnabled,
                                    })
                                  }
                                />
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>
    );
  }
  const analysis = selectedTrack?.audioInfo?.analysis;
  return (
    <div className="audio-library">
      <header className="audio-library-heading">
        <div>
          <span className="overline">Biblioteca de áudio</span>
          <h1>{selectedTrack?.metadata.title || "Selecione uma faixa"}</h1>
        </div>
        {analysis && (
          <span className={`quality-badge ${analysis.risk}`}>
            {riskLabel(analysis.risk)}
          </span>
        )}
      </header>
      {jobs.some((job) => job.kind === "audio-process") && (
        <BatchJobBoard
          jobs={jobs}
          title="Historico de processamento"
          onCancelAll={onCancelAllJobs}
          onCancelJob={onCancelJob}
          onClearTerminal={onClearTerminalJobs}
          onPause={onPauseQueue}
          onResume={onResumeQueue}
          queuePaused={queuePaused}
        />
      )}
      <section className="audio-stage-section waveform-section">
        <div className="audio-stage-title">
          <div>
            <span className="overline">Forma de onda</span>
            <strong>Preview técnico da faixa</strong>
          </div>
          <small>{selectedTrack?.metadata.artist || "Sem artista"}</small>
        </div>
        <div className="analytic-stage">
          {staticWaveformPeaks?.length ? (
            <StaticWaveform peaks={staticWaveformPeaks} />
          ) : (
            <AnalyticalWaveform samples={audioBands.samples} />
          )}
        </div>
      </section>
      <section className="audio-stage-section metrics-section">
        <div className="audio-stage-title">
          <div>
            <span className="overline">Qualidade</span>
            <strong>Leitura técnica antes do tratamento</strong>
          </div>
          {analysis && <small>{riskLabel(analysis.risk)}</small>}
        </div>
        <dl className="metric-strip">
          <Metric
            label="LUFS integrado"
            value={formatMetric(analysis?.integratedLufs, " LUFS")}
          />
          <Metric
            label="True peak"
            value={formatMetric(analysis?.truePeakDbtp, " dBTP")}
          />
          <Metric
            label="Faixa dinamica"
            value={formatMetric(analysis?.loudnessRangeLu, " LU")}
          />
          <Metric
            label="Codec"
            value={selectedTrack?.audioInfo?.codec || "--"}
          />
          <Metric
            label="Duracao"
            value={formatDuration(selectedTrack?.audioInfo?.durationSeconds)}
          />
        </dl>
      </section>
    </div>
  );
}

function formatDuration(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const safe = Number(seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function formatMetric(value?: number | null, unit = "") {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}${unit}` : "--";
}

function previewTreatedFileName(
  metadata: TrackMetadata,
  pattern: FileNamePattern,
) {
  return `${buildNameFromPattern(pattern, metadata, safeFilePart) || "Sem titulo"}.mp3`;
}

function safeFilePart(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Sem titulo";
}

function riskLabel(risk: AudioTechnicalAnalysis["risk"]) {
  return {
    safe: "Margem adequada",
    "reduced-headroom": "Margem reduzida",
    overload: "Sobrecarga detectada",
    "decode-error": "Falha na análise",
  }[risk];
}
