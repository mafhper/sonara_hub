import {
  Check,
  Copy,
  FileAudio,
  FileText,
  Gauge,
  Layers3,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useState } from "react";

import type { FileNamePattern } from "./FileNamePattern";
import { FileNamePatternSection } from "./FileNamePattern";
import {
  CheckField,
  InspectorGroup,
  SelectField,
  TextArea,
  TextField,
} from "./fields";
import { genreSuggestions, TagSelectField } from "./TagSelectField";
import type {
  AudioTechnicalAnalysis,
  LyricsSuggestion,
  TrackMetadata,
} from "../types";

const lyricsLanguages: Array<[string, string]> = [
  ["und", "Indefinido"],
  ["por", "Português"],
  ["eng", "Inglês"],
  ["spa", "Espanhol"],
  ["fra", "Francês"],
  ["ita", "Italiano"],
  ["deu", "Alemão"],
  ["jpn", "Japonês"],
  ["kor", "Coreano"],
  ["zho", "Chinês"],
  ["rus", "Russo"],
  ["ara", "Árabe"],
];

// BCP-47 tags for the YouTube defaultLanguage/defaultAudioLanguage fields.
const youtubeLanguages: Array<[string, string]> = [
  ["pt-BR", "Português (Brasil)"],
  ["pt-PT", "Português (Portugal)"],
  ["en-US", "Inglês (EUA)"],
  ["en-GB", "Inglês (Reino Unido)"],
  ["es-ES", "Espanhol (Espanha)"],
  ["es-419", "Espanhol (Latam)"],
  ["fr-FR", "Francês"],
  ["it-IT", "Italiano"],
  ["de-DE", "Alemão"],
  ["ja-JP", "Japonês"],
  ["ko-KR", "Coreano"],
  ["zh-CN", "Chinês (Simplificado)"],
  ["ru-RU", "Russo"],
];

export function AudioLibraryInspector({
  analysis,
  fileNamePattern,
  lyricsOptions,
  lyricsSourcePath,
  metadata,
  workflowMode,
  onAnalyze,
  onApplyLyricsSuggestion,
  onApplyPublicationBatch,
  onApplySuggestions,
  onChange,
  onCreateVariation,
  onFileNamePattern,
  onIgnoreLyricsSuggestions,
  onReplaceAudio,
  isAnalyzing,
  onProcess,
  versionSuggestions,
}: {
  analysis?: AudioTechnicalAnalysis;
  fileNamePattern: FileNamePattern;
  lyricsOptions: LyricsSuggestion[];
  lyricsSourcePath?: string;
  metadata: TrackMetadata;
  workflowMode: "single" | "batch";
  onAnalyze: () => void;
  onApplyLyricsSuggestion: (suggestion: LyricsSuggestion) => void;
  onApplyPublicationBatch?: () => void;
  onApplySuggestions: () => void;
  onChange: (patch: Partial<TrackMetadata>) => void;
  onCreateVariation: () => void;
  onFileNamePattern: (next: FileNamePattern) => void;
  onIgnoreLyricsSuggestions: () => void;
  onReplaceAudio?: () => void;
  isAnalyzing: boolean;
  onProcess: () => void;
  versionSuggestions: string[];
}) {
  const [activeInspectorTab, setActiveInspectorTab] = useState<
    "data" | "lyrics" | "quality"
  >("data");
  const tabs = [
    ["data", "Dados", FileAudio],
    ["lyrics", "Letra", FileText],
    ["quality", "Qualidade", Gauge],
  ] as const;
  return (
    <div className="audio-inspector-tabbed">
      <div className="audio-inspector-tab-content">
        {activeInspectorTab === "data" && (
          <>
            <InspectorGroup title="Dados" open scope="track">
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
                  onChange={(artist) => onChange({ artist })}
                />
                <TextField
                  label="Álbum"
                  value={metadata.album}
                  onChange={(album) => onChange({ album })}
                />
                <TextField
                  label="Artista do álbum"
                  value={metadata.albumArtist}
                  onChange={(albumArtist) => onChange({ albumArtist })}
                />
                <TextField
                  label="Versão"
                  suggestions={versionSuggestions}
                  value={metadata.version}
                  onChange={(version) => onChange({ version })}
                />
              </div>
              <div className="inspector-subsection">
                <p className="inspector-kicker">Catálogo e ID3</p>
                <TagSelectField
                  label="Gênero"
                  value={metadata.genre}
                  suggestions={genreSuggestions}
                  storageKey="sonara.customGenres"
                  placeholder="Buscar ou adicionar gênero…"
                  onChange={(genre) => onChange({ genre })}
                />
                <TextField
                  label="Compositor"
                  value={metadata.composer}
                  onChange={(composer) => onChange({ composer })}
                />
                <TextArea
                  label="Comentário ID3"
                  rows={3}
                  value={metadata.comment}
                  onChange={(comment) => onChange({ comment })}
                />
                <TextField
                  label="Ano"
                  value={metadata.year}
                  onChange={(year) => onChange({ year })}
                />
                <div className="two-columns">
                  <TextField
                    label="Faixa"
                    value={String(metadata.trackNumber)}
                    onChange={(value) =>
                      onChange({ trackNumber: Math.max(1, Number(value) || 1) })
                    }
                  />
                  <TextField
                    label="Total"
                    value={String(metadata.trackTotal)}
                    onChange={(value) =>
                      onChange({ trackTotal: Math.max(1, Number(value) || 1) })
                    }
                  />
                </div>
              </div>
              <div className="inspector-subsection">
                <p className="inspector-kicker">Ações</p>
                <button
                  className="quiet-action"
                  title="Preenche os campos acima com as tags ID3 embutidas no arquivo e o que dá para inferir do nome/pasta."
                  type="button"
                  onClick={onApplySuggestions}
                >
                  <RotateCcw /> Preencher com tags do arquivo
                </button>
                <button
                  className="quiet-action"
                  type="button"
                  onClick={onCreateVariation}
                >
                  <Copy /> Criar variação
                </button>
                {onReplaceAudio && (
                  <button
                    className="upload-action"
                    type="button"
                    onClick={onReplaceAudio}
                  >
                    <FileAudio /> Trocar áudio desta versão
                  </button>
                )}
              </div>
            </InspectorGroup>
            <InspectorGroup
              title="Nomenclatura dos arquivos tratados"
              scope="series"
            >
              <div className="inspector-subsection">
                <p className="inspector-kicker">Padrão de arquivo</p>
                <FileNamePatternSection
                  pattern={fileNamePattern}
                  sampleTags={metadata}
                  onChange={onFileNamePattern}
                />
              </div>
            </InspectorGroup>
            <InspectorGroup title="Publicação YouTube" scope="track">
              <div className="inspector-subsection">
                <p className="inspector-kicker">Canal</p>
                <p className="helper-copy">
                  Defina aqui, junto com os dados da faixa, para não passar
                  despercebido na exportação. A saída inclui um `.youtube.json`.
                </p>
                <SelectField
                  label="Privacidade"
                  value={metadata.visibility}
                  onChange={(visibility) => onChange({ visibility })}
                >
                  <option value="private">Privado</option>
                  <option value="unlisted">Não listado</option>
                  <option value="public">Público</option>
                </SelectField>
                <SelectField
                  label="Idioma"
                  value={metadata.language}
                  onChange={(language) => onChange({ language })}
                >
                  {youtubeLanguages.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="inspector-subsection">
                <p className="inspector-kicker">Conteúdo</p>
                <TextArea
                  label="Descrição"
                  value={metadata.description}
                  onChange={(description) => onChange({ description })}
                />
                <TagSelectField
                  label="Tags"
                  value={metadata.tags}
                  suggestions={[]}
                  storageKey="sonara.customTags"
                  placeholder="Adicionar tag…"
                  onChange={(tags) => onChange({ tags })}
                />
              </div>
              <div className="inspector-subsection">
                <p className="inspector-kicker">Declarações</p>
                <CheckField
                  label="Declarar mídia sintética / IA"
                  checked={metadata.containsSyntheticMedia}
                  onChange={(containsSyntheticMedia) =>
                    onChange({ containsSyntheticMedia })
                  }
                />
                {onApplyPublicationBatch && (
                  <button
                    className="upload-action"
                    type="button"
                    onClick={onApplyPublicationBatch}
                  >
                    <Layers3 /> Aplicar publicação ao lote
                  </button>
                )}
              </div>
            </InspectorGroup>
          </>
        )}
        {activeInspectorTab === "lyrics" && (
          <InspectorGroup title="Letra" open>
            {lyricsOptions.length > 0 && (
              <div className="lyrics-suggestion-panel">
                <div className="lyrics-suggestion-head">
                  <div>
                    <p className="inspector-kicker">Letras detectadas</p>
                    <small>
                      {lyricsSourcePath
                        ? `Aplicada de ${lyricsSourcePath}`
                        : "Escolha uma letra detectada na Pasta de Entrada."}
                    </small>
                  </div>
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={onIgnoreLyricsSuggestions}
                  >
                    <X /> Ignorar
                  </button>
                </div>
                <div className="lyrics-suggestion-list">
                  {lyricsOptions.map((suggestion) => (
                    <button
                      className={
                        suggestion.relativePath === lyricsSourcePath
                          ? "active"
                          : ""
                      }
                      key={suggestion.relativePath}
                      type="button"
                      onClick={() => onApplyLyricsSuggestion(suggestion)}
                    >
                      <strong>{suggestion.fileName}</strong>
                      <span>
                        {lyricsMatchLabel(suggestion)} ·{" "}
                        {suggestion.relativePath}
                      </span>
                      {suggestion.preview && (
                        <small>{suggestion.preview}</small>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <TextArea
              label="Letra manual sem sincronizacao"
              value={metadata.lyrics}
              onChange={(lyrics) => onChange({ lyrics })}
            />
            <SelectField
              label="Idioma da letra (ID3)"
              value={metadata.lyricsLanguage}
              onChange={(lyricsLanguage) => onChange({ lyricsLanguage })}
            >
              {lyricsLanguages.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </SelectField>
          </InspectorGroup>
        )}
        {activeInspectorTab === "quality" && (
          <InspectorGroup title="Qualidade" open>
            {analysis ? (
              <p className={`quality-callout ${analysis.risk}`}>
                {riskDescription(analysis)}
              </p>
            ) : (
              <p className="helper-copy">
                Analise a faixa para medir loudness e margem de pico.
              </p>
            )}
            <CheckField
              label="Normalizar cópia tratada para -14 LUFS / -1 dBTP"
              checked={metadata.normalizationEnabled}
              onChange={(normalizationEnabled) =>
                onChange({ normalizationEnabled })
              }
            />
            <button
              className="quiet-action"
              disabled={isAnalyzing}
              type="button"
              onClick={onAnalyze}
            >
              {isAnalyzing ? (
                <Loader2 className="spin-icon" />
              ) : (
                <SlidersHorizontal />
              )}{" "}
              {isAnalyzing ? "Analisando qualidade..." : "Analisar qualidade"}
            </button>
            <button
              className="primary-action wide"
              type="button"
              onClick={onProcess}
            >
              <Check />{" "}
              {workflowMode === "batch"
                ? "Processar selecionados"
                : "Processar cópia"}
            </button>
          </InspectorGroup>
        )}
      </div>
      <div className="audio-inspector-tabbar" role="tablist">
        {tabs.map(([value, label, Icon]) => (
          <button
            aria-selected={activeInspectorTab === value}
            className={activeInspectorTab === value ? "active" : ""}
            key={value}
            role="tab"
            type="button"
            onClick={() => setActiveInspectorTab(value)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function lyricsMatchLabel(suggestion: LyricsSuggestion) {
  const base =
    {
      "audio-stem": "nome do arquivo",
      "track-title": "título da faixa",
      "numbered-title": "número e título",
      "numbered-audio-stem": "número e arquivo",
      "title-with-prefix": "título com prefixo",
      "stem-with-prefix": "arquivo com prefixo",
      "track-number": "número da faixa",
    }[suggestion.matchedBy] ?? "candidato";
  return suggestion.confidence === "high" ? `match por ${base}` : base;
}

function riskDescription(analysis: AudioTechnicalAnalysis) {
  if (analysis.risk === "reduced-headroom") {
    return `Margem reduzida: pico verdadeiro em ${analysis.truePeakDbtp.toFixed(2)} dBTP. Não há clipping confirmado; considere normalizar a cópia tratada.`;
  }
  if (analysis.risk === "overload") {
    return `Sobrecarga detectada: pico verdadeiro em ${analysis.truePeakDbtp.toFixed(2)} dBTP. Revise antes de exportar.`;
  }
  if (analysis.risk === "safe") {
    return `Margem adequada: ${analysis.integratedLufs.toFixed(1)} LUFS e ${analysis.truePeakDbtp.toFixed(2)} dBTP.`;
  }
  return "Não foi possível decodificar o áudio para a análise técnica.";
}
