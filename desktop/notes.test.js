"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { startDesktop } = require("./test-driver.js");

test("timeline notes anchor exactly, wrap without overlap, survive history and media roundtrips, and protect typing", { timeout: 120000 }, async t => {
  const app = await startDesktop(t);
  const saved = async () => {
    await app.waitFor("document.querySelector('#save-status').textContent==='Saved locally'", "Project did not save");
    return app.evaluate("JSON.parse(localStorage.getItem('formation-studio-project-v1'))");
  };
  const clickLine = async fraction => {
    const point = await app.evaluate(`(()=>{const line=document.querySelector('#note-add-line');line.scrollIntoView({block:'center'});
      const rect=line.getBoundingClientRect();return {x:Math.round(rect.left+rect.width*${fraction}),y:Math.round(rect.top+14),left:rect.left,width:rect.width,
        start:Number(document.querySelector('#timeline').min),end:Number(document.querySelector('#timeline').max)};})()`);
    clickLine.expectedTime = Math.round((point.start + (point.x - point.left) / point.width * (point.end - point.start)) * 1000000) / 1000000;
    const coordinates = { x: point.x, y: point.y };
    await app.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...coordinates });
    await app.send("Input.dispatchMouseEvent", { type: "mousePressed", ...coordinates, button: "left", buttons: 1, clickCount: 1 });
    await app.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...coordinates, button: "left", buttons: 0, clickCount: 1 });
    await app.waitFor("document.querySelector('#note-dialog').open", "Clicking the dashed line did not open the note editor");
    return app.evaluate("Number(document.querySelector('#note-time-input').value)");
  };
  const saveNote = async text => {
    await app.click("#note-text-input");
    await app.type(text);
    await app.click("#note-save-button");
    await app.waitFor("!document.querySelector('#note-dialog').open", "Note did not save");
    return saved();
  };
  const seek = async time => {
    await app.click("#time-input");
    await app.type(String(time));
    await app.pressKey("Enter", "Enter");
  };
  const assertLayout = async () => {
    const layout = await app.evaluate(`(()=>{const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
      return {track:rect(document.querySelector('#note-track')),line:rect(document.querySelector('#note-add-line')),
        cards:[...document.querySelectorAll('.timeline-note-card')].map(element=>({...rect(element),scroll:element.scrollWidth,width:element.clientWidth})),
        markers:[...document.querySelectorAll('.timeline-note-marker')].filter(element=>element.getClientRects().length).map(element=>({...rect(element),time:Number(element.dataset.noteTime)})),
        anchors:[...document.querySelectorAll('.note-connector')].map(element=>({...rect(element),time:Number(element.dataset.noteTime)})),
        start:Number(document.querySelector('#timeline').min),end:Number(document.querySelector('#timeline').max)};})()`);
    for (const rectangles of [layout.cards, layout.markers]) {
      for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
        const a = rectangles[i], b = rectangles[j];
        assert.ok(a.right <= b.left + 0.1 || b.right <= a.left + 0.1 || a.bottom <= b.top + 0.1 || b.bottom <= a.top + 0.1, "Nearby notes overlap");
      }
    }
    for (const card of layout.cards) {
      assert.ok(card.left >= layout.track.left - 0.1 && card.right <= layout.track.right + 0.1, "Note text extends beyond the timeline");
      assert.ok(card.scroll <= card.width + 1, "Long note text does not wrap");
    }
    for (const marker of layout.markers) {
      const expectedX = layout.line.left + (marker.time - layout.start) / (layout.end - layout.start) * (layout.line.right - layout.line.left);
      assert.ok(Math.abs((marker.left + marker.right) / 2 - expectedX) < 0.1, "A note marker moved away from its timestamp");
    }
    for (const anchor of layout.anchors) {
      const expectedX = layout.line.left + (anchor.time - layout.start) / (layout.end - layout.start) * (layout.line.right - layout.line.left);
      assert.ok(Math.abs(anchor.left - expectedX) < 0.1, "A visible note moved away from its timestamp");
    }
  };
  assert.equal(await app.evaluate("document.querySelector('#notes-always-visible').checked"), true);
  assert.equal(await clickLine(0.25), clickLine.expectedTime);
  await app.click("#note-time-input");
  await app.type("15");
  await app.click("#note-text-input");
  await app.type("Opening cue");
  const beforeShortcuts = await app.evaluate("[document.querySelector('#timeline-zoom-level').textContent,document.querySelector('#play-button').getAttribute('aria-label')]");
  for (const [key, code] of [[" ", "Space"], ["h", "KeyH"], ["a", "KeyA"], ["=", "Equal"], ["-", "Minus"]]) await app.pressKey(key, code);
  assert.equal(await app.evaluate("document.querySelector('#note-text-input').value"), "Opening cue ha=-");
  assert.deepEqual(await app.evaluate("[document.querySelector('#timeline-zoom-level').textContent,document.querySelector('#play-button').getAttribute('aria-label')]"), beforeShortcuts);
  const initialText = "Opening cue\n<b>This is literal text</b>";
  let project = await saveNote(initialText);
  assert.equal(project.notes.length, 1);
  assert.equal(project.notes[0].time, 15);
  assert.equal(await app.evaluate("document.querySelector('.note-card-text').textContent"), initialText);
  assert.equal(await app.evaluate("document.querySelector('.note-card-text b')"), null);
  const firstNoteId = project.notes[0].id;
  await app.click("#notes-always-visible");
  assert.equal((await saved()).notesAlwaysVisible, false);
  assert.equal(await app.evaluate("document.querySelectorAll('.timeline-note-card').length"), 0);
  assert.equal(await app.evaluate("document.querySelectorAll('.timeline-note-marker').length"), 1);
  await app.click("#undo-button");
  assert.equal(await app.evaluate("document.querySelector('#notes-always-visible').checked"), true);
  await app.click("#redo-button");
  assert.equal(await app.evaluate("document.querySelector('#notes-always-visible').checked"), false);
  await app.click("#notes-always-visible");
  await clickLine(0.6);
  await app.type("Cancelled text");
  await app.click("#note-cancel-button");
  assert.equal((await saved()).notes.length, 1);
  await clickLine(0.6);
  await app.type("  \n ");
  await app.click("#note-save-button");
  assert.equal(await app.evaluate("document.querySelector('#note-dialog').open && document.querySelector('#note-text-input').validity.customError"), true);
  await app.click("#note-cancel-button");

  await seek(0);
  await app.click("#add-dancer-button");
  await seek(5.123456);
  await app.click("#x-input");
  await app.type("65");
  await app.click("#record-coordinates-button");
  const formations = (await saved()).dancers;
  await app.click('.keyframe-chip[data-keyframe-time="5.123456"] .keyframe-jump');
  assert.equal(await clickLine(0.8), 5.123456, "A selected formation time must override the clicked location exactly");
  await saveNote("Exact formation cue");
  assert.equal(await app.evaluate("document.querySelector('#note-use-clicked-time').classList.contains('is-hidden')"), false);
  await app.click("#note-use-clicked-time");
  assert.equal(await clickLine(0.7), clickLine.expectedTime);
  await app.click("#note-time-input");
  await app.type("42");
  await saveNote("Free-placement cue");
  for (const time of [15, 15.02, 15.1, 15.2]) {
    await clickLine(0.25);
    await app.click("#note-time-input");
    await app.type(String(time));
    await saveNote(`Cue at ${time}: ` + "Keep the spacing even and watch the next formation. ".repeat(3) + "LongWord".repeat(20));
  }
  assert.equal((await saved()).notes.length, 7);
  await assertLayout();
  const screenshot = async name => {
    if (!process.env.FORMATION_TEST_SCREENSHOT_DIR) return;
    await app.evaluate("document.querySelector('.timeline-notes').scrollIntoView({block:'start'})");
    const result = await app.send("Page.captureScreenshot", { format: "png" });
    await fs.mkdir(process.env.FORMATION_TEST_SCREENSHOT_DIR, { recursive: true });
    await fs.writeFile(path.join(process.env.FORMATION_TEST_SCREENSHOT_DIR, name), Buffer.from(result.data, "base64"));
  };
  await screenshot("notes-wide.png");
  await app.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await app.waitFor("document.querySelector('#note-track').clientWidth<390", "Notes did not resize for a narrow screen");
  await app.waitFor("[...document.querySelectorAll('.timeline-note-card')].every(card=>card.offsetLeft+card.offsetWidth<=document.querySelector('#note-track').clientWidth+1)", "Notes did not reflow");
  await assertLayout();
  await screenshot("notes-narrow.png");
  await app.click("#notes-always-visible");
  await assertLayout();
  assert.equal(await app.evaluate("document.querySelectorAll('.timeline-note-card').length"), 0);
  await app.click("#notes-always-visible");
  await app.send("Emulation.clearDeviceMetricsOverride");
  await seek(15);
  await app.click("#timeline-zoom-in-button");
  await app.click("#timeline-zoom-in-button");
  const viewport = await app.evaluate("({start:Number(document.querySelector('#timeline').min),end:Number(document.querySelector('#timeline').max)})");
  const clicked = await clickLine(0.55);
  assert.equal(clicked, clickLine.expectedTime);
  assert.ok(clicked > viewport.start && clicked < viewport.end);
  await saveNote("Zoom anchored note");
  await assertLayout();
  await app.click('.keyframe-chip[data-keyframe-time="5.123456"] .keyframe-jump');
  assert.equal(await clickLine(0.9), 5.123456, "Formation anchoring must stay exact while zoomed");
  await app.click("#note-cancel-button");
  await app.click("#note-use-clicked-time");
  await app.click("#timeline-fit-button");
  await app.click(`.timeline-note-card[data-note-id="${firstNoteId}"]`);
  await app.click("#note-time-input");
  await app.type("30");
  await saveNote("Edited cue");
  project = await saved();
  assert.deepEqual(project.notes.find(note => note.id === firstNoteId), { id: firstNoteId, time: 30, text: "Edited cue" });
  await app.click(`.timeline-note-card[data-note-id="${firstNoteId}"]`);
  await app.click("#note-delete-button");
  assert.equal((await saved()).notes.length, 7);
  await app.click("#undo-button");
  assert.deepEqual(await saved(), project);
  await app.click("#redo-button");
  assert.equal((await saved()).notes.length, 7);
  await app.click("#undo-button");
  await app.click("#theme-toggle");
  await assertLayout();
  await app.click('.keyframe-chip[data-keyframe-time="5.123456"] .keyframe-jump');
  await app.click("#edit-keyframe-button");
  assert.equal(await app.evaluate("document.querySelector('#note-add-line').disabled && document.querySelector('#notes-always-visible').disabled && [...document.querySelectorAll('.timeline-note-marker')].every(marker=>marker.disabled)"), true);
  await app.click("#cancel-transition-edit-button");

  await app.selectFile("#audio-input", path.join(__dirname, "fixtures", "playback.mp3"));
  await app.selectFile("#video-input", path.join(__dirname, "fixtures", "reference.mp4"));
  await app.waitFor("document.querySelector('#audio-player').duration===45 && document.querySelector('#video-player').duration===3", "Media did not load");
  await app.click("#notes-always-visible");
  const exportedProject = await saved();
  assert.deepEqual(exportedProject.dancers, formations, "Notes must not edit dancer formations");
  await app.evaluate(`window.notesBlob=null;window.originalAnchorClick=HTMLAnchorElement.prototype.click;window.originalCreateUrl=URL.createObjectURL;
    URL.createObjectURL=function(blob){window.notesBlob=blob;return window.originalCreateUrl.call(URL,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download.endsWith('.formation'))window.originalAnchorClick.call(this);};`);
  await app.click("#export-package-button");
  await app.waitFor("Boolean(window.notesBlob)", "Complete export did not finish");
  const exported = await app.evaluate(`(async()=>{HTMLAnchorElement.prototype.click=window.originalAnchorClick;URL.createObjectURL=window.originalCreateUrl;
    const entries=await window.FormationPackage.readStoredZip(window.notesBlob);const hash=async blob=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const bytes=new Uint8Array(await window.notesBlob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return {project:JSON.parse(await entries.get('choreography.json').blob.text()),audioHash:await hash(entries.get('media/audio.mp3').blob),videoHash:await hash(entries.get('media/video.mp4').blob),base64:btoa(binary)};})()`);
  assert.deepEqual(exported.project, exportedProject);
  for (const [file, field] of [["playback.mp3", "audioHash"], ["reference.mp4", "videoHash"]]) {
    assert.equal(exported[field], createHash("sha256").update(await fs.readFile(path.join(__dirname, "fixtures", file))).digest("hex"));
  }
  const completePath = path.join(app.directory, "notes.formation");
  await fs.writeFile(completePath, Buffer.from(exported.base64, "base64"));
  await app.selectFile("#import-input", completePath);
  await app.waitFor("document.querySelector('#confirmation-dialog').open", "Complete project import did not open");
  await app.click("#confirmation-accept-button");
  await app.waitFor("!document.querySelector('#import-button').disabled && document.querySelector('#audio-player').readyState>=1 && document.querySelector('#video-player').readyState>=1", "Complete project did not load");
  assert.deepEqual(await saved(), exportedProject);
  assert.equal(await app.evaluate("document.querySelectorAll('.timeline-note-card').length"), 0);
  await app.evaluate("window.beforeReload=true");
  await app.send("Page.reload");
  await app.waitFor("!window.beforeReload && document.readyState==='complete' && document.querySelectorAll('.timeline-note-marker').length===8", "Notes did not reopen from autosave");
  assert.deepEqual(await saved(), exportedProject);
  await app.evaluate(`window.noteJsonBlob=null;window.originalAnchorClick=HTMLAnchorElement.prototype.click;window.originalCreateUrl=URL.createObjectURL;
    URL.createObjectURL=function(blob){window.noteJsonBlob=blob;return window.originalCreateUrl.call(URL,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download.endsWith('.json'))window.originalAnchorClick.call(this);};`);
  await app.click("#export-button");
  const exportedJson = await app.evaluate(`(async()=>{HTMLAnchorElement.prototype.click=window.originalAnchorClick;URL.createObjectURL=window.originalCreateUrl;
    return JSON.parse(await window.noteJsonBlob.text());})()`);
  assert.deepEqual(exportedJson, exportedProject);
  const jsonPath = path.join(app.directory, "notes.json");
  await fs.writeFile(jsonPath, JSON.stringify(exportedJson));
  await app.selectFile("#import-input", jsonPath);
  await app.waitFor("document.querySelector('#confirmation-dialog').open", "Note JSON import did not open");
  await app.click("#confirmation-accept-button");
  await app.waitFor("!document.querySelector('#import-button').disabled", "Note JSON import did not finish");
  assert.deepEqual(await saved(), exportedProject);
  await app.click("#duration-input");
  await app.type("10");
  await app.pressKey("Tab", "Tab");
  assert.equal(await app.evaluate("Number(document.querySelector('#duration-input').value)"), 45, "Shortening the timeline must not hide later notes");
  await app.click("#new-project-button");
  await app.click("#confirmation-accept-button");
  await app.waitFor("document.querySelectorAll('.timeline-note-marker').length===0", "New project did not clear notes");
  assert.equal(await app.evaluate("document.querySelector('#notes-always-visible').checked"), true);
  assert.equal(await clickLine(58 / 60), clickLine.expectedTime);
  await app.click("#note-time-input");
  await app.type("58");
  await saveNote("Cue after audio");
  await app.waitFor("document.activeElement===document.querySelector('#note-add-line')", "Closing the note editor must return focus to the note line");
  await app.pressKey("Enter", "Enter");
  await app.waitFor("document.querySelector('#note-dialog').open", "The note line must support keyboard activation");
  assert.equal(await app.evaluate("Number(document.querySelector('#note-time-input').value)"), 58);
  await app.click("#note-cancel-button");
  await app.selectFile("#audio-input", path.join(__dirname, "fixtures", "playback.mp3"));
  await app.waitFor("document.querySelector('#audio-player').readyState>=1 && document.querySelector('#audio-name').textContent==='playback.mp3'", "An annotation must not remove newly loaded audio");
  assert.equal((await saved()).duration, 58);
  assert.equal(await app.evaluate("document.querySelector('#audio-player').error"), null);
  await assertLayout();
  assert.deepEqual(app.exceptions, []);
});
