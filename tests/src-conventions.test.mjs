import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * Guardas de convencao sobre `src/`, que a suite `node --test` nao alcanca.
 *
 * Por que ler o fonte em vez de exercitar o codigo: os testes desta pasta
 * importam apenas `server/` e `shared/` (0 imports de `src/`), nao ha harness
 * de DOM (jsdom/happy-dom) e `TextProfiles.tsx` e TSX, que o runner puro nao
 * importa. Um teste de UI tambem nao serviria: o editor atualiza settings de
 * forma imutavel, entao o defeito e latente e nao se manifesta pela interface --
 * o mesmo teste passaria antes e depois da correcao.
 *
 * Isto cobre a convencao, nao o comportamento em tempo de execucao. Fechar a
 * lacuna de verdade exige um harness de DOM para `src/`, que e uma decisao a
 * parte.
 */

const textProfilesSource = readFileSync(
  new URL("../src/inspectors/TextProfiles.tsx", import.meta.url),
  "utf8",
);

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `trecho inicial "${start}" nao encontrado`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `trecho final "${end}" nao encontrado`);
  return source.slice(from, to);
}

test("text profile store clones settings before retaining them", () => {
  const save = sliceBetween(
    textProfilesSource,
    "save(name: string, settings: TextOverlaySettings)",
    "    remove(name: string)",
  );

  assert.match(
    save,
    /settings:\s*cloneTextSettings\(settings\)/,
    `o store de perfis de texto retem a referencia viva do editor. Use cloneTextSettings(settings), como ja acontece em App.tsx, audioTrackDrafts.ts e TextInspector.tsx. Trecho encontrado:\n${save}`,
  );
  assert.doesNotMatch(
    save,
    /\{\s*name:\s*clean,\s*settings\s*,/,
    "o store de perfis de texto ainda retem `settings` sem clonar",
  );
});

test("text profile store imports the shared clone helper", () => {
  assert.match(
    textProfilesSource,
    /import\s*\{[^}]*\bcloneTextSettings\b[^}]*\}\s*from\s*"\.\/text-presets"/,
    "TextProfiles.tsx precisa importar cloneTextSettings de ./text-presets",
  );
});
