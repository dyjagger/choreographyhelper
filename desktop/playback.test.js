"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

function createWav(seconds = 45) {
  const sampleRate = 8000;
  const bytes = sampleRate * seconds * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write("RIFF");
  wav.writeUInt32LE(36 + bytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(bytes, 40);
  for (let sample = 0; sample < bytes / 2; sample++) {
    wav.writeInt16LE(Math.round(Math.sin(sample * 2 * Math.PI * 440 / sampleRate) * 500), 44 + sample * 2);
  }
  return wav;
}

test("desktop playback survives flips, errors, retry, cancellation and media replacement", { timeout: 120000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "formation-playback-test-"));
  const wavPath = path.join(directory, "playback.wav");
  const mp3Path = path.join(__dirname, "fixtures", "playback.mp3");
  const replacementMp3Path = path.join(__dirname, "fixtures", "replacement.mp3");
  const videoPath = path.join(__dirname, "fixtures", "reference.mp4");
  await fs.writeFile(wavPath, createWav());
  const portServer = net.createServer();
  await new Promise(resolve => portServer.listen(0, "127.0.0.1", resolve));
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  const child = spawn(require("electron"), [
    path.resolve(__dirname, ".."),
    ...(process.platform === "win32" ? [] : ["--headless", "--no-sandbox", "--disable-gpu"]),
    `--user-data-dir=${path.join(directory, "profile")}`, `--remote-debugging-port=${port}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  let exit;
  child.stdout.on("data", chunk => { log += chunk; });
  child.stderr.on("data", chunk => { log += chunk; });
  child.on("exit", (code, signal) => { exit = { code, signal }; });
  child.on("error", error => { log += error.stack; });
  let ws;
  t.after(async () => {
    ws?.close();
    if (!exit) {
      const stopped = new Promise(resolve => child.once("exit", resolve));
      child.kill();
      await Promise.race([stopped, delay(5000)]);
    }
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  let target;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(exit, undefined, `Electron exited: ${JSON.stringify(exit)}\n${log}`);
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
      target = targets.find(item => item.type === "page" && item.url.startsWith("formation://app/"));
      if (target) break;
    } catch {}
    await delay(100);
  }
  assert.ok(target, `Desktop app did not open\n${log}`);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const requests = new Map();
  const exceptions = [];
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = requests.get(message.id);
      requests.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (["Runtime.exceptionThrown", "Inspector.targetCrashed"].includes(message.method)) {
      exceptions.push(message);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    requests.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression, message) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      assert.equal(exit, undefined, log);
      await delay(50);
    }
    assert.fail(message);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const loadAudio = async (filePath) => {
    const { root } = await send("DOM.getDocument");
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "#audio-input" });
    await send("DOM.setFileInputFiles", { nodeId, files: [filePath] });
    await waitFor("document.querySelector('#audio-player').duration >= 45 && document.querySelector('#audio-player').duration < 46", "Audio metadata did not load");
  };
  const loadWav = () => loadAudio(wavPath);
  const status = () => evaluate(`({name:document.querySelector('#audio-name').textContent,
    hidden:document.querySelector('#audio-details').classList.contains('is-hidden'),
    label:document.querySelector('#play-button').ariaLabel,
    time:document.querySelector('#audio-player').currentTime,
    paused:document.querySelector('#audio-player').paused,
    error:document.querySelector('#audio-player').error?.code || null})`);
  const failAudio = () => evaluate(`new Promise(resolve => {
    const player = document.querySelector('#audio-player');
    const badUrl = URL.createObjectURL(new Blob(['invalid audio'], {type:'audio/mpeg'}));
    player.addEventListener('error', () => { URL.revokeObjectURL(badUrl); resolve(player.error?.code); }, {once:true});
    player.src = badUrl;
    player.load();
  })`);
  await send("Runtime.enable");
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('#play-button')) && Boolean(window.ChoreoCore)", "UI did not load");
  await loadAudio(mp3Path);
  await evaluate(`document.querySelector('#new-dancer-name').value='Playback regression';
    document.querySelector('#add-dancer-form').requestSubmit();
    window.originalSource=document.querySelector('#audio-player').src;
    window.unexpectedMediaErrors=0;
    document.querySelector('#audio-player').addEventListener('error', () => window.unexpectedMediaErrors++);
    for(let i=0;i<100;i++) document.querySelector(i%2?'#front-bottom-button':'#front-top-button').click();`);
  await click("#play-button");
  await waitFor("document.querySelector('#play-button').ariaLabel === 'Pause choreography'", "Playback did not start");
  // Cover the reported 2–10 second window and keep flipping during playback.
  for (let interval = 0; interval < 7; interval++) {
    await delay(5000);
    const result = await status();
    assert.equal(result.paused, false);
    assert.equal(result.error, null);
    assert.equal(result.name, "playback.mp3");
    assert.ok(result.time >= (interval + 1) * 5 - 1, JSON.stringify(result));
    await evaluate(`for(let i=0;i<10;i++) document.querySelector(i%2?'#front-bottom-button':'#front-top-button').click()`);
  }
  assert.equal(await evaluate("document.querySelector('#audio-player').src === window.originalSource && window.unexpectedMediaErrors === 0"), true);
  await click("#play-button");
  await evaluate("document.querySelector('#audio-player').dispatchEvent(new Event('error'))");
  assert.equal((await status()).name, "playback.mp3", "A stale error must not clear audio");

  await click("#play-button");
  await waitFor("!document.querySelector('#audio-player').paused", "Resume did not start");
  assert.ok(await failAudio(), "A real decoder error should have been raised");
  const failed = await status();
  assert.equal(failed.name, "playback.mp3", "Playback errors must preserve the attachment");
  assert.equal(failed.hidden, false);
  assert.equal(failed.label, "Play choreography");
  assert.ok(await evaluate("document.querySelector('#audio-duration').textContent.includes('file kept')"));

  // Inspect the actual complete export to prove that the original media bytes survive.
  await evaluate(`window.exportedProject=null;window.savedAnchorClick=HTMLAnchorElement.prototype.click;
    window.savedCreateObjectURL=URL.createObjectURL;
    URL.createObjectURL=function(blob){window.exportedProject=blob;return window.savedCreateObjectURL.call(URL,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download.endsWith('.formation'))window.savedAnchorClick.call(this);};`);
  await click("#export-package-button");
  await waitFor("Boolean(window.exportedProject)", "Complete export did not include retained media");
  const exported = await evaluate(`(async()=>{const entries=await window.FormationPackage.readStoredZip(await window.exportedProject);
    const manifest=JSON.parse(await entries.get('manifest.json').blob.text());
    HTMLAnchorElement.prototype.click=window.savedAnchorClick;
    URL.createObjectURL=window.savedCreateObjectURL;
    return {name:manifest.media.audio?.fileName, bytes:entries.get(manifest.media.audio.entry).size};})()`);
  assert.equal(exported.name, "playback.mp3");
  assert.equal(exported.bytes, (await fs.stat(mp3Path)).size);
  await evaluate("document.querySelector('#play-button').click();document.querySelector('#audio-player').dispatchEvent(new Event('error'))");
  await waitFor("!document.querySelector('#audio-player').error && !document.querySelector('#audio-player').paused", "Play did not recover retained audio");
  assert.ok((await status()).time >= 34, "Retry should retain the playhead");
  await delay(1000);
  await click("#play-button");

  await failAudio();
  await evaluate("document.querySelector('#play-button').click();document.querySelector('#play-button').click()");
  await delay(300);
  assert.equal((await status()).paused, true, "Cancelling a reload must not start audio later");
  assert.equal((await status()).label, "Play choreography");
  await evaluate("for(let i=0;i<20;i++)document.querySelector('#play-button').click()");
  await delay(300);
  assert.equal((await status()).paused, true, "Rapid play/pause must settle paused");
  await failAudio();
  await click("#play-button");
  await loadWav();
  await delay(300);
  assert.equal((await status()).paused, true, "Replacement must cancel an older playback request");
  await click("#restart-button");
  await click("#play-button");
  await waitFor("!document.querySelector('#audio-player').paused", "Replacement audio could not play");
  await delay(1500);
  await evaluate(`document.querySelector('#timeline').value=44.6;document.querySelector('#timeline').dispatchEvent(new Event('input'));`);
  await waitFor("document.querySelector('#play-button').ariaLabel === 'Play choreography'", "Playback must stop cleanly at the media end");
  await click("#restart-button");
  await click("#play-button");
  await waitFor("!document.querySelector('#audio-player').paused", "Playback could not restart after the media end");
  await click("#remove-audio-button");
  assert.equal((await status()).name, "");
  assert.equal((await status()).hidden, true);
  await click("#play-button");
  await waitFor("document.querySelector('#play-button').ariaLabel === 'Pause choreography'", "Choreography must still play without media");
  await delay(200);
  await click("#play-button");
  await evaluate(`const input=document.querySelector('#audio-input');const transfer=new DataTransfer();
    transfer.items.add(new File(['invalid audio'],'unreadable.wav',{type:'audio/wav'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change'));`);
  await waitFor("Boolean(document.querySelector('#audio-player').error)", "Unreadable file did not report an error");
  assert.equal((await status()).name, "unreadable.wav");
  await click("#play-button");
  await waitFor("Boolean(document.querySelector('#audio-player').error) && document.querySelector('#play-button').ariaLabel === 'Play choreography'", "Unreadable media retry must settle cleanly");
  assert.equal((await status()).name, "unreadable.wav");
  await loadWav();
  assert.equal((await status()).name, "playback.wav");
  assert.equal((await status()).error, null);
  await evaluate(`document.querySelector('#timeline').value=20;document.querySelector('#timeline').dispatchEvent(new Event('input'));
    document.querySelector('#x-input').value=60;document.querySelector('#y-input').value=60;
    document.querySelector('#record-coordinates-button').click();`);

  const { root } = await send("DOM.getDocument");
  const { nodeId: videoInput } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "#video-input" });
  await send("DOM.setFileInputFiles", { nodeId: videoInput, files: [videoPath] });
  await waitFor("document.querySelector('#video-player').duration === 3", "Video metadata did not load");
  await click("#restart-button");
  await click("#play-button");
  await waitFor("!document.querySelector('#audio-player').paused && !document.querySelector('#video-player').paused", "Audio and video did not start together");
  await delay(1000);
  await evaluate(`for(let i=0;i<50;i++)document.querySelector(i%2?'#front-bottom-button':'#front-top-button').click()`);
  await evaluate(`new Promise(resolve=>{const player=document.querySelector('#video-player');
    const badUrl=URL.createObjectURL(new Blob(['invalid video'],{type:'video/mp4'}));
    player.addEventListener('error',()=>{URL.revokeObjectURL(badUrl);resolve();},{once:true});player.src=badUrl;player.load();})`);
  assert.equal(await evaluate("document.querySelector('#video-name').textContent"), "reference.mp4");
  assert.equal((await status()).name, "playback.wav");
  assert.equal((await status()).paused, true, "A video error must pause synchronized audio safely");
  assert.equal((await status()).label, "Play choreography");
  await click("#play-button");
  await waitFor("!document.querySelector('#video-player').error && !document.querySelector('#video-player').paused && !document.querySelector('#audio-player').paused", "Retained video did not recover with the audio");
  await delay(500);
  await click("#play-button");

  await evaluate(`window.exportedProject=null;window.savedAnchorClick=HTMLAnchorElement.prototype.click;
    window.savedCreateObjectURL=URL.createObjectURL;
    URL.createObjectURL=function(blob){window.exportedProject=blob;return window.savedCreateObjectURL.call(URL,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download.endsWith('.formation'))window.savedAnchorClick.call(this);};`);
  await click("#export-package-button");
  await waitFor("Boolean(window.exportedProject)", "Combined-media export did not finish");
  assert.equal(await evaluate(`(async()=>{window.completeImportBlob=window.exportedProject;
    HTMLAnchorElement.prototype.click=window.savedAnchorClick;URL.createObjectURL=window.savedCreateObjectURL;
    const entries=await window.FormationPackage.readStoredZip(window.completeImportBlob);
    const project=JSON.parse(await entries.get('choreography.json').blob.text());
    return project.dancers.some(d=>d.keyframes.some(frame=>frame.time===20));})()`), true);
  for (let attempt = 0; attempt < 3; attempt++) {
    // Delay only the audio source assignment to deterministically make the shorter
    // reference video finish metadata first, as it did in a real saved project.
    await evaluate(`(()=>{window.confirm=()=>true;window.metadataOrder=[];
      const audio=document.querySelector('#audio-player'),video=document.querySelector('#video-player');
      const source=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');
      Object.defineProperty(audio,'src',{configurable:true,get(){return source.get.call(this);},
        set(value){setTimeout(()=>source.set.call(this,value),200);}});
      audio.addEventListener('loadedmetadata',()=>window.metadataOrder.push('audio'),{once:true});
      video.addEventListener('loadedmetadata',()=>window.metadataOrder.push('video'),{once:true});
      const input=document.querySelector('#import-input'),transfer=new DataTransfer();
      transfer.items.add(new File([window.completeImportBlob],'playback.formation',{type:'application/zip'}));
      input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);
    await waitFor("!document.querySelector('#import-button').disabled && document.querySelector('#audio-player').duration === 45 && document.querySelector('#video-player').duration === 3", "Import must keep both media files when video metadata arrives first");
    await evaluate("delete document.querySelector('#audio-player').src");
    assert.deepEqual(await evaluate("window.metadataOrder"), ["video", "audio"]);
    assert.equal((await status()).name, "playback.wav");
    assert.equal(await evaluate("document.querySelector('#video-name').textContent"), "reference.mp4");
  }
  await click("#play-button");
  await waitFor("!document.querySelector('#video-player').paused && !document.querySelector('#audio-player').paused", "Imported project media did not play together");
  await delay(500);
  await click("#play-button");
  await click("#remove-video-button");
  assert.equal(await evaluate("document.querySelector('#video-name').textContent"), "");
  await loadAudio(replacementMp3Path);
  await evaluate(`for(let i=0;i<100;i++)document.querySelector(i%2?'#front-bottom-button':'#front-top-button').click()`);
  await click("#play-button");
  await waitFor("!document.querySelector('#audio-player').paused", "The second MP3 format did not start");
  await delay(12000);
  assert.equal((await status()).paused, false);
  assert.equal((await status()).error, null);
  assert.equal((await status()).name, "replacement.mp3");
  assert.ok((await status()).time >= 11);
  await click("#play-button");
  assert.deepEqual(exceptions, [], "No renderer exceptions or crashes should occur");
  assert.equal(exit, undefined, log);
});
