"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStoredZip, readStoredZip, snapshotBlob } = require("./package.js");

test("media snapshots remain readable after the source package on disk is overwritten", async t => {
  const fs = require("node:fs/promises");
  const { openAsBlob } = require("node:fs");
  const path = require("node:path");
  const os = require("node:os");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "formation-snapshot-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "opened.formation");
  const bytes = Buffer.alloc(1024 * 1024 + 27, 73);
  await fs.writeFile(filePath, bytes);
  const original = await openAsBlob(filePath);
  const snapshot = await snapshotBlob(original.slice(19, -7));
  await fs.writeFile(filePath, "A different saved project");
  await assert.rejects(original.arrayBuffer());
  assert.deepEqual(Buffer.from(await snapshot.arrayBuffer()), bytes.subarray(19, -7));
});

test("a failed media snapshot rejects before replacing any project data", async () => {
  const broken = { stream: () => new ReadableStream({ start(controller) { controller.error(new Error("File changed")); } }) };
  await assert.rejects(snapshotBlob(broken), /File changed/);
});

test("stored ZIP packages round-trip text and binary entries", async () => {
  const archive = await createStoredZip([
    { name: "manifest.json", data: JSON.stringify({ version: 1 }) },
    { name: "media/audio.bin", data: new Uint8Array([0, 1, 2, 250, 255]) },
  ]);
  const entries = await readStoredZip(archive, { maximumBytes: 1024 * 1024 });
  assert.equal(entries.size, 2);
  assert.deepEqual(JSON.parse(await entries.get("manifest.json").blob.text()), { version: 1 });
  assert.deepEqual([...new Uint8Array(await entries.get("media/audio.bin").blob.arrayBuffer())], [0, 1, 2, 250, 255]);
});

test("package writer rejects traversal and duplicate entry names", async () => {
  await assert.rejects(() => createStoredZip([{ name: "../secret", data: "x" }]));
  await assert.rejects(() => createStoredZip([
    { name: "manifest.json", data: "one" },
    { name: "manifest.json", data: "two" },
  ]));
});

test("package reader rejects payload corruption", async () => {
  const archive = await createStoredZip([{ name: "manifest.json", data: "integrity" }]);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const payloadIndex = bytes.findIndex((value, index) => index > 30 && value === "i".charCodeAt(0));
  bytes[payloadIndex] ^= 0xff;
  await assert.rejects(() => readStoredZip(new Blob([bytes])));
});
