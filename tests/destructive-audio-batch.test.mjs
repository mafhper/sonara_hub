import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveDestructiveBatchState,
  writeReplacementsWithRollback,
} from "../shared/destructive-audio-batch.mjs";

test("destructive batch waits while a selected job is missing or unfinished", () => {
  assert.equal(
    resolveDestructiveBatchState(["a", "b"], [{ id: "a", status: "done" }])
      .state,
    "waiting",
  );
  assert.equal(
    resolveDestructiveBatchState(
      ["a", "b"],
      [
        { id: "a", status: "done" },
        { id: "b", status: "running" },
      ],
    ).state,
    "waiting",
  );
});

test("destructive batch blocks replacement after cancel or processing error", () => {
  for (const status of ["canceled", "error"]) {
    assert.equal(
      resolveDestructiveBatchState(
        ["a", "b"],
        [
          { id: "a", status: "done" },
          { id: "b", status },
        ],
      ).state,
      "blocked",
    );
  }
});

test("destructive batch becomes ready only when every selected job finished", () => {
  assert.equal(
    resolveDestructiveBatchState(
      ["a", "b"],
      [
        { id: "a", status: "done" },
        { id: "b", status: "done" },
      ],
    ).state,
    "ready",
  );
});

test("destructive batch backs up every file before writing replacements", async () => {
  const events = [];
  const replacements = [
    { id: "a", blob: "new-a", original: "original-a" },
    { id: "b", blob: "new-b", original: "original-b" },
  ];
  await writeReplacementsWithRollback(replacements, {
    backup: async (replacement) => events.push(`backup:${replacement.id}`),
    write: async (replacement, payload) =>
      events.push(`write:${replacement.id}:${payload}`),
  });
  assert.deepEqual(events, [
    "backup:a",
    "backup:b",
    "write:a:new-a",
    "write:b:new-b",
  ]);
});

test("destructive batch restores every attempted original after a partial write failure", async () => {
  const events = [];
  const replacements = [
    { id: "a", blob: "new-a", original: "original-a" },
    { id: "b", blob: "new-b", original: "original-b" },
  ];
  await assert.rejects(
    writeReplacementsWithRollback(replacements, {
      backup: async (replacement) => events.push(`backup:${replacement.id}`),
      write: async (replacement, payload) => {
        events.push(`write:${replacement.id}:${payload}`);
        if (replacement.id === "b" && payload === "new-b") {
          throw new Error("filesystem unavailable");
        }
      },
    }),
    /filesystem unavailable/,
  );
  assert.deepEqual(events, [
    "backup:a",
    "backup:b",
    "write:a:new-a",
    "write:b:new-b",
    "write:b:original-b",
    "write:a:original-a",
  ]);
});
