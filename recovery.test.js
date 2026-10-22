"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readHistory, recordVersion, MAX_VERSIONS, MAX_HISTORY_LENGTH } = require("./recovery.js");
const project = { version: 5, projectTitle: "Recovery", duration: 60, stageWidth: 1, stageDepth: 1, dancers: [], notes: [{id:"cue",time:5.123456,text:"Cue"}] };

test("recovery preserves complete independent versions through undo and a new edit", () => {
  const first = recordVersion([], project, "Before edit");
  const edited = { ...project, projectTitle: "New progress", stageWidth: 1.5, stageDepth: 2 };
  const second = recordVersion(first, edited);
  const undone = recordVersion(second, project, "Undo");
  const next = recordVersion(undone, { ...project, projectTitle: "Different branch" });
  assert.deepEqual(readHistory(JSON.stringify(next)).map(entry => entry.project), [project, edited, project, {...project,projectTitle:"Different branch"}]);
  edited.projectTitle = "Changed outside history";
  assert.equal(next[1].project.projectTitle, "New progress");
  assert.equal(first.length, 1);
  assert.equal(next[0].project.notes[0].time, 5.123456);
});

test("unchanged saves do not fill recovery history and the newest 20 distinct versions survive", () => {
  let entries = recordVersion([], project);
  assert.equal(recordVersion(entries, project), entries);
  for (let i=0;i<35;i++) entries=recordVersion(entries,{...project,projectTitle:`Version ${i}`});
  assert.equal(entries.length, MAX_VERSIONS);
  assert.equal(entries[0].project.projectTitle, "Version 15");
  assert.equal(entries.at(-1).project.projectTitle, "Version 34");
});

test("corrupt history and invalid projects cannot be restored", () => {
  const valid = recordVersion([], project)[0];
  for (const raw of [null,"broken",'{}',JSON.stringify([{...valid,project:{dancers:null}}]),JSON.stringify([{...valid,savedAt:"invalid"}]),"x".repeat(MAX_HISTORY_LENGTH+1)]) assert.deepEqual(readHistory(raw), []);
  assert.deepEqual(readHistory(JSON.stringify([null,valid,{...valid,project:null}])), [valid]);
  assert.deepEqual(recordVersion([], {dancers:null}), []);
});

test("recovery storage stays bounded while retaining the latest version", () => {
  let entries=[];
  for(let i=0;i<30;i++) entries=recordVersion(entries,{...project,projectTitle:`Large ${i}`,notes:Array.from({length:100},(_,id)=>({id:String(id),time:id/2,text:"x".repeat(1800)}))});
  assert.ok(JSON.stringify(entries).length<=MAX_HISTORY_LENGTH);
  assert.equal(entries.at(-1).project.projectTitle,"Large 29");
  assert.ok(entries.length<MAX_VERSIONS);
});
