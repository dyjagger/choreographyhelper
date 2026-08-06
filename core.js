(function attachChoreoCore(globalScope) {
  "use strict";

  const POSITION_EPSILON = 0.0001;
  const TIME_EPSILON = 0.015;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value)));
  }

  function roundCoordinate(value) {
    return Math.round(clamp(value, 0, 100) * 1000) / 1000;
  }

  function normalizeKeyframes(keyframes) {
    return [...keyframes]
      .map((frame) => ({
        time: Math.max(0, Number(frame.time)),
        x: roundCoordinate(frame.x),
        y: roundCoordinate(frame.y),
      }))
      .sort((a, b) => a.time - b.time);
  }

  function upsertKeyframe(keyframes, nextFrame, epsilon = TIME_EPSILON) {
    const normalized = normalizeKeyframes(keyframes);
    const frame = normalizeKeyframes([nextFrame])[0];
    const matchingIndex = normalized.findIndex((item) => Math.abs(item.time - frame.time) <= epsilon);

    if (matchingIndex >= 0) {
      normalized[matchingIndex] = frame;
      return normalizeKeyframes(normalized);
    }

    return normalizeKeyframes([...normalized, frame]);
  }

  function getPositionAtTime(keyframes, time) {
    const frames = normalizeKeyframes(keyframes);
    if (frames.length === 0) return null;

    const targetTime = Math.max(0, Number(time));
    if (targetTime <= frames[0].time) return { x: frames[0].x, y: frames[0].y };
    if (targetTime >= frames[frames.length - 1].time) {
      const last = frames[frames.length - 1];
      return { x: last.x, y: last.y };
    }

    for (let index = 0; index < frames.length - 1; index += 1) {
      const start = frames[index];
      const end = frames[index + 1];
      if (targetTime < start.time - POSITION_EPSILON || targetTime > end.time + POSITION_EPSILON) continue;

      const span = end.time - start.time;
      if (span <= POSITION_EPSILON) return { x: end.x, y: end.y };

      const progress = (targetTime - start.time) / span;
      return {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      };
    }

    const last = frames[frames.length - 1];
    return { x: last.x, y: last.y };
  }

  function getLatestKeyframeTime(dancers) {
    return dancers.reduce((latest, dancer) => {
      return dancer.keyframes.reduce((dancerLatest, frame) => Math.max(dancerLatest, Number(frame.time)), latest);
    }, 0);
  }

  function hasPointerMoved(start, end, threshold = 4) {
    const deltaX = Number(end.x) - Number(start.x);
    const deltaY = Number(end.y) - Number(start.y);
    return Math.hypot(deltaX, deltaY) >= threshold;
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = Math.floor(safeSeconds % 60);
    const hundredths = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 100 + POSITION_EPSILON);
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }

  function isValidProjectData(candidate, maxDancers = 50) {
    if (!candidate || typeof candidate !== "object") return false;
    if (!Array.isArray(candidate.dancers) || candidate.dancers.length > maxDancers) return false;
    const duration = Number(candidate.duration);
    if (!Number.isFinite(duration) || duration < 1 || duration > 3600) return false;

    const ids = new Set();

    return candidate.dancers.every((dancer) => {
      if (
        !dancer ||
        typeof dancer !== "object" ||
        typeof dancer.id !== "string" ||
        dancer.id.length === 0 ||
        ids.has(dancer.id) ||
        !Array.isArray(dancer.keyframes) ||
        dancer.keyframes.length === 0 ||
        dancer.keyframes.length > 5000
      ) {
        return false;
      }
      ids.add(dancer.id);

      const validFrames = dancer.keyframes.every((frame) => {
        if (![frame.time, frame.x, frame.y].every((value) => Number.isFinite(Number(value)))) return false;
        const time = Number(frame.time);
        const x = Number(frame.x);
        const y = Number(frame.y);
        return time >= 0 && time <= duration && x >= 0 && x <= 100 && y >= 0 && y <= 100;
      });
      if (!validFrames) return false;

      const times = dancer.keyframes.map((frame) => Number(frame.time)).sort((a, b) => a - b);
      return times.every((time, index) => index === 0 || time - times[index - 1] > TIME_EPSILON);
    });
  }

  const api = {
    TIME_EPSILON,
    clamp,
    formatTime,
    getLatestKeyframeTime,
    getPositionAtTime,
    hasPointerMoved,
    isValidProjectData,
    normalizeKeyframes,
    upsertKeyframe,
  };

  globalScope.ChoreoCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
