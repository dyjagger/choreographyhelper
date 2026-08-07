"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const ALLOWED_COMMANDS = new Set(["new", "open", "undo", "redo", "export-json", "export-complete"]);

contextBridge.exposeInMainWorld("FormationDesktop", Object.freeze({
  chooseProject: () => ipcRenderer.invoke("desktop:choose-project"),
  onCommand: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("desktop:command", (_event, command) => {
      if (ALLOWED_COMMANDS.has(command)) callback(command);
    });
  },
  onOpenProject: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("desktop:open-project", (_event, descriptor) => callback(descriptor));
  },
}));
