(function attachRecovery(globalScope) {
  "use strict";
  const core = globalScope.ChoreoCore || (typeof require === "function" ? require("./core.js") : null);
  const MAX_VERSIONS = 20;
  const MAX_HISTORY_LENGTH = 750000;

  function readHistory(raw) {
    if (typeof raw !== "string" || raw.length > MAX_HISTORY_LENGTH) return [];
    try {
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries)) return [];
      return entries.filter(entry => entry && typeof entry.id === "string" && entry.id.length <= 80 &&
        typeof entry.savedAt === "string" && Number.isFinite(Date.parse(entry.savedAt)) &&
        typeof entry.label === "string" && entry.label.length <= 80 && core.isValidProjectData(entry.project))
        .slice(-MAX_VERSIONS);
    } catch { return []; }
  }

  function recordVersion(entries, project, label = "Earlier autosave") {
    if (!core.isValidProjectData(project)) return entries;
    const serialized = JSON.stringify(project);
    if (entries.at(-1) && JSON.stringify(entries.at(-1).project) === serialized) return entries;
    const entry = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), label: label.slice(0, 80), project: JSON.parse(serialized) };
    if (JSON.stringify([entry]).length > MAX_HISTORY_LENGTH) return entries;
    const next = [...entries, entry].slice(-MAX_VERSIONS);
    while (JSON.stringify(next).length > MAX_HISTORY_LENGTH) next.shift();
    return next;
  }

  const api = { MAX_VERSIONS, MAX_HISTORY_LENGTH, readHistory, recordVersion };
  globalScope.FormationRecovery = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
