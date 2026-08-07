"use strict";

const { app, BrowserWindow, dialog, ipcMain, Menu, protocol } = require("electron");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");

const APP_ORIGIN = "formation://app";
const APP_URL = `${APP_ORIGIN}/index.html`;
const MAX_PROJECT_BYTES = 1024 * 1024 * 1024;
const STATIC_ROOT = path.resolve(__dirname, "..");
const STATIC_FILES = new Map([
  ["index.html", "text/html; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
  ["theme.js", "text/javascript; charset=utf-8"],
  ["core.js", "text/javascript; charset=utf-8"],
  ["package.js", "text/javascript; charset=utf-8"],
  ["app.js", "text/javascript; charset=utf-8"],
]);
const pendingFiles = new Map();
let mainWindow = null;
let pendingProjectPath = null;

protocol.registerSchemesAsPrivileged([{
  scheme: "formation",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: false,
    stream: true,
  },
}]);
app.enableSandbox();

function getProjectPathFromArgs(args) {
  return args
    .map((argument) => path.resolve(String(argument)))
    .find((candidate) => /\.(formation|json)$/i.test(candidate) && fs.existsSync(candidate)) || null;
}

function getProjectMimeType(filePath) {
  return /\.formation$/i.test(filePath) ? "application/zip" : "application/json";
}

async function createOpenDescriptor(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!/\.(formation|json)$/i.test(resolvedPath)) throw new Error("Unsupported project type");
  const stats = await fs.promises.stat(resolvedPath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_PROJECT_BYTES) throw new Error("Project file is too large");
  const token = randomUUID();
  const descriptor = {
    path: resolvedPath,
    name: path.basename(resolvedPath),
    type: getProjectMimeType(resolvedPath),
    size: stats.size,
  };
  pendingFiles.set(token, descriptor);
  setTimeout(() => pendingFiles.delete(token), 2 * 60 * 1000).unref();
  return {
    url: `${APP_ORIGIN}/__open/${token}`,
    name: descriptor.name,
    type: descriptor.type,
    size: descriptor.size,
  };
}

function streamFileResponse(filePath, type, size) {
  const stream = Readable.toWeb(fs.createReadStream(filePath));
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(size),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function handleAppProtocol(request) {
  const url = new URL(request.url);
  if (url.hostname !== "app") return new Response("Not found", { status: 404 });
  const requestedPath = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (requestedPath.startsWith("__open/")) {
    const token = requestedPath.slice("__open/".length);
    const descriptor = pendingFiles.get(token);
    pendingFiles.delete(token);
    if (!descriptor) return new Response("Project link expired", { status: 404 });
    return streamFileResponse(descriptor.path, descriptor.type, descriptor.size);
  }
  const type = STATIC_FILES.get(requestedPath);
  if (!type) return new Response("Not found", { status: 404 });
  const body = await fs.promises.readFile(path.join(STATIC_ROOT, requestedPath));
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isTrustedSender(event) {
  return event.senderFrame?.url?.startsWith(`${APP_ORIGIN}/`) === true;
}

function sendCommand(command) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:command", command);
}

async function sendProjectPath(filePath) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const descriptor = await createOpenDescriptor(filePath);
    mainWindow.webContents.send("desktop:open-project", descriptor);
  } catch (error) {
    dialog.showErrorBox("Could not open project", "Formation Studio could not safely open that project file.");
  }
}

function createApplicationMenu() {
  const template = [
    {
      label: "&File",
      submenu: [
        { label: "New project", accelerator: "CmdOrCtrl+N", click: () => sendCommand("new") },
        { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => sendCommand("open") },
        { type: "separator" },
        { label: "Save complete project…", accelerator: "CmdOrCtrl+S", click: () => sendCommand("export-complete") },
        { label: "Export JSON…", accelerator: "CmdOrCtrl+Shift+S", click: () => sendCommand("export-json") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "&Edit",
      submenu: [
        { label: "Undo formation edit", accelerator: "CmdOrCtrl+Z", click: () => sendCommand("undo") },
        { label: "Redo formation edit", accelerator: "CmdOrCtrl+Shift+Z", click: () => sendCommand("redo") },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "&View",
      submenu: [
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "reload" }, { role: "toggleDevTools" }]),
      ],
    },
    {
      label: "&Help",
      submenu: [{
        label: "About Formation Studio",
        click: () => dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Formation Studio",
          message: "Formation Studio",
          detail: `Version ${app.getVersion()}\nLocal-first choreography planning for Windows and the web.`,
        }),
      }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function configureWindowSecurity(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== APP_URL) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.on("will-download", (_event, item) => {
    const fileName = item.getFilename();
    const isCompleteProject = /\.formation$/i.test(fileName);
    item.setSaveDialogOptions({
      title: isCompleteProject ? "Save complete Formation Studio project" : "Export Formation Studio plan",
      defaultPath: fileName,
      filters: isCompleteProject
        ? [{ name: "Formation Studio project", extensions: ["formation"] }]
        : [{ name: "Formation Studio JSON", extensions: ["json"] }],
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: "#11121a",
    title: "Formation Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      devTools: !app.isPackaged,
    },
  });
  configureWindowSecurity(mainWindow);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.once("did-finish-load", () => {
    if (pendingProjectPath) {
      const filePath = pendingProjectPath;
      pendingProjectPath = null;
      sendProjectPath(filePath);
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(APP_URL);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else {
  pendingProjectPath = getProjectPathFromArgs(process.argv);
  app.on("second-instance", (_event, argv) => {
    const projectPath = getProjectPathFromArgs(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (projectPath) sendProjectPath(projectPath);
    } else if (projectPath) {
      pendingProjectPath = projectPath;
    }
  });

  app.whenReady().then(async () => {
    protocol.handle("formation", handleAppProtocol);
    ipcMain.handle("desktop:choose-project", async (event) => {
      if (!isTrustedSender(event)) throw new Error("Untrusted desktop request");
      const owner = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(owner, {
        title: "Open Formation Studio project",
        properties: ["openFile"],
        filters: [
          { name: "Formation Studio projects", extensions: ["formation", "json"] },
          { name: "Complete project", extensions: ["formation"] },
          { name: "JSON plan", extensions: ["json"] },
        ],
      });
      if (result.canceled || result.filePaths.length !== 1) return null;
      return createOpenDescriptor(result.filePaths[0]);
    });
    createApplicationMenu();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
