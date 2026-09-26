import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBytes,
  formatDuration,
  formatFileCount,
  formatUsage,
  messageOf,
} from "../src/app/appFormatters.ts";

/*
 * Primeiro teste comportamental de `src/` (ver SH-N8). Funciona sem harness de
 * DOM e sem dependencia nova: o Node 24 faz type stripping nativo, e este
 * modulo e logica pura sem JSX e sem React, com imports ja extensionados.
 * A barreira real nao e TypeScript -- sao os imports relativos sem extensao
 * (204 ocorrencias em src/) e o transform de JSX dos 37 arquivos .tsx.
 */

test("formatDuration degrada para --:-- quando nao ha duracao", () => {
  assert.equal(formatDuration(), "--:--");
  assert.equal(formatDuration(null), "--:--");
  assert.equal(formatDuration(Number.NaN), "--:--");
  assert.equal(formatDuration(Number.POSITIVE_INFINITY), "--:--");
});

test("formatDuration preenche os segundos e vira minutos", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(9), "0:09");
  assert.equal(formatDuration(59), "0:59");
  assert.equal(formatDuration(60), "1:00");
  assert.equal(formatDuration(90), "1:30");
  assert.equal(formatDuration(600), "10:00");
  assert.equal(formatDuration(3661), "61:01");
});

test("formatBytes troca de unidade nos limites", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1023), "1023 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1024 * 1024 - 1), "1024.0 KB");
  assert.equal(formatBytes(1024 * 1024), "1.0 MB");
  assert.equal(formatBytes(1024 * 1024 * 1024), "1.0 GB");
});

test("formatFileCount concorda no singular", () => {
  assert.equal(formatFileCount(0), "0 arquivos");
  assert.equal(formatFileCount(1), "1 arquivo");
  assert.equal(formatFileCount(2), "2 arquivos");
});

test("formatUsage mostra o estado de carregamento enquanto nao ha dados", () => {
  assert.equal(formatUsage(), "Calculando uso local...");
  assert.equal(formatUsage({ files: 1, bytes: 1024 }), "1 arquivo · 1.0 KB");
  assert.equal(
    formatUsage({ files: 3, bytes: 1024 * 1024 * 1024 }),
    "3 arquivos · 1.0 GB",
  );
});

test("messageOf preserva a mensagem de Error e serializa o resto", () => {
  assert.equal(messageOf(new Error("falhou")), "falhou");
  assert.equal(messageOf(new TypeError("tipo")), "tipo");
  assert.equal(messageOf("texto"), "texto");
  assert.equal(messageOf(42), "42");
  assert.equal(messageOf(null), "null");
  assert.equal(messageOf(undefined), "undefined");
});
