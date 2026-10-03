"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { startDesktop } = require("./test-driver.js");

test("selected dancers can replace incoming movements with bounded holds using preview, H, history and export", { timeout: 90000 }, async t => {
  const app = await startDesktop(t);
  const original = {
    version: 5, projectTitle: "Transition hold fixture", duration: 45, dancerCounter: 4,
    stageOrientation: "front-bottom", stageWidth: 1.25, stageDepth: 1.5, audioVolume: 0.7, videoVolume: 0.3,
    dancers: [
      { id: "one", number: 1, name: "One", color: "#7156d9", keyframes: [
        { time: 0, x: 10, y: 20 }, { time: 5, x: 20, y: 30 }, { time: 10, x: 80, y: 60 },
        { time: 20, x: 90, y: 80 }, { time: 30, x: 90, y: 80, hold: true }, { time: 35, x: 90, y: 80, hold: false },
      ] },
      { id: "two", number: 2, name: "Two", color: "#e0527d", keyframes: [
        { time: 0, x: 90, y: 20 }, { time: 3, x: 70, y: 30 }, { time: 10, x: 30, y: 60 }, { time: 20, x: 10, y: 80 },
      ] },
      { id: "three", number: 3, name: "Three", color: "#27bda7", keyframes: [
        { time: 0, x: 25, y: 80 }, { time: 10, x: 50, y: 80 }, { time: 20, x: 75, y: 80 },
      ] },
      { id: "four", number: 4, name: "Four", color: "#e0af32", keyframes: [
        { time: 0, x: 50, y: 20 }, { time: 20, x: 50, y: 70 },
      ] },
    ],
  };
  const openJson = async project => {
    const filePath = path.join(app.directory, "transition.json");
    await fs.writeFile(filePath, JSON.stringify(project));
    await app.selectFile("#import-input", filePath);
    await app.waitFor("document.querySelector('#confirmation-dialog').open", "Import confirmation missing");
    await app.click("#confirmation-accept-button");
    await app.waitFor("!document.querySelector('#import-button').disabled && document.querySelectorAll('.dancer-marker').length===4", "Import did not finish");
    await app.waitFor("document.querySelector('#save-status').textContent==='Saved locally'", "Imported project did not save");
  };
  const savedProject = async () => {
    await app.waitFor("document.querySelector('#save-status').textContent==='Saved locally'", "Applied changes did not save");
    return app.evaluate("JSON.parse(localStorage.getItem('formation-studio-project-v1'))");
  };
  const positions = () => app.evaluate("[...document.querySelectorAll('.dancer-marker')].map(marker=>({id:marker.dataset.dancerId,x:parseFloat(marker.style.left),y:parseFloat(marker.style.top)}))");
  const assertSelectedPositions = async (firstX, secondX) => {
    const markers = await positions();
    assert.deepEqual(markers.find(marker => marker.id === "one"), { id: "one", x: firstX, y: 30 });
    assert.deepEqual(markers.find(marker => marker.id === "two"), { id: "two", x: secondX, y: 30 });
  };
  const seek = async time => {
    await app.click("#time-input");
    await app.type(String(time));
    await app.pressKey("Enter", "Enter");
    assert.equal(await app.evaluate("Number(document.querySelector('#timeline').value)"), time);
  };
  await openJson(original);
  const audioPath = path.join(__dirname, "fixtures", "playback.mp3");
  const audioHash = createHash("sha256").update(await fs.readFile(audioPath)).digest("hex");
  await app.selectFile("#audio-input", audioPath);
  await app.waitFor("document.querySelector('#audio-player').duration===45", "Audio metadata did not load");
  await app.click('.keyframe-chip[data-keyframe-time="10"] .keyframe-jump');
  await app.click('.dancer-row:nth-child(2) .dancer-select-button', 2);
  assert.equal(await app.evaluate("document.querySelector('#selection-count').textContent"), "2 selected");
  await app.click("#edit-keyframe-button");
  assert.equal(await app.evaluate("document.querySelector('#selection-count').textContent"), "2 selected", "Starting an edit must retain the group");
  assert.equal(await app.evaluate("document.querySelector('#hold-position-button').disabled"), false);
  await app.click("#hold-position-button");
  await assertSelectedPositions(20, 70);
  assert.equal(await app.evaluate("document.querySelectorAll('.transition-position-ghost').length"), 2);
  assert.deepEqual(await app.evaluate("JSON.parse(localStorage.getItem('formation-studio-project-v1'))"), original, "A hold preview must not autosave");
  await app.click("#cancel-transition-edit-button");
  assert.deepEqual(await savedProject(), original);
  assert.equal((await positions()).find(marker => marker.id === "one").x, 80);

  // H at a recorded arrival starts the group preview directly, then works inside it.
  await app.pressKey("h", "KeyH");
  await app.waitFor("!document.querySelector('#transition-edit-bar').classList.contains('is-hidden')", "H did not start a transition hold preview");
  await assertSelectedPositions(20, 70);
  await app.pressKey("ArrowRight", "ArrowRight");
  await assertSelectedPositions(21, 71);
  await app.pressKey("h", "KeyH");
  await assertSelectedPositions(20, 70);
  await app.pressKey("h", "KeyH");
  await assertSelectedPositions(20, 70);
  await app.click("#apply-transition-edit-button");
  const expected = structuredClone(original);
  expected.dancers[0].keyframes[1].hold = true;
  expected.dancers[0].keyframes[2] = { time: 10, x: 20, y: 30, hold: false };
  expected.dancers[1].keyframes[1].hold = true;
  expected.dancers[1].keyframes[2] = { time: 10, x: 70, y: 30, hold: false };
  assert.deepEqual(await savedProject(), expected, "Only the selected incoming transitions should change");
  await app.click("#undo-button");
  assert.deepEqual(await savedProject(), original, "One undo must restore the entire group");
  await app.click("#redo-button");
  assert.deepEqual(await savedProject(), expected);
  await seek(7);
  await assertSelectedPositions(20, 70);
  await seek(20);
  const later = await positions();
  assert.deepEqual(later.find(marker => marker.id === "one"), { id: "one", x: 90, y: 80 });
  assert.deepEqual(later.find(marker => marker.id === "two"), { id: "two", x: 10, y: 80 });

  // Select all also handles dancers without their own recorded arrival at 10.
  await app.click('.dancer-row:nth-child(4) .dancer-select-button');
  await seek(10);
  await app.click("#select-all-button");
  await app.click("#hold-position-button");
  assert.equal(await app.evaluate("document.querySelector('#selection-count').textContent"), "4 selected");
  await app.click("#apply-transition-edit-button");
  expected.dancers[2].keyframes[0].hold = true;
  expected.dancers[2].keyframes[1] = { time: 10, x: 25, y: 80, hold: false };
  expected.dancers[3].keyframes = [
    { time: 0, x: 50, y: 20, hold: true }, { time: 10, x: 50, y: 20, hold: false }, { time: 20, x: 50, y: 70 },
  ];
  assert.deepEqual(await savedProject(), expected);
  await seek(7);
  await app.click("#play-button");
  await app.waitFor("Number(document.querySelector('#time-input').value)>8.2", "Playback did not advance through the replaced transition");
  await assertSelectedPositions(20, 70);
  await app.click("#play-button");
  assert.equal(await app.evaluate("document.querySelector('#audio-player').error"), null);
  await seek(15);
  assert.deepEqual(await positions(), [
    { id: "one", x: 55, y: 55 }, { id: "two", x: 40, y: 55 },
    { id: "three", x: 50, y: 80 }, { id: "four", x: 50, y: 45 },
  ], "Movement must resume toward the unchanged later formations");
  await app.evaluate(`window.roundtripBlob=null;window.originalAnchorClick=HTMLAnchorElement.prototype.click;window.originalCreateUrl=URL.createObjectURL;
    URL.createObjectURL=function(blob){window.roundtripBlob=blob;return window.originalCreateUrl.call(URL,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download.endsWith('.formation'))window.originalAnchorClick.call(this);};`);
  await app.click("#export-package-button");
  await app.waitFor("Boolean(window.roundtripBlob)", "Complete export did not finish");
  const exported = await app.evaluate(`(async()=>{HTMLAnchorElement.prototype.click=window.originalAnchorClick;URL.createObjectURL=window.originalCreateUrl;
    const entries=await window.FormationPackage.readStoredZip(window.roundtripBlob);
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',await entries.get('media/audio.mp3').blob.arrayBuffer()));
    return {project:JSON.parse(await entries.get('choreography.json').blob.text()),mediaHash:[...hash].map(v=>v.toString(16).padStart(2,'0')).join('')};})()`);
  assert.deepEqual(exported.project, expected);
  assert.equal(exported.mediaHash, audioHash);
  await openJson(exported.project);
  assert.deepEqual(await savedProject(), expected, "Reopening must preserve the holds and project format");

  // Outside a recorded arrival, the existing start/end hold workflow remains available.
  await app.click('.dancer-row:nth-child(4) .dancer-select-button');
  await seek(25);
  await app.click("#hold-position-button");
  assert.equal(await app.evaluate("document.querySelector('#transition-edit-bar').classList.contains('is-hidden')"), true);
  await seek(27);
  await app.click("#hold-position-button");
  const normalHold = await savedProject();
  assert.deepEqual(normalHold.dancers[3].keyframes.slice(-2), [
    { time: 25, x: 50, y: 70, hold: true }, { time: 27, x: 50, y: 70, hold: false },
  ]);
  assert.deepEqual(normalHold.dancers.slice(0, 3), expected.dancers.slice(0, 3));
  await app.evaluate("window.beforeReload=true");
  await app.send("Page.reload");
  await app.waitFor("!window.beforeReload && document.readyState==='complete' && document.querySelectorAll('.dancer-marker').length===4", "Autosave did not reload");
  assert.deepEqual(await savedProject(), normalHold);
  assert.deepEqual(app.exceptions, []);
});
