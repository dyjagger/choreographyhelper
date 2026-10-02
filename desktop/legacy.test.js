"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createStoredZip } = require("../package.js");
const { upgradeProjectCoordinates } = require("../core.js");
const { startDesktop } = require("./test-driver.js");

test("legacy layouts convert once while modern files, media, and ambiguous autosaves stay safe", { timeout: 90000 }, async t => {
  const app = await startDesktop(t);
  const legacy = {
    version: 4, projectTitle: "Legacy layout fixture", duration: 45, dancerCounter: 2,
    stageOrientation: "front-top", stageWidth: 1.25, stageDepth: 1.5, audioVolume: 0.7, videoVolume: 0.3,
    dancers: [
      { id: "legacy-one", number: 1, name: "Left", color: "#7156d9", keyframes: [
        { time: 0, x: 12.125, y: 20 },
        { time: 5.123456, x: 24.375, y: 40, hold: true },
        { time: 10.654321, x: 24.375, y: 40, hold: false },
        { time: 23.456789, x: 83.375, y: 60 },
      ] },
      { id: "legacy-two", number: 2, name: "Right", color: "#e0527d", keyframes: [{ time: 0, x: 83.375, y: 70 }, { time: 23.456789, x: 30.125, y: 25 }] },
    ],
  };
  const media = await fs.readFile(path.join(__dirname, "fixtures", "playback.mp3"));
  const mediaHash = createHash("sha256").update(media).digest("hex");
  const writePackage = async (name, project, createdAt) => {
    const manifest = { format: "formation-studio-package", version: 1, createdAt, projectEntry: "choreography.json",
      media: { audio: { entry: "media/audio.mp3", fileName: "legacy.mp3", type: "audio/mpeg", size: media.length }, video: null } };
    const blob = await createStoredZip([
      { name: "manifest.json", data: JSON.stringify(manifest) },
      { name: "choreography.json", data: JSON.stringify(project) },
      { name: "media/audio.mp3", data: media },
    ]);
    const filePath = path.join(app.directory, name);
    await fs.writeFile(filePath, Buffer.from(await blob.arrayBuffer()));
    return filePath;
  };
  const originalPath = await writePackage("old.formation.zip", legacy, "2026-09-18T02:56:21.782Z");
  const firstX = () => app.evaluate("parseFloat(document.querySelector('.dancer-marker[data-dancer-id=\"legacy-one\"]').style.left)");
  const openFile = async (filePath, checked, visible = true) => {
    await app.selectFile("#import-input", filePath);
    await app.waitFor("document.querySelector('#confirmation-dialog').open", "Import confirmation did not open");
    assert.equal(await app.evaluate("document.querySelector('#confirmation-legacy-layout').checked"), checked);
    assert.equal(await app.evaluate("!document.querySelector('#confirmation-layout-option').classList.contains('is-hidden')"), visible);
    await app.click("#confirmation-accept-button");
    await app.waitFor("!document.querySelector('#import-button').disabled && document.querySelectorAll('.dancer-marker').length===2", "Import did not finish");
  };
  await app.selectFile("#import-input", originalPath);
  await app.waitFor("document.querySelector('#confirmation-dialog').open", "Legacy confirmation did not open");
  await app.click("#confirmation-cancel-button");
  await app.waitFor("!document.querySelector('#import-button').disabled", "Cancelled import did not finish");
  assert.equal(await app.evaluate("document.querySelectorAll('.dancer-marker').length"), 0);
  await openFile(originalPath, true);
  await app.waitFor("document.querySelector('#audio-player').duration===45", "Original media did not load");
  assert.equal(await firstX(), 12.125, "The old top-front view must be preserved");
  assert.equal(await app.evaluate("document.querySelector('#legacy-layout-review').classList.contains('is-hidden')"), true);
  for (let i = 0; i < 3; i++) {
    await app.click("#front-bottom-button");
    assert.equal(await firstX(), 87.875);
    await app.click("#front-top-button");
    assert.equal(await firstX(), 12.125);
  }
  await app.click("#play-button");
  await app.waitFor("Number(document.querySelector('#time-input').value)>0.8", "Restored project did not play");
  await app.click("#play-button");
  assert.equal(await app.evaluate("document.querySelector('#audio-player').error"), null);
  await app.evaluate(`window.roundtripBlob=null;window.originalAnchorClick=HTMLAnchorElement.prototype.click;window.originalCreateUrl=URL.createObjectURL;
    URL.createObjectURL=function(blob){window.roundtripBlob=blob;return window.originalCreateUrl.call(URL,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download.endsWith('.formation'))window.originalAnchorClick.call(this);};`);
  await app.click("#export-package-button");
  await app.waitFor("Boolean(window.roundtripBlob)", "Export did not finish");
  const exported = await app.evaluate(`(async()=>{HTMLAnchorElement.prototype.click=window.originalAnchorClick;URL.createObjectURL=window.originalCreateUrl;
    const entries=await window.FormationPackage.readStoredZip(window.roundtripBlob);
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',await entries.get('media/audio.mp3').blob.arrayBuffer()));
    return {project:JSON.parse(await entries.get('choreography.json').blob.text()),mediaHash:[...hash].map(v=>v.toString(16).padStart(2,'0')).join('')};})()`);
  assert.deepEqual(exported.project, upgradeProjectCoordinates(legacy, { restoreLegacyLeftRight: true }));
  assert.equal(exported.mediaHash, mediaHash);
  const convertedPath = await writePackage("converted.formation", exported.project, "2026-09-18T02:56:21.782Z");
  for (let i = 0; i < 3; i++) {
    await openFile(convertedPath, false, false);
    assert.equal(await firstX(), 12.125, "Reload must not mirror converted coordinates again");
  }
  const currentV4 = { ...exported.project, version: 4 };
  const currentPath = await writePackage("current-v4.formation", currentV4, "2026-10-02T08:35:06.000Z");
  await openFile(currentPath, false);
  assert.equal(await firstX(), 12.125, "Modern unmarked v4 coordinates must not be guessed as legacy");
  const jsonPath = path.join(app.directory, "old.json");
  await fs.writeFile(jsonPath, JSON.stringify(legacy));
  await openFile(jsonPath, false);
  assert.equal(await firstX(), 87.875, "An ambiguous JSON defaults to keeping its coordinates");
  await app.selectFile("#import-input", jsonPath);
  await app.waitFor("document.querySelector('#confirmation-dialog').open", "JSON layout choice did not open");
  await app.click("#confirmation-legacy-layout");
  await app.click("#confirmation-accept-button");
  await app.waitFor("!document.querySelector('#import-button').disabled", "JSON import did not finish");
  assert.equal(await firstX(), 12.125);

  // A pre-existing v4 autosave has no package date: preserve it until a choice.
  const { identifier } = await app.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('formation-studio-project-v1',${JSON.stringify(JSON.stringify(legacy))})`,
  });
  await app.send("Page.reload");
  await app.waitFor("document.readyState==='complete' && !document.querySelector('#legacy-layout-review').classList.contains('is-hidden')", "Ambiguous autosave must expose recovery");
  await app.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  assert.equal(await firstX(), 87.875);
  await app.click("#restore-legacy-layout-button");
  await app.click("#confirmation-accept-button");
  await app.waitFor("document.querySelector('#legacy-layout-review').classList.contains('is-hidden')", "Layout recovery did not finish");
  assert.equal(await firstX(), 12.125);
  await app.click("#undo-button");
  assert.equal(await firstX(), 87.875);
  await app.click("#redo-button");
  assert.equal(await firstX(), 12.125);
  await app.click("#undo-button");
  await app.click("#keep-current-layout-button");
  assert.equal(await firstX(), 87.875);
  await app.waitFor("document.querySelector('#save-status').textContent==='Saved locally'", "Layout choice did not save");
  await app.evaluate("window.beforeReload=true");
  await app.send("Page.reload");
  await app.waitFor("!window.beforeReload && document.readyState==='complete' && document.querySelectorAll('.dancer-marker').length===2", "Converted autosave did not reopen");
  assert.equal(await firstX(), 87.875);
  assert.equal(await app.evaluate("document.querySelector('#legacy-layout-review').classList.contains('is-hidden')"), true);
  assert.equal(await app.evaluate("JSON.parse(localStorage.getItem('formation-studio-project-v1')).version"), 5);
  assert.deepEqual(app.exceptions, []);
});
