(function attachChoreoCore(globalScope) {
  "use strict";

  const POSITION_EPSILON = 0.0001;
  const TIME_EPSILON = 0.015;
  const DEFAULT_HISTORY_LIMIT = 50;
  const MAX_DANCER_COUNTER = 1000000;
  const MAX_DANCER_ID_LENGTH = 160;
  const MAX_TOTAL_KEYFRAMES = 50000;
  const STAGE_ORIENTATION_FRONT_BOTTOM = "front-bottom";
  const STAGE_ORIENTATION_FRONT_TOP = "front-top";
  const DEFAULT_STAGE_BOUNDS = Object.freeze({ minX: 2.5, maxX: 97.5, minY: 4, maxY: 96 });

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value)));
  }

  function roundCoordinate(value) {
    return Math.round(clamp(value, 0, 100) * 1000) / 1000;
  }

  function normalizeStageOrientation(value) {
    return value === STAGE_ORIENTATION_FRONT_TOP
      ? STAGE_ORIENTATION_FRONT_TOP
      : STAGE_ORIENTATION_FRONT_BOTTOM;
  }

  function stageToDisplayPosition(position, orientation = STAGE_ORIENTATION_FRONT_BOTTOM) {
    const normalizedOrientation = normalizeStageOrientation(orientation);
    const x = roundCoordinate(position?.x);
    const y = roundCoordinate(position?.y);
    return {
      x,
      y: normalizedOrientation === STAGE_ORIENTATION_FRONT_TOP ? roundCoordinate(100 - y) : y,
    };
  }

  function displayToStagePosition(position, orientation = STAGE_ORIENTATION_FRONT_BOTTOM) {
    return stageToDisplayPosition(position, orientation);
  }

  function normalizeStageBounds(bounds = DEFAULT_STAGE_BOUNDS) {
    const minX = clamp(bounds?.minX ?? DEFAULT_STAGE_BOUNDS.minX, 0, 100);
    const maxX = clamp(bounds?.maxX ?? DEFAULT_STAGE_BOUNDS.maxX, minX, 100);
    const minY = clamp(bounds?.minY ?? DEFAULT_STAGE_BOUNDS.minY, 0, 100);
    const maxY = clamp(bounds?.maxY ?? DEFAULT_STAGE_BOUNDS.maxY, minY, 100);
    return { minX, maxX, minY, maxY };
  }

  function clampGroupDelta(positions, requestedDelta, bounds = DEFAULT_STAGE_BOUNDS) {
    const safePositions = (Array.isArray(positions) ? positions : [])
      .filter((position) => Number.isFinite(Number(position?.x)) && Number.isFinite(Number(position?.y)))
      .map((position) => ({ x: Number(position.x), y: Number(position.y) }));
    const requestedX = Number(requestedDelta?.x) || 0;
    const requestedY = Number(requestedDelta?.y) || 0;
    if (safePositions.length === 0) return { x: 0, y: 0 };

    const normalizedBounds = normalizeStageBounds(bounds);
    const minimumX = Math.min(...safePositions.map((position) => position.x));
    const maximumX = Math.max(...safePositions.map((position) => position.x));
    const minimumY = Math.min(...safePositions.map((position) => position.y));
    const maximumY = Math.max(...safePositions.map((position) => position.y));

    return {
      x: clamp(requestedX, normalizedBounds.minX - minimumX, normalizedBounds.maxX - maximumX),
      y: clamp(requestedY, normalizedBounds.minY - minimumY, normalizedBounds.maxY - maximumY),
    };
  }

  function applyGroupDelta(positions, requestedDelta, bounds = DEFAULT_STAGE_BOUNDS) {
    const safePositions = Array.isArray(positions) ? positions : [];
    const delta = clampGroupDelta(safePositions, requestedDelta, bounds);
    return safePositions.map((position) => ({
      x: roundCoordinate(Number(position.x) + delta.x),
      y: roundCoordinate(Number(position.y) + delta.y),
    }));
  }

  function getPolylineSegments(points) {
    const safePoints = (Array.isArray(points) ? points : [])
      .filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)))
      .map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    const segments = [];
    let totalLength = 0;
    for (let index = 1; index < safePoints.length; index += 1) {
      const start = safePoints[index - 1];
      const end = safePoints[index];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length <= POSITION_EPSILON) continue;
      segments.push({ start, end, length, offset: totalLength });
      totalLength += length;
    }
    return { segments, totalLength };
  }

  function getPolylineLength(points) {
    return getPolylineSegments(points).totalLength;
  }

  function distanceFromPointToSegment(point, start, end) {
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (lengthSquared <= POSITION_EPSILON) return Math.hypot(point.x - start.x, point.y - start.y);
    const progress = clamp(
      ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared,
      0,
      1,
    );
    return Math.hypot(point.x - (start.x + segmentX * progress), point.y - (start.y + segmentY * progress));
  }

  function prepareFormationPath(points, options = {}) {
    const safePoints = (Array.isArray(points) ? points : [])
      .filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)))
      .map((point) => ({ x: roundCoordinate(point.x), y: roundCoordinate(point.y) }));
    if (safePoints.length < 2 || getPolylineLength(safePoints) <= POSITION_EPSILON) return [];

    const straightThreshold = options.straightThreshold === undefined
      ? 2
      : Math.max(0, Number(options.straightThreshold) || 0);
    const start = safePoints[0];
    const end = safePoints[safePoints.length - 1];
    const maximumDeviation = Math.max(...safePoints.map((point) => distanceFromPointToSegment(point, start, end)));
    if (maximumDeviation <= straightThreshold) return [start, end];

    const passes = clamp(Math.floor(Number(options.smoothingPasses) || 2), 0, 3);
    let smoothed = safePoints;
    for (let pass = 0; pass < passes; pass += 1) {
      const next = [smoothed[0]];
      for (let index = 1; index < smoothed.length; index += 1) {
        const left = smoothed[index - 1];
        const right = smoothed[index];
        next.push(
          {
            x: roundCoordinate(left.x * 0.75 + right.x * 0.25),
            y: roundCoordinate(left.y * 0.75 + right.y * 0.25),
          },
          {
            x: roundCoordinate(left.x * 0.25 + right.x * 0.75),
            y: roundCoordinate(left.y * 0.25 + right.y * 0.75),
          },
        );
      }
      next.push(smoothed[smoothed.length - 1]);
      smoothed = next;
    }
    return smoothed;
  }

  function projectPointOntoPolyline(point, points) {
    const { segments, totalLength } = getPolylineSegments(points);
    if (segments.length === 0) return { distanceAlong: 0, distance: Infinity, totalLength: 0 };
    let best = { distanceAlong: 0, distance: Infinity, totalLength };
    segments.forEach((segment) => {
      const segmentX = segment.end.x - segment.start.x;
      const segmentY = segment.end.y - segment.start.y;
      const lengthSquared = segment.length * segment.length;
      const progress = clamp(
        ((point.x - segment.start.x) * segmentX + (point.y - segment.start.y) * segmentY) / lengthSquared,
        0,
        1,
      );
      const projected = {
        x: segment.start.x + segmentX * progress,
        y: segment.start.y + segmentY * progress,
      };
      const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
      if (distance < best.distance) {
        best = { distanceAlong: segment.offset + segment.length * progress, distance, totalLength };
      }
    });
    return best;
  }

  function orderPositionsAlongPath(positions, points) {
    return (Array.isArray(positions) ? positions : [])
      .map((position, index) => ({ index, projection: projectPointOntoPolyline(position, points) }))
      .sort((left, right) => left.projection.distanceAlong - right.projection.distanceAlong || left.index - right.index)
      .map((item) => item.index);
  }

  function samplePolyline(points, count) {
    const sampleCount = Math.max(0, Math.floor(Number(count) || 0));
    if (sampleCount === 0) return [];
    const { segments, totalLength } = getPolylineSegments(points);
    if (segments.length === 0) return [];
    if (sampleCount === 1) {
      const first = segments[0].start;
      return [{ x: roundCoordinate(first.x), y: roundCoordinate(first.y) }];
    }

    return Array.from({ length: sampleCount }, (_, index) => {
      const targetDistance = totalLength * (index / (sampleCount - 1));
      const segment = segments.find((item) => targetDistance <= item.offset + item.length + POSITION_EPSILON)
        || segments[segments.length - 1];
      const progress = clamp((targetDistance - segment.offset) / segment.length, 0, 1);
      return {
        x: roundCoordinate(segment.start.x + (segment.end.x - segment.start.x) * progress),
        y: roundCoordinate(segment.start.y + (segment.end.y - segment.start.y) * progress),
      };
    });
  }

  function normalizeKeyframes(keyframes) {
    return [...keyframes]
      .map((frame) => {
        const normalized = {
          time: Math.max(0, Number(frame.time)),
          x: roundCoordinate(frame.x),
          y: roundCoordinate(frame.y),
        };
        if (typeof frame.hold === "boolean") normalized.hold = frame.hold;
        return normalized;
      })
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

  function getHoldStateFromFrames(frames, targetTime) {
    let event = null;
    for (const frame of frames) {
      if (frame.time > targetTime + TIME_EPSILON) break;
      if (typeof frame.hold === "boolean") event = frame;
    }
    return {
      active: event?.hold === true,
      event,
    };
  }

  function getHoldStateAtTime(keyframes, time) {
    return getHoldStateFromFrames(normalizeKeyframes(keyframes), Math.max(0, Number(time)));
  }

  function getHoldIntervals(keyframes) {
    const intervals = [];
    let activeStart = null;
    normalizeKeyframes(keyframes).forEach((frame) => {
      if (frame.hold === true && !activeStart) {
        activeStart = frame;
      } else if (frame.hold === false && activeStart) {
        intervals.push({ start: activeStart.time, end: frame.time, x: activeStart.x, y: activeStart.y });
        activeStart = null;
      }
    });
    if (activeStart) intervals.push({ start: activeStart.time, end: null, x: activeStart.x, y: activeStart.y });
    return intervals;
  }

  function getPositionAtTime(keyframes, time) {
    const frames = normalizeKeyframes(keyframes);
    if (frames.length === 0) return null;

    const targetTime = Math.max(0, Number(time));
    const holdState = getHoldStateFromFrames(frames, targetTime);
    if (holdState.active) return { x: holdState.event.x, y: holdState.event.y };
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

  function normalizeDancerName(value, fallback = "Dancer", maxLength = 80) {
    const safeLimit = Math.max(1, Math.floor(Number(maxLength) || 80));
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    const normalizedFallback = String(fallback ?? "Dancer").replace(/\s+/g, " ").trim() || "Dancer";
    return (normalized || normalizedFallback).slice(0, safeLimit);
  }

  function getDancerMarkerLabel(name, dancerNumber) {
    const safeNumber = Number.isSafeInteger(Number(dancerNumber)) && Number(dancerNumber) > 0
      ? String(Number(dancerNumber))
      : "?";
    const fallbackName = `Dancer ${safeNumber}`;
    const normalizedName = normalizeDancerName(name, fallbackName);
    if (normalizedName === fallbackName) return safeNumber;
    const characters = Array.from(normalizedName).slice(0, 2);
    return Array.from(`${characters[0].toLocaleUpperCase()}${characters[1] || ""}`).slice(0, 2).join("");
  }

  function normalizeProjectTitle(value, fallback = "Untitled choreography", maxLength = 120) {
    const safeLimit = Math.max(1, Math.floor(Number(maxLength) || 120));
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    const normalizedFallback = String(fallback ?? "Untitled choreography").replace(/\s+/g, " ").trim() || "Untitled choreography";
    return (normalized || normalizedFallback).slice(0, safeLimit);
  }

  function getNextAvailableDancerNumber(dancers, dancerCounter, maximum = MAX_DANCER_COUNTER) {
    const safeMaximum = Math.max(1, Math.floor(Number(maximum) || MAX_DANCER_COUNTER));
    const safeCounter = Math.min(safeMaximum, Math.max(0, Math.floor(Number(dancerCounter) || 0)));
    const usedNumbers = new Set(
      dancers
        .map((dancer) => Number(dancer.number))
        .filter((number) => Number.isSafeInteger(number) && number >= 1 && number <= safeMaximum),
    );

    for (let number = safeCounter + 1; number <= safeMaximum; number += 1) {
      if (!usedNumbers.has(number)) return { number, dancerCounter: number };
    }
    for (let number = 1; number <= safeMaximum; number += 1) {
      if (!usedNumbers.has(number)) return { number, dancerCounter: safeCounter };
    }
    return null;
  }

  function createUniqueLocalDancerId(dancers, dancerNumber) {
    const usedIds = new Set(dancers.map((dancer) => dancer.id));
    const base = `dancer-local-${dancerNumber}`;
    if (!usedIds.has(base)) return base;
    let suffix = 2;
    while (usedIds.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  function createHistory(limit = DEFAULT_HISTORY_LIMIT) {
    const safeLimit = Math.max(1, Math.floor(Number(limit) || DEFAULT_HISTORY_LIMIT));
    return { limit: safeLimit, past: [], future: [] };
  }

  function pushHistory(history, entry) {
    const limit = Math.max(1, Math.floor(Number(history?.limit) || DEFAULT_HISTORY_LIMIT));
    return {
      limit,
      past: [...(history?.past || []), entry].slice(-limit),
      future: [],
    };
  }

  function undoHistory(history, currentEntry) {
    const past = history?.past || [];
    if (past.length === 0) return { history, entry: null };
    const entry = past[past.length - 1];
    const limit = Math.max(1, Math.floor(Number(history?.limit) || DEFAULT_HISTORY_LIMIT));
    return {
      entry,
      history: {
        limit,
        past: past.slice(0, -1),
        future: [currentEntry, ...(history?.future || [])].slice(0, limit),
      },
    };
  }

  function redoHistory(history, currentEntry) {
    const future = history?.future || [];
    if (future.length === 0) return { history, entry: null };
    const entry = future[0];
    const limit = Math.max(1, Math.floor(Number(history?.limit) || DEFAULT_HISTORY_LIMIT));
    return {
      entry,
      history: {
        limit,
        past: [...(history?.past || []), currentEntry].slice(-limit),
        future: future.slice(1),
      },
    };
  }

  function areDocumentSnapshotsEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function shouldPauseAfterPlaybackStartSettles(requestId, currentRequestId, isPlaying, isStartingPlayback) {
    return requestId === currentRequestId || (!isPlaying && !isStartingPlayback);
  }

  function isValidProjectData(candidate, maxDancers = 50) {
    if (!candidate || typeof candidate !== "object") return false;
    if (!Array.isArray(candidate.dancers) || candidate.dancers.length > maxDancers) return false;
    if (candidate.version !== undefined && ![1, 2, 3].includes(Number(candidate.version))) return false;
    if (
      candidate.stageOrientation !== undefined &&
      ![STAGE_ORIENTATION_FRONT_BOTTOM, STAGE_ORIENTATION_FRONT_TOP].includes(candidate.stageOrientation)
    ) {
      return false;
    }
    for (const volumeKey of ["audioVolume", "videoVolume"]) {
      if (
        candidate[volumeKey] !== undefined &&
        (!Number.isFinite(Number(candidate[volumeKey])) || Number(candidate[volumeKey]) < 0 || Number(candidate[volumeKey]) > 1)
      ) return false;
    }
    const duration = Number(candidate.duration);
    if (!Number.isFinite(duration) || duration < 1 || duration > 3600) return false;
    if (
      candidate.dancerCounter !== undefined &&
      (!Number.isSafeInteger(Number(candidate.dancerCounter)) ||
        Number(candidate.dancerCounter) < 0 ||
        Number(candidate.dancerCounter) > MAX_DANCER_COUNTER)
    ) {
      return false;
    }

    const totalKeyframes = candidate.dancers.reduce((total, dancer) => {
      return total + (Array.isArray(dancer?.keyframes) ? dancer.keyframes.length : 0);
    }, 0);
    if (totalKeyframes > MAX_TOTAL_KEYFRAMES) return false;

    const ids = new Set();

    return candidate.dancers.every((dancer) => {
      if (
        !dancer ||
        typeof dancer !== "object" ||
        typeof dancer.id !== "string" ||
        dancer.id.length === 0 ||
        dancer.id.length > MAX_DANCER_ID_LENGTH ||
        ids.has(dancer.id) ||
        (dancer.number !== undefined &&
            (!Number.isSafeInteger(Number(dancer.number)) ||
            Number(dancer.number) < 1 ||
            Number(dancer.number) > MAX_DANCER_COUNTER)) ||
        !Array.isArray(dancer.keyframes) ||
        dancer.keyframes.length === 0 ||
        dancer.keyframes.length > 5000
      ) {
        return false;
      }
      ids.add(dancer.id);

      const validFrames = dancer.keyframes.every((frame) => {
        if (![frame.time, frame.x, frame.y].every((value) => Number.isFinite(Number(value)))) return false;
        if (frame.hold !== undefined && typeof frame.hold !== "boolean") return false;
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
    DEFAULT_HISTORY_LIMIT,
    DEFAULT_STAGE_BOUNDS,
    MAX_DANCER_COUNTER,
    MAX_DANCER_ID_LENGTH,
    MAX_TOTAL_KEYFRAMES,
    TIME_EPSILON,
    STAGE_ORIENTATION_FRONT_BOTTOM,
    STAGE_ORIENTATION_FRONT_TOP,
    applyGroupDelta,
    areDocumentSnapshotsEqual,
    clamp,
    clampGroupDelta,
    createUniqueLocalDancerId,
    createHistory,
    displayToStagePosition,
    formatTime,
    getDancerMarkerLabel,
    getHoldIntervals,
    getHoldStateAtTime,
    getLatestKeyframeTime,
    getPolylineLength,
    getPositionAtTime,
    getNextAvailableDancerNumber,
    hasPointerMoved,
    isValidProjectData,
    normalizeKeyframes,
    normalizeDancerName,
    normalizeStageOrientation,
    normalizeProjectTitle,
    orderPositionsAlongPath,
    prepareFormationPath,
    pushHistory,
    redoHistory,
    samplePolyline,
    shouldPauseAfterPlaybackStartSettles,
    stageToDisplayPosition,
    undoHistory,
    upsertKeyframe,
  };

  globalScope.ChoreoCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
