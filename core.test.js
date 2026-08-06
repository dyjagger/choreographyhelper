"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatTime,
  getLatestKeyframeTime,
  getPositionAtTime,
  hasPointerMoved,
  isValidProjectData,
  normalizeKeyframes,
  upsertKeyframe,
} = require("./core.js");

test("position is held before the first and after the last keyframe", () => {
  const frames = [
    { time: 10, x: 20, y: 30 },
    { time: 12, x: 80, y: 70 },
  ];

  assert.deepEqual(getPositionAtTime(frames, 0), { x: 20, y: 30 });
  assert.deepEqual(getPositionAtTime(frames, 20), { x: 80, y: 70 });
});

test("position interpolates linearly between keyframes", () => {
  const frames = [
    { time: 10, x: 20, y: 30 },
    { time: 12, x: 80, y: 70 },
  ];

  assert.deepEqual(getPositionAtTime(frames, 11), { x: 50, y: 50 });
  assert.deepEqual(getPositionAtTime(frames, 10.5), { x: 35, y: 40 });
});

test("dropping at an existing time replaces rather than duplicates the keyframe", () => {
  const result = upsertKeyframe(
    [{ time: 10, x: 20, y: 30 }],
    { time: 10.009, x: 65, y: 75 },
  );

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { time: 10.009, x: 65, y: 75 });
});

test("keyframes are sorted and coordinates are clamped to the stage", () => {
  assert.deepEqual(
    normalizeKeyframes([
      { time: 8, x: 120, y: -5 },
      { time: 2, x: 40, y: 50 },
    ]),
    [
      { time: 2, x: 40, y: 50 },
      { time: 8, x: 100, y: 0 },
    ],
  );
});

test("latest keyframe time is found across dancers", () => {
  const dancers = [
    { keyframes: [{ time: 3, x: 0, y: 0 }] },
    { keyframes: [{ time: 12.5, x: 0, y: 0 }, { time: 6, x: 0, y: 0 }] },
  ];
  assert.equal(getLatestKeyframeTime(dancers), 12.5);
});

test("time formatting includes minutes, seconds, and hundredths", () => {
  assert.equal(formatTime(0), "00:00.00");
  assert.equal(formatTime(72.349), "01:12.34");
});

test("project validation enforces duration, keyframes, and dancer limit", () => {
  const project = {
    duration: 60,
    dancers: [{ id: "dancer-1", keyframes: [{ time: 0, x: 50, y: 50 }] }],
  };
  assert.equal(isValidProjectData(project), true);
  assert.equal(isValidProjectData({ duration: 0, dancers: [] }), false);
  assert.equal(isValidProjectData({ duration: 3601, dancers: [] }), false);
  assert.equal(isValidProjectData({ duration: 60, dancers: [{ id: "empty", keyframes: [] }] }), false);
  assert.equal(isValidProjectData({ duration: 60, dancers: Array.from({ length: 51 }, () => project.dancers[0]) }), false);
});

test("project validation rejects duplicate IDs and unsafe keyframe times", () => {
  const frame = { time: 10, x: 50, y: 50 };
  assert.equal(isValidProjectData({
    duration: 60,
    dancers: [
      { id: "same", keyframes: [frame] },
      { id: "same", keyframes: [{ time: 20, x: 40, y: 40 }] },
    ],
  }), false);
  assert.equal(isValidProjectData({
    duration: 60,
    dancers: [{ id: "late", keyframes: [{ time: 61, x: 50, y: 50 }] }],
  }), false);
  assert.equal(isValidProjectData({
    duration: 60,
    dancers: [{ id: "duplicate-time", keyframes: [frame, { time: 10.01, x: 55, y: 55 }] }],
  }), false);
});

test("pointer movement threshold distinguishes selection clicks from drags", () => {
  assert.equal(hasPointerMoved({ x: 100, y: 100 }, { x: 102, y: 102 }), false);
  assert.equal(hasPointerMoved({ x: 100, y: 100 }, { x: 104, y: 100 }), true);
});

test("fifty dancers with multiple positions interpolate independently", () => {
  const dancers = Array.from({ length: 50 }, (_, index) => ({
    keyframes: [
      { time: 0, x: index, y: 10 },
      { time: 10, x: index + 10, y: 90 },
    ],
  }));

  const positions = dancers.map((dancer) => getPositionAtTime(dancer.keyframes, 5));
  assert.equal(positions.length, 50);
  assert.deepEqual(positions[0], { x: 5, y: 50 });
  assert.deepEqual(positions[49], { x: 54, y: 50 });
});
