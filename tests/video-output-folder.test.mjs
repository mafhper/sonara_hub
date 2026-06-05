import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareVideoOutputProject,
  videoOutputProjectDirectoryName,
} from "../shared/video-output-folder.mjs";

test("video output backup moves only the target project directory contents", async () => {
  const project = dir("Album A", {
    "old.mp4": file("old-video"),
    assets: dir("assets", {
      "old.mp4.youtube.json": file("{}"),
    }),
  });
  const output = dir("Saida", {
    "Album A": project,
    "Album B": dir("Album B", {
      "keep.mp4": file("keep"),
    }),
  });

  const target = await prepareVideoOutputProject(output, "Album A", {
    backupStamp: "20260605-130000",
    conflictMode: "backup",
  });

  assert.equal(target.projectName, "Album A");
  assert.deepEqual(Object.keys(output.children).sort(), [
    "Album A",
    "Album B",
    "backup",
  ]);
  assert.deepEqual(Object.keys(output.children["Album A"].children), [
    "assets",
  ]);
  assert.equal(
    output.children.backup.children["20260605-130000-Album A"].children[
      "old.mp4"
    ].payload,
    "old-video",
  );
  assert.equal(
    output.children.backup.children["20260605-130000-Album A"].children.assets
      .children["old.mp4.youtube.json"].payload,
    "{}",
  );
  assert.equal(output.children["Album B"].children["keep.mp4"].payload, "keep");
});

test("video output clear removes only the target project contents", async () => {
  const output = dir("Saida", {
    "Album A": dir("Album A", {
      "old.mp4": file("old-video"),
    }),
    "Album B": dir("Album B", {
      "keep.mp4": file("keep"),
    }),
  });

  await prepareVideoOutputProject(output, "Album A", {
    conflictMode: "clear",
  });

  assert.deepEqual(Object.keys(output.children["Album A"].children), [
    "assets",
  ]);
  assert.equal(output.children["Album B"].children["keep.mp4"].payload, "keep");
});

test("video output overwrite keeps existing target contents for same-name replacement", async () => {
  const output = dir("Saida", {
    "Album A": dir("Album A", {
      "old.mp4": file("old-video"),
    }),
  });

  await prepareVideoOutputProject(output, "Album A", {
    conflictMode: "overwrite",
  });

  assert.equal(
    output.children["Album A"].children["old.mp4"].payload,
    "old-video",
  );
  assert.equal(output.children.backup, undefined);
});

test("video output project name prefers album and sanitizes path separators", () => {
  assert.equal(
    videoOutputProjectDirectoryName(
      { album: "Album: A / Final", artist: "Artist" },
      "Projeto",
    ),
    "Album A Final",
  );
});

function dir(name, children = {}) {
  return new MockDirectoryHandle(name, children);
}

function file(payload) {
  return new MockFileHandle("file.bin", payload);
}

class MockFileHandle {
  kind = "file";

  constructor(name, payload) {
    this.name = name;
    this.payload = payload;
  }

  async getFile() {
    return new File([this.payload], this.name, {
      type: "application/octet-stream",
    });
  }

  async createWritable() {
    return {
      write: async (data) => {
        this.payload = await new Response(data).text();
      },
      close: async () => {},
    };
  }
}

class MockDirectoryHandle {
  kind = "directory";

  constructor(name, children = {}) {
    this.name = name;
    this.children = children;
  }

  async *entries() {
    for (const entry of Object.entries(this.children)) yield entry;
  }

  async getDirectoryHandle(name, options = {}) {
    const found = this.children[name];
    if (found?.kind === "directory") return found;
    if (!options.create) {
      throw new DOMException(`Directory not found: ${name}`, "NotFoundError");
    }
    const created = new MockDirectoryHandle(name);
    this.children[name] = created;
    return created;
  }

  async getFileHandle(name, options = {}) {
    const found = this.children[name];
    if (found?.kind === "file") return found;
    if (!options.create) {
      throw new DOMException(`File not found: ${name}`, "NotFoundError");
    }
    const created = new MockFileHandle(name, "");
    this.children[name] = created;
    return created;
  }

  async removeEntry(name) {
    delete this.children[name];
  }
}
