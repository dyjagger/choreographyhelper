"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

async function startDesktop(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "formation-input-test-"));
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const child = spawn(require("electron"), [
    options.appPath || path.resolve(__dirname, ".."),
    ...(process.platform === "win32" ? [] : ["--headless", "--no-sandbox", "--disable-gpu"]),
    `--user-data-dir=${path.join(directory, "profile")}`, `--remote-debugging-port=${port}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  let exit;
  let ws;
  child.stdout.on("data", chunk => { log += chunk; });
  child.stderr.on("data", chunk => { log += chunk; });
  child.on("exit", (code, signal) => { exit = { code, signal }; });
  child.on("error", error => { log += error.stack; });
  t.after(async () => {
    ws?.close();
    if (!exit) {
      const stopped = new Promise(resolve => child.once("exit", resolve));
      child.kill();
      await Promise.race([stopped, delay(5000)]);
      if (!exit) {
        child.kill("SIGKILL");
        await Promise.race([stopped, delay(5000)]);
      }
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
  let dialogResponse = true;
  const requests = new Map();
  const exceptions = [];
  const dialogs = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => {
      requests.delete(requestId);
      reject(new Error(`Timed out waiting for ${method}`));
    }, 15000);
    requests.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = requests.get(message.id);
      if (!request) return;
      requests.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (["Runtime.exceptionThrown", "Inspector.targetCrashed"].includes(message.method)) {
      exceptions.push(message);
    } else if (message.method === "Page.javascriptDialogOpening") {
      dialogs.push(message.params);
      send("Page.handleJavaScriptDialog", { accept: dialogResponse }).catch(error => exceptions.push(error.message));
    }
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression, message) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if (await evaluate(expression)) return;
      } catch (error) {
        // A reload can replace the execution context between polling requests.
        // Retry that transition only; application errors and crashes still fail.
        if (!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context with specified id/.test(error.message)) throw error;
      }
      assert.equal(exit, undefined, log);
      await delay(50);
    }
    assert.fail(message);
  };
  const click = async (selector, modifiers = 0) => {
    const point = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});
      if(!element)throw Error('Missing click target');element.scrollIntoView({block:'center',inline:'nearest'});
      const r=element.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, modifiers });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, modifiers, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, modifiers, button: "left", buttons: 0, clickCount: 1 });
  };
  const pressKey = async (key, code, modifiers = 0) => {
    const virtualKey = { Tab: 9, Enter: 13, Escape: 27, Space: 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Equal: 187, Minus: 189 }[code]
      || (code.startsWith("Key") ? code.charCodeAt(3) : 0);
    // Native Enter activation needs its character event as well as keyDown.
    const text = !(modifiers & 7) ? (code === "Enter" ? "\r" : key.length === 1 ? key : undefined) : undefined;
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, modifiers, windowsVirtualKeyCode: virtualKey, text });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers, windowsVirtualKeyCode: virtualKey });
  };
  const type = async text => {
    await pressKey("a", "KeyA", 2);
    await send("Input.insertText", { text });
  };
  const selectFile = async (selector, filePath) => {
    const { root } = await send("DOM.getDocument");
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
    assert.ok(nodeId, `Missing file input ${selector}`);
    await send("DOM.setFileInputFiles", { nodeId, files: [filePath] });
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await waitFor("document.readyState === 'complete' && Boolean(window.ChoreoCore)", "Editor did not load");
  await send("Page.bringToFront");
  return { directory, send, evaluate, waitFor, click, pressKey, type, selectFile, exceptions, dialogs,
    setDialogResponse(value) { dialogResponse = value; } };
}

module.exports = { startDesktop };
