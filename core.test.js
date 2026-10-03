"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_STAGE_BOUNDS,
  MAX_DANCER_COUNTER,
  MAX_DANCER_ID_LENGTH,
  MAX_TOTAL_KEYFRAMES,
  applyGroupDelta,
  areDocumentSnapshotsEqual,
  clampGroupDelta,
  createUniqueLocalDancerId,
  createHistory,
  displayToStagePosition,
  ensureTimeInTimelineViewport,
  formatTime,
  getDancerMarkerLabel,
  getHoldIntervals,
  getHoldStateAtTime,
  getLatestKeyframeTime,
  getPolylineLength,
  getPositionAtTime,
  getProjectCoordinateCompatibility,
  getStageBoundsForDimensions,
  getNextAvailableDancerNumber,
  hasPointerMoved,
  isValidProjectData,
  normalizeDancerName,
  normalizeStageOrientation,
  normalizeStageSize,
  normalizeTimelineViewport,
  normalizeProjectTitle,
  normalizeKeyframes,
  orderPositionsAlongPath,
  panTimelineViewport,
  prepareFormationPath,
  pushHistory,
  redoHistory,
  replaceTransitionWithHold,
  retimeHoldInterval,
  resizeStageDancers,
  resizeStagePosition,
  samplePolyline,
  shouldPauseAfterPlaybackStartSettles,
  stageToDisplayPosition,
  timeToTimelinePercent,
  undoHistory,
  upsertKeyframe,
  upsertPositionKeyframe,
  upgradeProjectCoordinates,
  zoomTimelineViewport,
} = require("./core.js");

function createLegacyLayoutProject() {
  return {
    version: 4, projectTitle: "Legacy fixture", duration: 30, dancerCounter: 1,
    stageOrientation: "front-top", stageWidth: 1.25, stageDepth: 1.5,
    audioVolume: 0.7, videoVolume: 0.3,
    dancers: [{ id: "legacy-dancer", number: 1, name: "Left", color: "#7156d9", keyframes: [
      { time: 0, x: 12.125, y: 20 },
      { time: 5.123456, x: 24.375, y: 40, hold: true },
      { time: 10.654321, x: 24.375, y: 40, hold: false },
      { time: 23.456789, x: 83.375, y: 60 },
    ] }],
  };
}

test("coordinate compatibility distinguishes dated legacy packages from ambiguous v4 exports", () => {
  const project = createLegacyLayoutProject();
  assert.equal(getProjectCoordinateCompatibility(project, "2026-09-18T02:56:21.782Z"), "legacy");
  for (const date of [undefined, "not a date", "2026-09-30T18:49:37.000Z", "2026-10-02T08:35:06.000Z"]) {
    assert.equal(getProjectCoordinateCompatibility(project, date), "unknown");
  }
  assert.equal(getProjectCoordinateCompatibility({ ...project, version: 3 }), "legacy");
  assert.equal(getProjectCoordinateCompatibility({ ...project, version: 5 }, "2026-09-18T02:56:21.782Z"), "current");
  assert.equal(getProjectCoordinateCompatibility({ ...project, stageOrientation: "front-bottom" }, "2026-09-18T02:56:21.782Z"), "current");
});

test("legacy coordinate conversion preserves the original view, interpolation, holds, times and stage size", () => {
  const original = createLegacyLayoutProject();
  const before = structuredClone(original);
  const restored = upgradeProjectCoordinates(original, { packageCreatedAt: "2026-09-18T02:56:21.782Z" });
  const expected = structuredClone(original);
  expected.version = 5;
  expected.dancers[0].keyframes.forEach(frame => { frame.x = Math.round((100 - frame.x) * 1000) / 1000; });
  assert.deepEqual(restored, expected);
  assert.deepEqual(original, before, "Conversion must not mutate the source project");
  assert.equal(isValidProjectData(restored), true);
  for (const time of [0, 2.5, 5.123456, 7.5, 10.654321, 15, 23.456789, 30]) {
    const oldPosition = getPositionAtTime(original.dancers[0].keyframes, time);
    const view = stageToDisplayPosition(getPositionAtTime(restored.dancers[0].keyframes, time), "front-top");
    assert.ok(Math.abs(view.x - oldPosition.x) <= 0.0011);
    assert.ok(Math.abs(view.y - (100 - oldPosition.y)) <= 0.0011);
  }
});

test("converted and new v5 projects cannot be mirrored again during import or reload", () => {
  const restored = upgradeProjectCoordinates(createLegacyLayoutProject(), { restoreLegacyLeftRight: true });
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(upgradeProjectCoordinates(restored, { packageCreatedAt: "2026-09-18T02:56:21.782Z", restoreLegacyLeftRight: true }), restored);
  }
  assert.deepEqual(upgradeProjectCoordinates({ ...restored, stageOrientation: "front-bottom" }), { ...restored, stageOrientation: "front-bottom" });
});

test("ambiguous projects keep their coordinates and remain unversioned until a layout choice", () => {
  const original = createLegacyLayoutProject();
  assert.deepEqual(upgradeProjectCoordinates(original), original);
  assert.deepEqual(upgradeProjectCoordinates(original, { restoreLegacyLeftRight: false }), { ...original, version: 5 });
  assert.equal(upgradeProjectCoordinates(original, { restoreLegacyLeftRight: true }).dancers[0].keyframes[0].x, 87.875);
  const bottom = { ...original, stageOrientation: "front-bottom" };
  assert.deepEqual(upgradeProjectCoordinates(bottom, { restoreLegacyLeftRight: true }), { ...bottom, version: 5 });
});

test("older coordinate formats gain default stage dimensions and v5 validates its required dimensions", () => {
  const legacy = createLegacyLayoutProject();
  legacy.version = 3;
  delete legacy.stageWidth;
  delete legacy.stageDepth;
  const restored = upgradeProjectCoordinates(legacy);
  assert.equal(restored.stageWidth, 1);
  assert.equal(restored.stageDepth, 1);
  assert.equal(restored.version, 5);
  assert.equal(isValidProjectData(restored), true);
  assert.equal(isValidProjectData({ ...restored, stageWidth: undefined }), false);
  assert.equal(isValidProjectData({ ...restored, version: 6 }), false);
});

test("stage orientation mirrors both coordinates and round-trips", () => {
  const stored = { x: 22.25, y: 84.75 };
  assert.deepEqual(stageToDisplayPosition(stored, "front-bottom"), stored);
  assert.deepEqual(stageToDisplayPosition(stored, "front-top"), { x: 77.75, y: 15.25 });
  assert.deepEqual(displayToStagePosition({ x: 77.75, y: 15.25 }, "front-top"), stored);
  assert.deepEqual(stageToDisplayPosition(stageToDisplayPosition(stored, "front-top"), "front-top"), stored);
  assert.equal(normalizeStageOrientation("unexpected"), "front-bottom");
});

test("front-top movement converts screen left and right into the opposite stage sides", () => {
  const stored = { x: 20, y: 70 };
  const displayed = stageToDisplayPosition(stored, "front-top");
  const [moved] = applyGroupDelta([displayed], { x: 10, y: 5 });
  assert.deepEqual(displayToStagePosition(moved, "front-top"), { x: 10, y: 65 });
  assert.deepEqual(stored, { x: 20, y: 70 });
});

test("stage dimensions normalize and calculate constant physical marker margins", () => {
  assert.equal(normalizeStageSize(2.5), 2.5);
  assert.equal(normalizeStageSize(0), 1);
  assert.equal(normalizeStageSize(9), 4);
  assert.deepEqual(getStageBoundsForDimensions({ width: 2, depth: 2 }), {
    minX: 1.25,
    maxX: 98.75,
    minY: 2,
    maxY: 98,
  });
});

test("keeping formation spacing grows behind the stage and equally across its sides", () => {
  assert.deepEqual(
    resizeStagePosition({ x: 20, y: 20 }, { width: 1, depth: 1 }, { width: 2, depth: 2 }),
    { x: 35, y: 60 },
  );
  assert.deepEqual(
    resizeStagePosition({ x: 50, y: 96 }, { width: 1, depth: 1 }, { width: 2, depth: 2 }),
    { x: 50, y: 98 },
  );
});

test("stretching a resized stage preserves normalized positions", () => {
  assert.deepEqual(
    resizeStagePosition({ x: 20, y: 20 }, { width: 1, depth: 1 }, { width: 3, depth: 2 }, "stretch"),
    { x: 20, y: 20 },
  );
});

test("stage resizing preserves keyframe metadata and blocks formations that cannot fit", () => {
  const dancer = {
    id: "dancer-1",
    name: "Maya",
    keyframes: [
      { time: 0, x: 50, y: 2, hold: true },
      { time: 10, x: 50, y: 98, hold: false },
    ],
  };
  const tooSmall = resizeStageDancers([dancer], { width: 1, depth: 3 }, { width: 1, depth: 1 });
  assert.equal(tooSmall.ok, false);
  assert.equal(tooSmall.reason, "outside-stage");
  assert.equal(tooSmall.dancerId, "dancer-1");

  const standardDancer = {
    ...dancer,
    keyframes: [
      { time: 0, x: 50, y: 4, hold: true },
      { time: 10, x: 50, y: 96, hold: false },
    ],
  };
  const expanded = resizeStageDancers([standardDancer], { width: 1, depth: 1 }, { width: 1, depth: 2 });
  assert.equal(expanded.ok, true);
  assert.equal(expanded.dancers[0].keyframes[0].hold, true);
  assert.equal(expanded.dancers[0].keyframes[1].hold, false);
  assert.deepEqual(expanded.dancers[0].keyframes.map(({ x, y }) => ({ x, y })), [
    { x: 50, y: 52 },
    { x: 50, y: 98 },
  ]);
  assert.equal(resizeStageDancers([
    { id: "edge", keyframes: [{ time: 0, x: 50, y: 100 }] },
  ], { width: 1, depth: 1 }, { width: 1, depth: 2 }).ok, true);
});

test("stage marker labels use a name prefix and retain numbers for unnamed dancers", () => {
  assert.equal(getDancerMarkerLabel("Maya", 1), "Ma");
  assert.equal(getDancerMarkerLabel("maya", 1), "Ma");
  assert.equal(getDancerMarkerLabel("AJ", 2), "AJ");
  assert.equal(getDancerMarkerLabel("李明", 3), "李明");
  assert.equal(getDancerMarkerLabel("Dancer 4", 4), "4");
  assert.equal(getDancerMarkerLabel("", 12), "12");
});

test("group deltas clamp as one rigid formation at stage boundaries", () => {
  const positions = [{ x: 10, y: 10 }, { x: 90, y: 80 }];
  assert.deepEqual(clampGroupDelta(positions, { x: 20, y: -20 }), { x: 7.5, y: -6 });
  assert.deepEqual(applyGroupDelta(positions, { x: 20, y: -20 }), [
    { x: 17.5, y: 4 },
    { x: 97.5, y: 74 },
  ]);
  assert.deepEqual(clampGroupDelta([], { x: 5, y: 5 }, DEFAULT_STAGE_BOUNDS), { x: 0, y: 0 });
});

test("group movement can use the added area of an expanded stage", () => {
  const expandedBounds = getStageBoundsForDimensions({ width: 2, depth: 2 });
  const positions = [{ x: 35, y: 60 }, { x: 65, y: 70 }];
  assert.deepEqual(clampGroupDelta(positions, { x: -50, y: -80 }, expandedBounds), {
    x: -33.75,
    y: -58,
  });
  assert.deepEqual(applyGroupDelta(positions, { x: -50, y: -80 }, expandedBounds), [
    { x: 1.25, y: 2 },
    { x: 31.25, y: 12 },
  ]);
});

test("polyline sampling distributes positions at equal path distances", () => {
  assert.deepEqual(samplePolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 3), [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 0 },
  ]);
  assert.deepEqual(samplePolyline([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], 3), [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 50 },
  ]);
  assert.deepEqual(samplePolyline([{ x: 5, y: 5 }], 4), []);
});

test("formation paths straighten rough lines and smooth intentional curves", () => {
  const roughLine = prepareFormationPath([{ x: 10, y: 20 }, { x: 50, y: 21 }, { x: 90, y: 20 }]);
  assert.deepEqual(roughLine, [{ x: 10, y: 20 }, { x: 90, y: 20 }]);
  assert.ok(prepareFormationPath(
    [{ x: 10, y: 20 }, { x: 50, y: 21 }, { x: 90, y: 20 }],
    { straightThreshold: 0 },
  ).length > 2);

  const curve = prepareFormationPath([{ x: 10, y: 80 }, { x: 50, y: 20 }, { x: 90, y: 80 }]);
  assert.ok(curve.length > 3);
  assert.deepEqual(curve[0], { x: 10, y: 80 });
  assert.deepEqual(curve.at(-1), { x: 90, y: 80 });
  assert.ok(getPolylineLength(curve) > 80);
});

test("dancers are ordered along a path by their nearest progress", () => {
  const path = [{ x: 0, y: 50 }, { x: 100, y: 50 }];
  assert.deepEqual(orderPositionsAlongPath([
    { x: 80, y: 55 },
    { x: 10, y: 45 },
    { x: 50, y: 60 },
  ], path), [1, 2, 0]);
});

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

test("hold keyframes freeze movement until an explicit resume keyframe", () => {
  const openHold = [
    { time: 0, x: 0, y: 50 },
    { time: 10, x: 30, y: 50, hold: true },
    { time: 15, x: 45, y: 50 },
    { time: 30, x: 90, y: 50 },
  ];
  assert.deepEqual(getPositionAtTime(openHold, 5), { x: 15, y: 50 });
  assert.deepEqual(getPositionAtTime(openHold, 20), { x: 30, y: 50 });
  assert.deepEqual(getPositionAtTime(openHold, 30), { x: 30, y: 50 });
  assert.deepEqual(getHoldStateAtTime(openHold, 20), {
    active: true,
    event: { time: 10, x: 30, y: 50, hold: true },
  });

  const completedHold = [
    ...openHold,
    { time: 20, x: 30, y: 50, hold: false },
  ];
  assert.deepEqual(getPositionAtTime(completedHold, 20), { x: 30, y: 50 });
  assert.deepEqual(getPositionAtTime(completedHold, 25), { x: 60, y: 50 });
  assert.deepEqual(getPositionAtTime(completedHold, 30), { x: 90, y: 50 });
  assert.equal(getHoldStateAtTime(completedHold, 25).active, false);
  assert.deepEqual(getHoldIntervals(completedHold), [{ start: 10, end: 20, x: 30, y: 50 }]);
  assert.deepEqual(getHoldIntervals(openHold), [{ start: 10, end: null, x: 30, y: 50 }]);
});

test("dropping at an existing time replaces rather than duplicates the keyframe", () => {
  const result = upsertKeyframe(
    [{ time: 10, x: 20, y: 30 }],
    { time: 10.009, x: 65, y: 75 },
  );

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { time: 10.009, x: 65, y: 75 });
});

test("editing a recorded position preserves hold and resume metadata", () => {
  const frames = [
    { time: 10, x: 20, y: 30, hold: true },
    { time: 20, x: 20, y: 30, hold: false },
  ];

  assert.deepEqual(upsertPositionKeyframe(frames, 10, { x: 65, y: 75 }), [
    { time: 10, x: 65, y: 75, hold: true },
    { time: 20, x: 20, y: 30, hold: false },
  ]);
  assert.deepEqual(upsertPositionKeyframe(frames, 20, { x: 80, y: 40 }), [
    { time: 10, x: 20, y: 30, hold: true },
    { time: 20, x: 80, y: 40, hold: false },
  ]);
});

test("replacing an arrival with a hold freezes the incoming transition and preserves later formations", () => {
  const frames = [
    { time: 0, x: 10, y: 20 }, { time: 5, x: 20, y: 30 },
    { time: 10, x: 80, y: 60 }, { time: 20, x: 90, y: 80 },
    { time: 30, x: 90, y: 80, hold: true }, { time: 35, x: 90, y: 80, hold: false },
  ];
  const original = structuredClone(frames);
  const result = replaceTransitionWithHold(frames, 10);
  assert.equal(result.ok, true);
  assert.deepEqual(getHoldIntervals(result.keyframes), [
    { start: 5, end: 10, x: 20, y: 30 }, { start: 30, end: 35, x: 90, y: 80 },
  ]);
  for (const time of [5, 7.5, 9.9, 10]) assert.deepEqual(getPositionAtTime(result.keyframes, time), { x: 20, y: 30 });
  assert.deepEqual(getPositionAtTime(result.keyframes, 15), { x: 55, y: 55 });
  assert.deepEqual(result.keyframes.filter(frame => frame.time > 10), frames.filter(frame => frame.time > 10));
  assert.deepEqual(getPositionAtTime(result.keyframes, 2.5), getPositionAtTime(frames, 2.5));
  assert.deepEqual(frames, original, "The source frames must remain unchanged");
});

test("a selected dancer without a frame at the edited time gains a bounded hold without losing its destination", () => {
  const frames = [{ time: 0, x: 50, y: 20 }, { time: 20, x: 50, y: 70 }];
  const result = replaceTransitionWithHold(frames, 10);
  assert.deepEqual(result.keyframes, [
    { time: 0, x: 50, y: 20, hold: true }, { time: 10, x: 50, y: 20, hold: false }, frames[1],
  ]);
  assert.deepEqual(getPositionAtTime(result.keyframes, 5), { x: 50, y: 20 });
  assert.deepEqual(getPositionAtTime(result.keyframes, 20), { x: 50, y: 70 });
});

test("transition holds preserve fractional times and remain unchanged when applied repeatedly", () => {
  const frames = [
    { time: 0, x: 10, y: 20 }, { time: 5.123456, x: 20, y: 30 },
    { time: 10.654321, x: 80, y: 60 }, { time: 20.987654, x: 90, y: 80 },
  ];
  const first = replaceTransitionWithHold(frames, 10.654321);
  assert.deepEqual(first.keyframes.map(frame => frame.time), frames.map(frame => frame.time));
  assert.deepEqual(replaceTransitionWithHold(first.keyframes, 10.654321).keyframes, first.keyframes);
  assert.deepEqual(getPositionAtTime(first.keyframes, 8), { x: 20, y: 30 });
});

test("existing holds that span a transition stay active and retain their later resume", () => {
  const frames = [
    { time: 0, x: 10, y: 20, hold: true }, { time: 5, x: 80, y: 60 },
    { time: 10, x: 90, y: 80 }, { time: 15, x: 10, y: 20, hold: false }, { time: 20, x: 50, y: 50 },
  ];
  assert.deepEqual(replaceTransitionWithHold(frames, 10).keyframes, frames);
  assert.deepEqual(getPositionAtTime(frames, 12), { x: 10, y: 20 });
  const startingHold = [{ time: 0, x: 10, y: 20 }, { time: 10, x: 80, y: 60, hold: true }, { time: 20, x: 80, y: 60, hold: false }];
  const result = replaceTransitionWithHold(startingHold, 10);
  assert.equal(result.keyframes[1].hold, true);
  assert.deepEqual(result.keyframes[2], startingHold[2]);
});

test("a first formation has no incoming transition to replace", () => {
  const frames = [{ time: 5, x: 20, y: 30 }, { time: 10, x: 80, y: 60 }];
  assert.deepEqual(replaceTransitionWithHold(frames, 5), { ok: false, reason: "no-previous-position" });
  assert.deepEqual(replaceTransitionWithHold([], 10), { ok: false, reason: "no-previous-position" });
  assert.deepEqual(replaceTransitionWithHold(frames, -1), { ok: false, reason: "invalid-time" });
  assert.deepEqual(replaceTransitionWithHold(frames, NaN), { ok: false, reason: "invalid-time" });
});

test("retiming a relocated resume preserves its arrival and creates real travel time", () => {
  const frames = [
    { time: 0, x: 0, y: 50 },
    { time: 10, x: 20, y: 50, hold: true },
    { time: 15, x: 60, y: 50, hold: false },
    { time: 20, x: 100, y: 50 },
  ];
  const result = retimeHoldInterval(frames, 10, 15, 10, 12);

  assert.equal(result.ok, true);
  assert.equal(result.retainedArrival, true);
  assert.deepEqual(result.keyframes, [
    { time: 0, x: 0, y: 50 },
    { time: 10, x: 20, y: 50, hold: true },
    { time: 12, x: 20, y: 50, hold: false },
    { time: 15, x: 60, y: 50 },
    { time: 20, x: 100, y: 50 },
  ]);
  assert.deepEqual(getPositionAtTime(result.keyframes, 11), { x: 20, y: 50 });
  assert.deepEqual(getPositionAtTime(result.keyframes, 13.5), { x: 40, y: 50 });
  assert.deepEqual(getPositionAtTime(result.keyframes, 15), { x: 60, y: 50 });
});

test("retiming an ordinary resume moves the event instead of leaving a phantom stop", () => {
  const frames = [
    { time: 0, x: 0, y: 50 },
    { time: 10, x: 20, y: 50, hold: true },
    { time: 15, x: 20, y: 50, hold: false },
    { time: 20, x: 100, y: 50 },
  ];
  const result = retimeHoldInterval(frames, 10, 15, 10, 12);

  assert.equal(result.ok, true);
  assert.equal(result.retainedArrival, false);
  assert.deepEqual(result.keyframes, [
    { time: 0, x: 0, y: 50 },
    { time: 10, x: 20, y: 50, hold: true },
    { time: 12, x: 20, y: 50, hold: false },
    { time: 20, x: 100, y: 50 },
  ]);
  assert.deepEqual(getPositionAtTime(result.keyframes, 16), { x: 60, y: 50 });
});

test("retiming a hold start freezes the underlying interpolated position", () => {
  const frames = [
    { time: 0, x: 0, y: 50 },
    { time: 10, x: 20, y: 50, hold: true },
    { time: 15, x: 20, y: 50, hold: false },
    { time: 20, x: 100, y: 50 },
  ];
  const result = retimeHoldInterval(frames, 10, 15, 8, 12);

  assert.equal(result.ok, true);
  assert.deepEqual(result.holdPosition, { x: 16, y: 50 });
  assert.deepEqual(getHoldIntervals(result.keyframes), [{ start: 8, end: 12, x: 16, y: 50 }]);
  assert.deepEqual(getPositionAtTime(result.keyframes, 10), { x: 16, y: 50 });
  assert.deepEqual(getPositionAtTime(result.keyframes, 12), { x: 16, y: 50 });
});

test("an ongoing hold can gain an explicit resume without losing its next destination", () => {
  const frames = [
    { time: 0, x: 0, y: 50 },
    { time: 10, x: 20, y: 50, hold: true },
    { time: 20, x: 100, y: 50 },
  ];
  const result = retimeHoldInterval(frames, 10, null, 10, 15);

  assert.equal(result.ok, true);
  assert.deepEqual(getHoldIntervals(result.keyframes), [{ start: 10, end: 15, x: 20, y: 50 }]);
  assert.deepEqual(getPositionAtTime(result.keyframes, 17.5), { x: 60, y: 50 });
});

test("hold retiming rejects zero-duration holds and resume collisions", () => {
  const frames = [
    { time: 10, x: 20, y: 50, hold: true },
    { time: 15, x: 60, y: 50, hold: false },
  ];
  assert.deepEqual(retimeHoldInterval(frames, 10, 15, 10, 10.01), {
    ok: false,
    reason: "invalid-range",
  });
  assert.deepEqual(retimeHoldInterval(frames, 10, 15, 10, 15), {
    ok: false,
    reason: "resume-conflict",
    conflictTime: 15,
  });
  assert.deepEqual(retimeHoldInterval([
    { time: 0, x: 10, y: 50, hold: true },
    { time: 5, x: 10, y: 50, hold: false },
    ...frames,
  ], 10, 15, 4, 12), {
    ok: false,
    reason: "hold-conflict",
    conflictTime: 5,
  });
});

test("timeline viewport zoom anchors, pans, maps, and follows without changing duration", () => {
  assert.deepEqual(normalizeTimelineViewport({ start: -5, end: 55 }, 100, 10), { start: 0, end: 60 });
  assert.deepEqual(zoomTimelineViewport({ start: 0, end: 100 }, 25, 2, 100, 10), {
    start: 12.5,
    end: 62.5,
  });
  assert.deepEqual(panTimelineViewport({ start: 12.5, end: 62.5 }, 50, 100, 10), {
    start: 50,
    end: 100,
  });
  assert.deepEqual(ensureTimeInTimelineViewport({ start: 20, end: 40 }, 50, 100, 10), {
    start: 32,
    end: 52,
  });
  assert.equal(timeToTimelinePercent(30, { start: 20, end: 40 }, 100, 10), 50);
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
  assert.deepEqual(normalizeKeyframes([{ time: 5, x: 20, y: 30, hold: true }]), [
    { time: 5, x: 20, y: 30, hold: true },
  ]);
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

test("history is capped, clears redo after a new edit, and round-trips exactly", () => {
  let history = createHistory(2);
  history = pushHistory(history, { label: "first", snapshot: { value: 0 } });
  history = pushHistory(history, { label: "second", snapshot: { value: 1 } });
  history = pushHistory(history, { label: "third", snapshot: { value: 2 } });
  assert.deepEqual(history.past.map((entry) => entry.label), ["second", "third"]);

  const undone = undoHistory(history, { label: "third", snapshot: { value: 3 } });
  assert.deepEqual(undone.entry.snapshot, { value: 2 });
  assert.deepEqual(undone.history.future[0].snapshot, { value: 3 });

  const redone = redoHistory(undone.history, { label: "third", snapshot: { value: 2 } });
  assert.deepEqual(redone.entry.snapshot, { value: 3 });
  assert.deepEqual(redone.history.past.at(-1).snapshot, { value: 2 });

  const replaced = pushHistory(undone.history, { label: "replacement", snapshot: { value: 9 } });
  assert.equal(replaced.future.length, 0);
});

test("empty history steps are deterministic no-ops", () => {
  const history = createHistory();
  assert.deepEqual(undoHistory(history, { value: 1 }), { history, entry: null });
  assert.deepEqual(redoHistory(history, { value: 1 }), { history, entry: null });
});

test("default edit history retains only the latest fifty entries", () => {
  let history = createHistory();
  for (let index = 0; index < 60; index += 1) {
    history = pushHistory(history, { label: `edit-${index}`, snapshot: index });
  }
  assert.equal(history.past.length, 50);
  assert.equal(history.past[0].snapshot, 10);
  assert.equal(history.past.at(-1).snapshot, 59);
});

test("dancer names are trimmed, normalized, bounded, and given a fallback", () => {
  assert.equal(normalizeDancerName("  Ada   Lovelace  "), "Ada Lovelace");
  assert.equal(normalizeDancerName("   ", "Dancer 7"), "Dancer 7");
  assert.equal(normalizeDancerName("abcdefgh", "Dancer", 5), "abcde");
});

test("project validation bounds IDs, dancer counters, and total keyframes", () => {
  const frame = { time: 0, x: 50, y: 50 };
  const base = { version: 1, duration: 60, dancerCounter: 1, dancers: [{ id: "dancer-1", keyframes: [frame] }] };
  assert.equal(isValidProjectData(base), true);
  assert.equal(isValidProjectData({ ...base, dancerCounter: MAX_DANCER_COUNTER + 1 }), false);
  assert.equal(isValidProjectData({
    ...base,
    dancers: [{ id: "x".repeat(MAX_DANCER_ID_LENGTH + 1), keyframes: [frame] }],
  }), false);

  const fiveThousandFrames = Array.from({ length: 5000 }, (_, index) => ({
    time: index * 0.02,
    x: 50,
    y: 50,
  }));
  const oversized = {
    duration: 120,
    dancers: Array.from({ length: Math.floor(MAX_TOTAL_KEYFRAMES / 5000) + 1 }, (_, index) => ({
      id: `bulk-${index}`,
      keyframes: fiveThousandFrames,
    })),
  };
  assert.equal(isValidProjectData(oversized), false);
});

test("an accepted boundary dancer counter remains valid through every remaining add", () => {
  const dancers = [];
  let dancerCounter = MAX_DANCER_COUNTER - 50;
  assert.equal(isValidProjectData({ duration: 60, dancerCounter, dancers }), true);

  for (let index = 0; index < 50; index += 1) {
    dancerCounter += 1;
    dancers.push({
      id: `boundary-${index}`,
      number: dancerCounter,
      keyframes: [{ time: 0, x: 50, y: 50 }],
    });
    assert.equal(isValidProjectData({ duration: 60, dancerCounter, dancers }), true);
  }

  assert.equal(isValidProjectData({ duration: 60, dancerCounter: MAX_DANCER_COUNTER, dancers: [] }), true);
  assert.equal(isValidProjectData({ duration: 60, dancerCounter: MAX_DANCER_COUNTER + 1, dancers: [] }), false);
});

test("maximum counters stay valid through removal and undo-style restoration", () => {
  const dancers = Array.from({ length: 50 }, (_, index) => ({
    id: `max-counter-${index + 1}`,
    number: index + 1,
    keyframes: [{ time: 0, x: 50, y: 50 }],
  }));
  const fullProject = { duration: 60, dancerCounter: MAX_DANCER_COUNTER, dancers };
  assert.equal(isValidProjectData(fullProject), true);

  for (const removedNumber of [1, 25, 50]) {
    const afterRemoval = {
      ...fullProject,
      dancers: dancers.filter((dancer) => dancer.number !== removedNumber),
    };
    assert.equal(isValidProjectData(afterRemoval), true);
    const restoredSnapshot = JSON.parse(JSON.stringify(fullProject));
    assert.equal(isValidProjectData(restoredSnapshot), true);
  }
});

test("a maximum-counter project can recycle numbers and add safely to fifty dancers", () => {
  const project = { duration: 60, dancerCounter: MAX_DANCER_COUNTER, dancers: [] };
  while (project.dancers.length < 50) {
    const allocation = getNextAvailableDancerNumber(project.dancers, project.dancerCounter);
    assert.ok(allocation);
    project.dancerCounter = allocation.dancerCounter;
    project.dancers.push({
      id: createUniqueLocalDancerId(project.dancers, allocation.number),
      number: allocation.number,
      keyframes: [{ time: 0, x: 50, y: 50 }],
    });
    assert.equal(isValidProjectData(project), true);
  }
  assert.equal(new Set(project.dancers.map((dancer) => dancer.id)).size, 50);
  assert.equal(new Set(project.dancers.map((dancer) => dancer.number)).size, 50);
});

test("document transaction equality includes selection and playhead state", () => {
  const project = { version: 1, duration: 60, dancers: [] };
  const base = { project, currentTime: 10, selectedDancerId: null, selectedDancerIds: [] };
  assert.equal(areDocumentSnapshotsEqual(base, { ...base }), true);
  assert.equal(areDocumentSnapshotsEqual(base, { ...base, currentTime: 12 }), false);
  assert.equal(areDocumentSnapshotsEqual(base, { ...base, selectedDancerId: "dancer-1" }), false);
  assert.equal(areDocumentSnapshotsEqual(base, { ...base, selectedDancerIds: ["dancer-1", "dancer-2"] }), false);
});

test("a stale playback start cannot pause a newer active start", () => {
  assert.equal(shouldPauseAfterPlaybackStartSettles(1, 3, true, false), false);
  assert.equal(shouldPauseAfterPlaybackStartSettles(1, 3, false, true), false);
  assert.equal(shouldPauseAfterPlaybackStartSettles(1, 2, false, false), true);
  assert.equal(shouldPauseAfterPlaybackStartSettles(3, 3, false, true), true);
});

test("blank project titles normalize across save, restore, and history round trips", () => {
  const normalizedTitle = normalizeProjectTitle("   \n  ");
  assert.equal(normalizedTitle, "Untitled choreography");

  const saved = JSON.stringify({ projectTitle: normalizedTitle });
  const restored = JSON.parse(saved);
  restored.projectTitle = normalizeProjectTitle(restored.projectTitle);
  assert.equal(restored.projectTitle, "Untitled choreography");

  const blankSnapshot = { project: { projectTitle: normalizeProjectTitle("") }, currentTime: 0, selectedDancerId: null };
  const namedSnapshot = { project: { projectTitle: normalizeProjectTitle("Finale") }, currentTime: 0, selectedDancerId: null };
  let history = pushHistory(createHistory(), { label: "edit project title", snapshot: blankSnapshot });
  const undone = undoHistory(history, { label: "edit project title", snapshot: namedSnapshot });
  assert.equal(undone.entry.snapshot.project.projectTitle, "Untitled choreography");
  const redone = redoHistory(undone.history, { label: "edit project title", snapshot: blankSnapshot });
  assert.equal(redone.entry.snapshot.project.projectTitle, "Finale");
});

test("legacy version-one data may omit optional presentation fields", () => {
  assert.equal(isValidProjectData({
    version: 1,
    duration: 60,
    dancers: [{ id: "legacy", keyframes: [{ time: 0, x: 50, y: 50 }] }],
  }), true);
});

test("versioned projects accept supported presentation and hold fields", () => {
  const base = {
    version: 2,
    duration: 60,
    dancers: [{ id: "oriented", keyframes: [{ time: 0, x: 50, y: 50 }] }],
  };
  assert.equal(isValidProjectData({ ...base, stageOrientation: "front-bottom" }), true);
  assert.equal(isValidProjectData({ ...base, stageOrientation: "front-top" }), true);
  assert.equal(isValidProjectData({ ...base, stageOrientation: "sideways" }), false);
  assert.equal(isValidProjectData({ ...base, audioVolume: 0.4, videoVolume: 1 }), true);
  assert.equal(isValidProjectData({ ...base, audioVolume: 1.1 }), false);
  assert.equal(isValidProjectData({
    ...base,
    version: 3,
    dancers: [{ id: "holding", keyframes: [{ time: 0, x: 50, y: 50, hold: true }] }],
  }), true);
  assert.equal(isValidProjectData({
    ...base,
    version: 3,
    dancers: [{ id: "bad-hold", keyframes: [{ time: 0, x: 50, y: 50, hold: "yes" }] }],
  }), false);
  assert.equal(isValidProjectData({
    ...base,
    version: 4,
    stageWidth: 1.5,
    stageDepth: 3,
  }), true);
  assert.equal(isValidProjectData({ ...base, version: 4, stageWidth: 1.5 }), false);
  assert.equal(isValidProjectData({ ...base, version: 4, stageWidth: 0.5, stageDepth: 1 }), false);
  assert.equal(isValidProjectData({ ...base, version: 3 }), true);
});
