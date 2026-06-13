import { Download, FolderOpen, RotateCcw } from "lucide-react";

import {
  clampPublicationClipDurationForPreset,
  clampPublicationClipStart,
  publicationConstraintSummary,
  publicationBookletThemes,
  publicationAssetPresets,
  publicationPresetMaxDurationSeconds,
} from "../../shared/publication-assets.mjs";
import type {
  PublicationAssetPreset,
  PublicationAssetSettings,
} from "../../shared/publication-assets.mjs";
import type { VideoOutputConflictMode } from "../../shared/video-output-folder.mjs";
import {
  publicationLyricsExcerptOptions,
  publicationPresetsForMode,
  type PublicationAssetMode,
} from "../publication";
import {
  CheckField,
  InspectorGroup,
  NumberStepField,
  RangeField,
  SelectField,
  TextArea,
} from "./fields";

export function PublicationInspector({
  assetMode,
  assetSettings,
  clipDuration,
  clipStart,
  generateDataFiles,
  includeLyrics,
  lyricsText,
  outputConflictMode,
  outputFolderName,
  presetId,
  presetOverrideActive,
  selectedCount,
  selectedPreset,
  onApplyTextToScope,
  onAssetMode,
  onAssetSettings,
  onChooseOutput,
  onClipDuration,
  onClipStart,
  onExport,
  onGenerateDataFiles,
  onIncludeLyrics,
  onOutputConflictMode,
  onPreset,
  onResetAssetSettings,
}: {
  assetMode: PublicationAssetMode;
  assetSettings: PublicationAssetSettings;
  clipDuration: number;
  clipStart: number;
  generateDataFiles: boolean;
  includeLyrics: boolean;
  lyricsText: string;
  outputConflictMode: VideoOutputConflictMode;
  outputFolderName: string;
  presetId: string;
  presetOverrideActive: boolean;
  selectedCount: number;
  selectedPreset: PublicationAssetPreset;
  onApplyTextToScope: (scope: "group" | "all") => void;
  onAssetMode: (value: PublicationAssetMode) => void;
  onAssetSettings: (patch: Partial<PublicationAssetSettings>) => void;
  onChooseOutput: () => void;
  onClipDuration: (value: number) => void;
  onClipStart: (value: number) => void;
  onExport: () => void;
  onGenerateDataFiles: (value: boolean) => void;
  onIncludeLyrics: (value: boolean) => void;
  onOutputConflictMode: (value: string) => void;
  onPreset: (value: string) => void;
  onResetAssetSettings: () => void;
}) {
  const selectionCount = publicationPresetsForMode(
    selectedPreset,
    assetMode,
  ).length;
  const lyricsOptions = publicationLyricsExcerptOptions(lyricsText);
  const selectedConstraintSummary =
    publicationConstraintSummary(selectedPreset);
  const selectedMaxDuration =
    publicationPresetMaxDurationSeconds(selectedPreset);
  return (
    <>
      <InspectorGroup title="Divulgação" open>
        <div className="inspector-subsection">
          <p className="inspector-kicker">Preset</p>
          <SelectField
            label="Formato base"
            value={presetId}
            onChange={onPreset}
          >
            {publicationAssetPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label} · {preset.width}x{preset.height}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Disparar"
            value={assetMode}
            onChange={(value) => onAssetMode(value as PublicationAssetMode)}
          >
            <option value="single">Individual</option>
            <option value="group">Grupo do formato</option>
            <option value="all">Total</option>
          </SelectField>
          <p className="helper-copy">
            Gerar {selectionCount} preset{selectionCount === 1 ? "" : "s"} para{" "}
            {selectedCount} faixa
            {selectedCount === 1 ? "" : "s"}.
          </p>
          {selectedConstraintSummary && (
            <p className="helper-copy">
              Limites do formato: {selectedConstraintSummary}.
            </p>
          )}
        </div>
        <div className="inspector-subsection">
          <p className="inspector-kicker">Padrão global</p>
          <RangeField
            label="Início padrão"
            min={0}
            max={300}
            step={1}
            unit="s"
            value={clipStart}
            onChange={onClipStart}
          />
          <RangeField
            label="Duração padrão"
            min={1}
            max={600}
            step={1}
            unit="s"
            value={clipDuration}
            onChange={onClipDuration}
          />
          <CheckField
            label="Incluir letras completas por padrão"
            checked={includeLyrics}
            onChange={onIncludeLyrics}
          />
          <p className="helper-copy">
            A letra escolhida é sobreposta no clipe, entra nos arquivos de dados
            das imagens e compõe o HTML do encarte.
          </p>
          <CheckField
            label="Gerar arquivos de dados (JSON/Markdown)"
            checked={generateDataFiles}
            onChange={onGenerateDataFiles}
          />
          <p className="helper-copy">
            Desligue para exportar só o clipe/imagem, sem o manifesto de dados.
          </p>
        </div>
        <div className="inspector-subsection publication-asset-override">
          <div className="publication-asset-override-head">
            <div>
              <p className="inspector-kicker">Ajustes deste asset</p>
              <strong>{selectedPreset.label}</strong>
            </div>
            <button
              className="icon-button"
              disabled={!presetOverrideActive}
              title="Voltar ao padrão global"
              type="button"
              onClick={onResetAssetSettings}
            >
              <RotateCcw />
            </button>
          </div>
          {selectedPreset.kind === "clip" ? (
            <>
              <NumberStepField
                label="Início deste asset"
                max={300}
                min={0}
                step={1}
                unit="s"
                value={assetSettings.clipStart}
                onChange={(clipStart) => onAssetSettings({ clipStart })}
              />
              <NumberStepField
                label="Duração deste asset"
                max={selectedMaxDuration}
                min={1}
                step={1}
                unit="s"
                value={assetSettings.clipDuration}
                onChange={(clipDuration) =>
                  onAssetSettings({
                    clipDuration: clampPublicationClipDurationForPreset(
                      clipDuration,
                      selectedPreset,
                    ),
                  })
                }
              />
            </>
          ) : selectedPreset.kind === "booklet" ? (
            <>
              <SelectField
                label="Tema do encarte"
                value={assetSettings.bookletTheme}
                onChange={(bookletTheme) => onAssetSettings({ bookletTheme })}
              >
                {publicationBookletThemes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </SelectField>
              <p className="helper-copy">
                O encarte exporta um HTML estático com capa, créditos,
                descrição, tags e letra selecionada.
              </p>
            </>
          ) : (
            <>
              <NumberStepField
                label="Frame do pôster"
                max={300}
                min={0}
                step={1}
                unit="s"
                value={assetSettings.clipStart}
                onChange={(clipStart) =>
                  onAssetSettings({
                    clipStart: clampPublicationClipStart(clipStart),
                  })
                }
              />
              <p className="helper-copy">
                A imagem é renderizada neste segundo da composição — escolha o
                frame que quer congelar.
              </p>
            </>
          )}
          <SelectField
            label="Letra deste asset"
            value={assetSettings.lyricsMode}
            onChange={(value) => {
              const lyricsMode =
                value as PublicationAssetSettings["lyricsMode"];
              onAssetSettings({
                includeLyrics: lyricsMode !== "none",
                lyricsExcerpt:
                  lyricsMode === "excerpt" && !assetSettings.lyricsExcerpt
                    ? (lyricsOptions[0]?.value ?? "")
                    : assetSettings.lyricsExcerpt,
                lyricsMode,
              });
            }}
          >
            <option value="none">Sem letra</option>
            <option value="full">Letra completa</option>
            <option value="excerpt">Trecho editado</option>
          </SelectField>
          {assetSettings.lyricsMode !== "none" && (
            <>
              <CheckField
                label="Ocultar tags entre [ ]"
                checked={assetSettings.lyricsHideTags}
                onChange={(lyricsHideTags) =>
                  onAssetSettings({ lyricsHideTags })
                }
              />
              {selectedPreset.kind === "clip" && (
                <>
                  <SelectField
                    label="Posição da letra no clipe"
                    value={assetSettings.lyricsPosition}
                    onChange={(value) =>
                      onAssetSettings({
                        lyricsPosition:
                          value as PublicationAssetSettings["lyricsPosition"],
                      })
                    }
                  >
                    <option value="bottom">Base</option>
                    <option value="center">Centro</option>
                    <option value="top">Topo</option>
                  </SelectField>
                  <SelectField
                    label="Estilo da letra no clipe"
                    value={assetSettings.lyricsStyle}
                    onChange={(value) =>
                      onAssetSettings({
                        lyricsStyle:
                          value as PublicationAssetSettings["lyricsStyle"],
                      })
                    }
                  >
                    <option value="minimal">Minimal (contorno fino)</option>
                    <option value="shadow">Sombra forte</option>
                    <option value="boxed">Caixa de fundo</option>
                  </SelectField>
                </>
              )}
              <RangeField
                label="Espaçamento da letra"
                max={220}
                min={100}
                step={5}
                unit="%"
                value={assetSettings.lyricsLineSpacing}
                onChange={(lyricsLineSpacing) =>
                  onAssetSettings({ lyricsLineSpacing })
                }
              />
            </>
          )}
          {assetSettings.lyricsMode === "excerpt" && (
            <>
              {lyricsOptions.length ? (
                <SelectField
                  label="Trecho sugerido"
                  value=""
                  onChange={(value) => {
                    const option = lyricsOptions.find(
                      (candidate) => candidate.id === value,
                    );
                    if (option) {
                      onAssetSettings({
                        includeLyrics: true,
                        lyricsExcerpt: option.value,
                        lyricsMode: "excerpt",
                      });
                    }
                  }}
                >
                  <option value="">Escolher trecho</option>
                  {lyricsOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <p className="helper-copy">
                  Esta faixa ainda não tem letra detectada; cole o trecho abaixo
                  para incluir no manifesto.
                </p>
              )}
              <TextArea
                label="Trecho editável da letra"
                rows={6}
                value={assetSettings.lyricsExcerpt}
                onChange={(lyricsExcerpt) =>
                  onAssetSettings({
                    includeLyrics: true,
                    lyricsExcerpt,
                    lyricsMode: "excerpt",
                  })
                }
              />
            </>
          )}
          {selectedPreset.kind !== "booklet" && (
            <>
              <div className="publication-text-override">
                <p className="inspector-kicker">Texto deste asset</p>
                <RangeField
                  label="Tamanho do texto"
                  max={2}
                  min={0.5}
                  step={0.05}
                  unit="x"
                  value={assetSettings.textScale}
                  onChange={(textScale) => onAssetSettings({ textScale })}
                />
                <RangeField
                  label="Deslocar horizontal"
                  max={40}
                  min={-40}
                  step={1}
                  unit="%"
                  value={assetSettings.textOffsetX}
                  onChange={(textOffsetX) => onAssetSettings({ textOffsetX })}
                />
                <RangeField
                  label="Deslocar vertical"
                  max={40}
                  min={-40}
                  step={1}
                  unit="%"
                  value={assetSettings.textOffsetY}
                  onChange={(textOffsetY) => onAssetSettings({ textOffsetY })}
                />
                <CheckField
                  label="Ocultar texto neste asset"
                  checked={assetSettings.hideText}
                  onChange={(hideText) => onAssetSettings({ hideText })}
                />
                <div className="publication-apply-scope">
                  <button
                    type="button"
                    onClick={() => onApplyTextToScope("group")}
                  >
                    Aplicar ao grupo
                  </button>
                  <button
                    type="button"
                    onClick={() => onApplyTextToScope("all")}
                  >
                    Aplicar a todos
                  </button>
                </div>
              </div>
              <p className="helper-copy">
                Este ajuste fica salvo no projeto para {selectedPreset.label} e
                não altera os demais assets. Use os botões para copiar o texto
                deste asset ao grupo ou a todos os formatos.
              </p>
            </>
          )}
        </div>
        <div className="inspector-subsection">
          <p className="inspector-kicker">Destino</p>
          <button
            className="upload-action"
            type="button"
            onClick={onChooseOutput}
          >
            <FolderOpen /> {outputFolderName}
          </button>
          <SelectField
            label="Se a pasta do projeto já existir"
            value={outputConflictMode}
            onChange={onOutputConflictMode}
          >
            <option value="backup">Fazer backup antes</option>
            <option value="overwrite">Sobrescrever nomes iguais</option>
            <option value="clear">Excluir conteúdo anterior</option>
          </SelectField>
          <p className="helper-copy">
            A saída fica em assets/publicacao/imagens, clips e dados dentro da
            subpasta do projeto.
          </p>
          <button
            className="primary-action wide"
            disabled={selectedCount === 0}
            type="button"
            onClick={onExport}
          >
            <Download /> Gerar divulgação
          </button>
        </div>
      </InspectorGroup>
    </>
  );
}
