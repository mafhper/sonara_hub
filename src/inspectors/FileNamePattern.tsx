import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  buildNameFromPattern,
  fileNameTokenLabels,
  fileNameTokens,
} from "../../shared/file-naming.mjs";

export type FileNamePattern = { tokens: string[]; separator: string };

export function FileNamePatternSection({
  extension = "mp3",
  onChange,
  pattern,
  sampleTags,
}: {
  extension?: "mp3" | "mp4";
  onChange: (next: FileNamePattern) => void;
  pattern: FileNamePattern;
  sampleTags: Record<string, unknown>;
}) {
  return (
    <>
      <p className="helper-copy">
        Monte o nome dos{" "}
        {extension === "mp4" ? "vídeos exportados" : "MP3 tratados"} na pasta de
        destino com os campos que quiser, na ordem que preferir.
      </p>
      <FileNamePatternEditor
        extension={extension}
        pattern={pattern}
        sampleTags={sampleTags}
        onChange={onChange}
      />
    </>
  );
}

function FileNamePatternEditor({
  extension,
  onChange,
  pattern,
  sampleTags,
}: {
  extension: "mp3" | "mp4";
  onChange: (next: FileNamePattern) => void;
  pattern: FileNamePattern;
  sampleTags: Record<string, unknown>;
}) {
  const included = pattern.tokens;
  const available = fileNameTokens.filter(
    (token: string) => !included.includes(token),
  );
  const move = (token: string, direction: -1 | 1) => {
    const index = included.indexOf(token);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= included.length) return;
    const next = [...included];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...pattern, tokens: next });
  };
  const preview = `${buildNameFromPattern(pattern, sampleTags) || "—"}.${extension}`;
  return (
    <div className="filename-pattern">
      <div className="filename-pattern-rows">
        {included.map((token, index) => (
          <div className="filename-pattern-row" key={token}>
            <span>
              {index + 1}. {fileNameTokenLabels[token] ?? token}
            </span>
            <span className="filename-pattern-actions">
              <button
                aria-label="Subir"
                disabled={index === 0}
                type="button"
                onClick={() => move(token, -1)}
              >
                <ChevronUp />
              </button>
              <button
                aria-label="Descer"
                disabled={index === included.length - 1}
                type="button"
                onClick={() => move(token, 1)}
              >
                <ChevronDown />
              </button>
              <button
                aria-label={`Remover ${fileNameTokenLabels[token] ?? token}`}
                type="button"
                onClick={() =>
                  onChange({
                    ...pattern,
                    tokens: included.filter((item) => item !== token),
                  })
                }
              >
                <X />
              </button>
            </span>
          </div>
        ))}
      </div>
      {available.length > 0 && (
        <div className="filename-pattern-add">
          {available.map((token: string) => (
            <button
              className="quiet-action"
              key={token}
              type="button"
              onClick={() =>
                onChange({ ...pattern, tokens: [...included, token] })
              }
            >
              + {fileNameTokenLabels[token] ?? token}
            </button>
          ))}
        </div>
      )}
      <label className="field filename-pattern-sep">
        <span>Separador</span>
        <input
          maxLength={6}
          value={pattern.separator}
          onChange={(event) =>
            onChange({ ...pattern, separator: event.target.value })
          }
        />
      </label>
      <p className="filename-pattern-preview">
        <span>Exemplo:</span> <code>{preview}</code>
      </p>
    </div>
  );
}
