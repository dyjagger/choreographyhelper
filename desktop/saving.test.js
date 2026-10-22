"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { createStoredZip, readStoredZip } = require("../package.js");
const { startDesktop } = require("./test-driver.js");
const electron = "process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

test("saving over an opened project preserves media, real menu Undo respects typing, and lost edits survive restart in recovery", { timeout: process.env.FORMATION_TEST_FULL_PLAYBACK ? 360000 : 180000 }, async t => {
  const app = await startDesktop(t, { inspectMain: true });
  await app.evaluateMain(`${electron}.BrowserWindow.getAllWindows()[0].webContents.setAudioMuted(true)`);
  const saved = async () => {
    await app.waitFor("document.querySelector('#save-status').textContent==='Saved locally'", "Autosave did not finish");
    return app.evaluate("JSON.parse(localStorage.getItem('formation-studio-project-v1'))");
  };
  const menu = label => app.evaluateMain(`(()=>{const items=${electron}.Menu.getApplicationMenu().items.flatMap(item=>item.submenu?.items||[]);
    items.find(item=>item.label===${JSON.stringify(label)}).click();})()`);
  const waitDownload = async () => {
    for (let i=0;i<150;i++) {
      const result=await app.evaluateMain("globalThis.savingTestResult");
      if(result) return result;
      await delay(100);
    }
    assert.fail("The real desktop save did not finish");
  };
  const downloadTo = async (filePath, cancel = false) => {
    await app.evaluateMain(`(()=>{globalThis.savingTestResult=null;
      ${electron}.BrowserWindow.getAllWindows()[0].webContents.session.once('will-download',(_event,item)=>{
        item.once('done',(_event,state)=>{globalThis.savingTestResult=state;});
        item.setSavePath(${JSON.stringify(filePath)});${cancel ? "item.cancel();" : ""}
      });})()`);
    await app.click("#export-package-button");
    return waitDownload();
  };
  const seek = async time => {
    await app.click("#time-input"); await app.type(String(time)); await app.pressKey("Enter", "Enter");
  };
  let originalBytes;
  if (process.env.FORMATION_TEST_USER_PROJECT) originalBytes = await fs.readFile(process.env.FORMATION_TEST_USER_PROJECT);
  else {
    const audio=await fs.readFile(path.join(__dirname,"fixtures/playback.mp3"));
    const video=await fs.readFile(path.join(__dirname,"fixtures/reference.mp4"));
    const project={version:5,projectTitle:"Save regression",duration:45,dancerCounter:18,stageOrientation:"front-top",stageWidth:1.5,stageDepth:1.5,audioVolume:0.9,videoVolume:0.8,
      notes:[{id:"cue",time:5.123456,text:"Keep the opening spacing"}],dancers:Array.from({length:18},(_,index)=>({
        id:`test-${index}`,number:index+1,name:`Dancer ${index+1}`,color:"#7156d9",
        keyframes:[{time:0,x:10+index*4,y:30,hold:true},{time:10.715777,x:10+index*4,y:30,hold:false},{time:30,x:85-index*4,y:65}]}))};
    originalBytes=Buffer.from(await (await createStoredZip([
      {name:"manifest.json",data:JSON.stringify({format:"formation-studio-package",version:1,projectEntry:"choreography.json",createdAt:new Date().toISOString(),media:{
        audio:{entry:"media/audio.mp3",fileName:"playback.mp3",type:"audio/mpeg",size:audio.length},
        video:{entry:"media/video.mp4",fileName:"reference.mp4",type:"video/mp4",size:video.length}}})},
      {name:"choreography.json",data:JSON.stringify(project)},{name:"media/audio.mp3",data:audio},{name:"media/video.mp4",data:video}
    ])).arrayBuffer());
  }
  const originalHash=hash(originalBytes);
  const originalEntries=await readStoredZip(new Blob([originalBytes]));
  const source=JSON.parse(await originalEntries.get("choreography.json").blob.text());
  const filePath=path.join(app.directory,"opened-project.formation");
  await fs.writeFile(filePath,originalBytes);
  await app.selectFile("#import-input",filePath);
  await app.waitFor("document.querySelector('#confirmation-dialog').open","Complete import prompt missing");
  await app.click("#confirmation-accept-button");
  await app.waitFor("!document.querySelector('#import-button').disabled && document.querySelector('#audio-player').readyState>=1","Media did not load");
  assert.deepEqual((await saved()).dancers,source.dancers);
  assert.deepEqual((await saved()).notes,source.notes);
  const expected = await saved();
  await seek(15);
  await app.click("#play-button");
  await app.waitFor("Number(document.querySelector('#time-input').value)>15.25","Initial playback did not advance",15000);
  for(let cycle=0;cycle<2;cycle++) {
    assert.equal(await downloadTo(filePath),"completed");
    await app.waitFor("document.querySelector('#toast').textContent==='Project file saved successfully.'","Save completion was not acknowledged");
    const entries=await readStoredZip(new Blob([await fs.readFile(filePath)]));
    assert.deepEqual(JSON.parse(await entries.get("choreography.json").blob.text()),expected,"Saving changed formations or exact timing");
    for(const [name,entry] of originalEntries) if(name.startsWith("media/")) assert.equal(hash(Buffer.from(await entries.get(name).blob.arrayBuffer())),hash(Buffer.from(await entry.blob.arrayBuffer())));
    if(await app.evaluate("document.querySelector('#play-button').getAttribute('aria-label')==='Pause choreography'")) await app.click("#play-button");
    // Force the decoder to reread the attachment instead of relying on its old buffer.
    await app.evaluate("document.querySelector('#audio-player').load();if(document.querySelector('#video-player').getAttribute('src'))document.querySelector('#video-player').load()");
    await app.waitFor("document.querySelector('#audio-player').readyState>=1","Audio became unreadable after overwriting the opened project",15000);
    await seek(32+cycle*2);
    await app.click("#play-button");
    await app.waitFor(`Number(document.querySelector('#time-input').value)>${32+cycle*2+0.25}`,"Playback failed after saving over the opened file",15000);
    assert.equal(await app.evaluate("document.querySelector('#audio-player').error"),null);
  }
  if(process.env.FORMATION_TEST_FULL_PLAYBACK) {
    await app.click("#play-button");
    await seek(0);await app.click("#play-button");
    await app.waitFor("Number(document.querySelector('#time-input').value)>0.25","Full-track playback did not start",15000);
    assert.equal(await downloadTo(filePath),"completed");
    await app.waitFor(`Number(document.querySelector('#time-input').value)>=${expected.duration-0.05}`,"The supplied audio did not play to the end after saving",(expected.duration+30)*1000);
    assert.equal(await app.evaluate("document.querySelector('#audio-player').error"),null);
    console.log(`Full supplied track completed after overwrite: ${expected.duration} seconds`);
  }
  if(await app.evaluate("document.querySelector('#play-button').getAttribute('aria-label')==='Pause choreography'")) await app.click("#play-button");
  const savedHash=hash(await fs.readFile(filePath));
  assert.equal(await downloadTo(path.join(app.directory,"cancelled.formation"),true),"cancelled");
  await app.waitFor("document.querySelector('#toast').textContent==='File save cancelled.'","Cancelled save was reported as successful");
  assert.equal(hash(await fs.readFile(filePath)),savedHash);
  const blocked=path.join(app.directory,"not-a-directory");await fs.writeFile(blocked,"block");
  assert.equal(await downloadTo(path.join(blocked,"failed.formation")),"interrupted");
  await app.waitFor("document.querySelector('#toast').textContent.startsWith('File save failed.')","Failed save was reported as successful");
  assert.deepEqual(await saved(),expected);

  await app.click("#add-dancer-button");
  const withExtra=await saved();
  for(const selector of ["#project-title",'input[aria-label="Name for dancer 1"]']) {
    await app.click(selector);
    const original=await app.evaluate(`document.querySelector(${JSON.stringify(selector)}).value`);
    await app.type("Draft typing");
    await menu("Undo formation edit");
    await app.waitFor(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(original)}`,"The desktop menu must undo text while typing");
    assert.equal(await app.evaluate("document.querySelectorAll('.dancer-row').length"),withExtra.dancers.length,"Text undo removed a dancer");
    await menu("Redo formation edit");
    await app.waitFor(`document.querySelector(${JSON.stringify(selector)}).value==='Draft typing'`,"Text redo was routed to formation history");
    await menu("Undo formation edit");
    await app.waitFor(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(original)}`,"Text undo must finish before moving focus");
    await app.click("#time-input");
  }
  assert.deepEqual((await saved()).dancers,withExtra.dancers);
  // A genuine formation Undo followed by a new edit clears Redo, but recovery must retain the lost branch.
  await app.click("#undo-button");
  assert.equal((await saved()).dancers.length,source.dancers.length);
  await app.click("#project-title");await app.type("A different branch");await app.click("#time-input");
  assert.equal(await app.evaluate("document.querySelector('#redo-button').disabled"),true);
  const branch=await saved();
  await app.evaluate("window.savingBeforeReload=true");await app.send("Page.reload");
  await app.waitFor("!window.savingBeforeReload && document.readyState==='complete' && !document.querySelector('#recover-autosave-button').disabled","Recovery history did not survive reopening");
  assert.deepEqual(await saved(),branch);
  const audioPath=path.join(app.directory,"retained-audio.mp3");
  await fs.writeFile(audioPath,Buffer.from(await originalEntries.get("media/audio.mp3").blob.arrayBuffer()));
  await app.selectFile("#audio-input",audioPath);
  await app.waitFor("document.querySelector('#audio-player').readyState>=1","Recovery test audio did not load");
  const retainedUrl=await app.evaluate("document.querySelector('#audio-player').src");
  await app.click("#recover-autosave-button");
  const target=await app.evaluate(`(()=>{const entries=JSON.parse(localStorage.getItem('formation-studio-recovery-v1'));
    const entry=entries.find(entry=>entry.project.dancers.length===${withExtra.dancers.length});return entry?.id;})()`);
  assert.ok(target,"The version lost to Undo was not retained");
  await app.evaluate(`document.querySelector('#recovery-version').value=${JSON.stringify(target)}`);
  await app.click("#recovery-cancel-button");
  assert.deepEqual(await saved(),branch);
  await app.click("#recover-autosave-button");
  await app.evaluate(`document.querySelector('#recovery-version').value=${JSON.stringify(target)}`);
  await app.click("#recovery-restore-button");
  assert.deepEqual((await saved()).dancers,withExtra.dancers);
  assert.equal(await app.evaluate("document.querySelector('#audio-player').src"),retainedUrl,"Recovery replaced the loaded media");
  await app.click("#undo-button");
  assert.deepEqual(await saved(),branch,"Recovery must itself be undoable");
  // Even under storage pressure, recovery history must yield space to the current autosave.
  await app.evaluate(`window.originalSavingSetItem=Storage.prototype.setItem;window.injectSavingQuota=true;
    Storage.prototype.setItem=function(key,value){if(key==='formation-studio-project-v1'&&window.injectSavingQuota){window.injectSavingQuota=false;throw new DOMException('Quota','QuotaExceededError');}
    return window.originalSavingSetItem.call(this,key,value);};`);
  await app.click("#project-title");await app.type("Latest progress under quota pressure");await app.click("#time-input");
  assert.equal((await saved()).projectTitle,"Latest progress under quota pressure");
  await app.evaluate("Storage.prototype.setItem=window.originalSavingSetItem");
  assert.deepEqual(app.exceptions,[]);
  if(process.env.FORMATION_TEST_USER_PROJECT) assert.equal(hash(await fs.readFile(process.env.FORMATION_TEST_USER_PROJECT)),originalHash,"The supplied original changed");
});
