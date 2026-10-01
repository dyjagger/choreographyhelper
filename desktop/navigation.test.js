"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { startDesktop } = require("./test-driver.js");

test("timeline dots and recorded times seek the whole formation without opening an edit", { timeout: 60000 }, async t => {
  const app = await startDesktop(t);
  await app.click("#add-dancer-button");
  await app.click("#add-dancer-button");
  await app.waitFor("document.querySelector('#save-status').textContent==='Saved locally'", "Project did not save");
  const project = await app.evaluate("JSON.parse(localStorage.getItem('formation-studio-project-v1'))");
  const frames = [
    { time: 0, x: 10, y: 20 },
    { time: 5, x: 40, y: 50 },
    { time: 8.375, x: 60, y: 63 },
    { time: 12, x: 80, y: 75 },
    { time: 18, x: 80, y: 75, hold: true },
    { time: 24, x: 80, y: 75, hold: false },
    { time: 30, x: 20, y: 35 },
  ];
  project.dancers[0].keyframes = frames;
  project.dancers[1].keyframes = [{ time: 0, x: 90, y: 80 }, { time: 30, x: 30, y: 20 }];
  const projectPath = path.join(app.directory, "timeline.json");
  await fs.writeFile(projectPath, JSON.stringify(project));
  await app.selectFile("#import-input", projectPath);
  await app.waitFor("document.querySelector('#confirmation-dialog').open", "Import confirmation missing");
  await app.click("#confirmation-accept-button");
  await app.waitFor("!document.querySelector('#import-button').disabled", "Project import did not finish");
  await app.click('.dancer-row:first-child .dancer-select-button');
  await app.selectFile("#audio-input", path.join(__dirname, "fixtures", "playback.mp3"));
  await app.waitFor("document.querySelector('#audio-player').duration===45", "Audio metadata did not load");
  await app.selectFile("#video-input", path.join(__dirname, "fixtures", "reference.mp4"));
  await app.waitFor("document.querySelector('#video-player').duration===3", "Video metadata did not load");
  const selector = (kind, time) => kind === "dot"
    ? `.keyframe-dot[data-keyframe-time="${time}"]`
    : `.keyframe-chip[data-keyframe-time="${time}"] .keyframe-jump`;
  const assertAt = async (time, flipped = false) => {
    const view = await app.evaluate(`(()=>{const markers=[...document.querySelectorAll('.dancer-marker')];return {
      time:Number(document.querySelector('#time-input').value),timeline:Number(document.querySelector('#timeline').value),
      titleDisabled:document.querySelector('#project-title').disabled,
      namesDisabled:[...document.querySelectorAll('.dancer-name-inline')].some(input=>input.disabled),
      editing:!document.querySelector('#transition-edit-bar').classList.contains('is-hidden') || !document.querySelector('#hold-edit-bar').classList.contains('is-hidden'),
      positions:markers.map(marker=>({id:marker.dataset.dancerId,x:parseFloat(marker.style.left),y:parseFloat(marker.style.top)})),
      activeDot:document.querySelector('.keyframe-dot[aria-current="true"]')?.dataset.keyframeTime,
      activeLabel:document.querySelector('.keyframe-jump[aria-current="true"]')?.parentElement.dataset.keyframeTime,
      audioTime:document.querySelector('#audio-player').currentTime,
      videoTime:document.querySelector('#video-player').currentTime};})()`);
    assert.equal(view.time, time);
    assert.equal(view.timeline, time);
    assert.equal(view.audioTime, time);
    assert.equal(view.videoTime, Math.min(time, 3));
    assert.equal(view.titleDisabled, false, "Seeking must keep project names editable");
    assert.equal(view.namesDisabled, false, "Seeking must keep dancer names editable");
    assert.equal(view.editing, false, "A navigation click should not start an edit transaction");
    const frame = frames.find(frame => frame.time === time);
    const expected = [{ x: frame.x, y: frame.y }, { x: 90 - 2 * time, y: 80 - 2 * time }];
    for (let i = 0; i < project.dancers.length; i++) {
      const marker = view.positions.find(position => position.id === project.dancers[i].id);
      assert.ok(Math.abs(marker.x - (flipped ? 100 - expected[i].x : expected[i].x)) < 0.001);
      assert.ok(Math.abs(marker.y - (flipped ? 100 - expected[i].y : expected[i].y)) < 0.001);
    }
    assert.equal(Number(view.activeDot), time);
    assert.equal(Number(view.activeLabel), time);
  };
  for (const kind of ["dot", "label"]) {
    for (const time of [5, 8.375, 12, 18, 24, 30, 0]) {
      await app.click(selector(kind, time));
      await assertAt(time);
    }
  }
  await app.click('input[aria-label="Name for dancer 1"]');
  await app.type("Named before navigation");
  await app.click(selector("dot", 12));
  await assertAt(12);
  await app.click('input[aria-label="Name for dancer 1"]');
  await app.type("Renamed before time label");
  await app.click(selector("label", 5));
  await assertAt(5);
  await app.click("#front-top-button");
  await app.click(selector("dot", 12));
  await assertAt(12, true);
  await app.click("#front-bottom-button");
  await app.click("#play-button");
  await app.waitFor("document.querySelector('#play-button').getAttribute('aria-label')==='Pause choreography'", "Playback did not start");
  await app.click(selector("label", 5));
  await assertAt(5);
  assert.equal(await app.evaluate("document.querySelector('#play-button').getAttribute('aria-label')"), "Play choreography");

  // A label outside the zoomed viewport brings its dot into view at the exact time.
  for (let i = 0; i < 4; i++) await app.click("#timeline-zoom-in-button");
  await app.click(selector("label", 30));
  await assertAt(30);
  assert.equal(await app.evaluate(`document.activeElement===document.querySelector(${JSON.stringify(selector("label", 30))})`), true);
  await app.pressKey("Enter", "Enter");
  await assertAt(30);

  await app.click("#edit-keyframe-button");
  await app.waitFor("!document.querySelector('#transition-edit-bar').classList.contains('is-hidden')", "Explicit transition editing did not open");
  await app.click("#x-input");
  await app.type("45");
  await app.click("#record-coordinates-button");
  await app.click(selector("label", 5));
  assert.equal(await app.evaluate("Number(document.querySelector('#time-input').value)"), 30, "Navigation must protect an unapplied position edit");
  await app.click("#cancel-transition-edit-button");
  await app.click("#timeline-fit-button");
  await app.click(selector("label", 18));
  await assertAt(18);
  await app.click("#edit-keyframe-button");
  await app.waitFor("!document.querySelector('#hold-edit-bar').classList.contains('is-hidden')", "Explicit hold editing did not open");
  await app.click("#cancel-hold-edit-button");
  await app.click(selector("dot", 24));
  await assertAt(24);
  await app.click("#edit-keyframe-button");
  await app.waitFor("document.activeElement.id==='hold-end-input'", "Editing Resume should focus its time input");
  await app.click("#cancel-hold-edit-button");
  assert.deepEqual(app.exceptions, []);
});
