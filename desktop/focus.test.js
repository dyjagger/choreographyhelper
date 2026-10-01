"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { startDesktop } = require("./test-driver.js");

test("desktop names stay editable across mouse, keyboard, redraws, history, and confirmations", { timeout: 60000 }, async t => {
  const app = await startDesktop(t);
  const title = "#project-title";
  const first = 'input[aria-label="Name for dancer 1"]';
  const second = 'input[aria-label="Name for dancer 2"]';
  const assertFocused = async selector => {
    const state = await app.evaluate(`(()=>{const field=document.querySelector(${JSON.stringify(selector)});
      return {focused:document.activeElement===field,disabled:field.disabled,active:document.activeElement.outerHTML.slice(0,200),documentFocused:document.hasFocus()};})()`);
    assert.equal(state.focused, true, `${selector}: ${JSON.stringify(state)}`);
    assert.equal(state.disabled, false);
  };
  await app.click("#add-dancer-button");
  await app.click(title);
  await assertFocused(title);
  await app.type("Untitled dancer first");
  await app.click(first);
  await assertFocused(first);
  await app.type("Maya first edit");
  await app.click(title);
  await assertFocused(title);
  await app.click("#add-dancer-button");
  await app.click(first);
  await assertFocused(first);
  await app.type("Maya second edit");
  await app.click(second);
  await assertFocused(second);
  await app.type("Alex");
  await app.click("#new-dancer-name");
  await assertFocused("#new-dancer-name");
  await app.type("New dancer typed");
  await app.click(title);
  await assertFocused(title);
  await app.click(first);
  await app.type("Keyboard edit");
  await app.pressKey("Tab", "Tab");
  await assertFocused('.dancer-row:first-child .remove-dancer');
  await app.pressKey("Tab", "Tab", 8);
  await assertFocused(first);
  await app.type("Escape should discard");
  await app.pressKey("Escape", "Escape");
  assert.equal(await app.evaluate(`document.querySelector(${JSON.stringify(first)}).value`), "Keyboard edit");
  await app.click(first);
  await app.type("Enter edit");
  await app.pressKey("Enter", "Enter");
  await app.click(second);
  await assertFocused(second);

  // App shortcuts must remain normal characters in every naming field.
  for (const selector of [title, first, "#new-dancer-name"]) {
    await app.click(selector);
    await app.type("");
    const before = await app.evaluate("[document.querySelector('#timeline-zoom-level').textContent,document.querySelector('#hold-position-button').getAttribute('aria-pressed'),document.querySelector('#stage').dataset.tool]");
    for (const [key, code] of [["h", "KeyH"], ["a", "KeyA"], [" ", "Space"], ["=", "Equal"], ["-", "Minus"]]) {
      await app.pressKey(key, code);
    }
    await assertFocused(selector);
    assert.equal(await app.evaluate(`document.querySelector(${JSON.stringify(selector)}).value`), "ha =-");
    assert.equal(await app.evaluate("document.querySelector('#play-button').getAttribute('aria-label')"), "Play choreography");
    assert.deepEqual(await app.evaluate("[document.querySelector('#timeline-zoom-level').textContent,document.querySelector('#hold-position-button').getAttribute('aria-pressed'),document.querySelector('#stage').dataset.tool]"), before);
  }
  await app.click("#play-button");
  await app.click(first);
  await app.type("Draft during playback");
  await app.evaluate(`window.focusField=document.querySelector(${JSON.stringify(first)}); window.savedCaret=window.focusField.selectionStart`);
  await app.waitFor("Number(document.querySelector('#time-input').value) > 0.5", "Playback did not advance");
  await assertFocused(first);
  assert.equal(await app.evaluate("window.focusField===document.querySelector('input[aria-label=\"Name for dancer 1\"]') && window.focusField.value==='Draft during playback' && window.focusField.selectionStart===window.savedCaret"), true);
  await app.click("#play-button");
  await app.click("#front-top-button");
  await app.click(second);
  await assertFocused(second);
  await app.click("#front-bottom-button");
  await app.click(title);
  await assertFocused(title);

  // JSON import replaces dancer objects, while the input and its handlers remain.
  await app.click("#new-dancer-name");
  await app.waitFor("document.querySelector('#save-status').textContent==='Saved locally'", "Names did not autosave");
  const project = await app.evaluate("JSON.parse(localStorage.getItem('formation-studio-project-v1'))");
  project.projectTitle = "Imported focus test";
  project.dancers[0].name = "Imported dancer";
  const projectPath = path.join(app.directory, "focus.json");
  await fs.writeFile(projectPath, JSON.stringify(project));
  await app.selectFile("#import-input", projectPath);
  await app.waitFor("document.querySelector('#confirmation-dialog').open", "Import confirmation missing");
  await app.click("#confirmation-cancel-button");
  await app.waitFor("!document.querySelector('#import-button').disabled", "Cancelled import did not finish");
  assert.equal(await app.evaluate("document.querySelector('#project-title').value"), "ha =-");
  await app.selectFile("#import-input", projectPath);
  await app.waitFor("document.querySelector('#confirmation-dialog').open", "Second import confirmation missing");
  await app.click("#confirmation-accept-button");
  await app.waitFor("document.querySelector('#project-title').value==='Imported focus test'", "Import did not finish");
  assert.equal(await app.evaluate(`window.focusField===document.querySelector(${JSON.stringify(first)})`), true);
  await app.click(first);
  await app.type("Discard imported draft");
  await app.pressKey("Escape", "Escape");
  assert.equal(await app.evaluate(`document.querySelector(${JSON.stringify(first)}).value`), "Imported dancer");
  await app.click("#undo-button");
  await app.click(first);
  await app.type("Discard undo draft");
  await app.pressKey("Escape", "Escape");
  assert.equal(await app.evaluate(`document.querySelector(${JSON.stringify(first)}).value`), "Draft during playback");
  await app.click("#redo-button");
  await app.click(first);
  await assertFocused(first);

  await app.click('.dancer-row:first-child .remove-dancer');
  await app.waitFor("document.querySelector('#confirmation-dialog').open", "Remove confirmation missing");
  await app.pressKey("Escape", "Escape");
  await app.waitFor("!document.querySelector('#confirmation-dialog').open", "Escape did not cancel removal");
  assert.equal(await app.evaluate("document.querySelectorAll('.dancer-row').length"), 2);
  await app.click(first);
  await assertFocused(first);
  await app.click('.dancer-row:first-child .remove-dancer');
  await app.click("#confirmation-accept-button");
  await app.waitFor("document.querySelectorAll('.dancer-row').length===1", "Confirmed removal failed");
  await app.click(second);
  await assertFocused(second);

  await app.click("#new-project-button");
  await assertFocused("#confirmation-cancel-button");
  await app.pressKey(" ", "Space");
  await app.waitFor("!document.querySelector('#confirmation-dialog').open", "Space should activate the focused Cancel button");
  assert.equal(await app.evaluate("document.querySelector('#play-button').getAttribute('aria-label')"), "Play choreography");
  assert.equal(await app.evaluate("document.querySelectorAll('.dancer-row').length"), 1);
  await app.click(title);
  await assertFocused(title);
  await app.click("#new-project-button");
  await app.click("#confirmation-accept-button");
  await app.waitFor("document.querySelectorAll('.dancer-row').length === 0", "New project did not clear dancers");
  await app.click("#add-dancer-button");
  await app.click(title);
  await assertFocused(title);
  await app.type("After new project");
  await app.click(first);
  await assertFocused(first);
  // Applying/cancelling previews must release the intentional edit locks.
  const assertNamesUnlocked = async () => {
    for (const selector of [title, first, "#new-dancer-name"]) {
      await app.click(selector);
      await assertFocused(selector);
    }
  };
  for (const finish of ["cancel", "apply"]) {
    await app.click("#stage-size-button");
    await app.click("#stage-width-input");
    await app.type("2");
    await app.click(`#${finish}-stage-size-button`);
    await assertNamesUnlocked();
  }
  for (const finish of ["cancel", "apply"]) {
    await app.click(".keyframe-jump");
    await app.click("#x-input");
    await app.type("70");
    await app.click("#record-coordinates-button");
    await app.click(`#${finish}-transition-edit-button`);
    await assertNamesUnlocked();
  }
  await app.click("#hold-position-button");
  for (const finish of ["cancel", "apply"]) {
    await app.click(".is-hold-start .keyframe-jump");
    await app.click("#hold-end-input");
    await app.type("4");
    await app.click(`#${finish}-hold-edit-button`);
    await assertNamesUnlocked();
  }

  // Exercise the remaining confirmation path using only the temporary profile.
  await app.click(title);
  await app.click("#new-dancer-name");
  await app.waitFor("document.querySelector('#save-status').textContent==='Saved locally'", "Preview edits did not save");
  // The outgoing page saves on exit, so install the fixture in the next document.
  const { identifier } = await app.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "localStorage.setItem('formation-studio-project-v1','invalid stored plan')",
  });
  await app.send("Page.reload");
  await app.waitFor("document.readyState==='complete' && !document.querySelector('#replace-local-save-button').classList.contains('is-hidden')", "Unreadable save recovery did not appear");
  await app.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  await app.click("#add-dancer-button");
  await app.click(title);
  await app.type("Recovery project");
  await app.click("#replace-local-save-button");
  await app.click("#confirmation-cancel-button");
  await app.click(first);
  await assertFocused(first);
  await app.click("#replace-local-save-button");
  await app.click("#confirmation-accept-button");
  await app.waitFor("document.querySelector('#replace-local-save-button').classList.contains('is-hidden')", "Stored plan replacement did not finish");
  await assertNamesUnlocked();
  assert.equal(await app.evaluate("JSON.parse(localStorage.getItem('formation-studio-project-v1')).projectTitle"), "Recovery project");
  assert.deepEqual(app.dialogs, [], "Confirmations should stay in the editor, avoiding native window focus problems");
  assert.deepEqual(app.exceptions, []);
});
