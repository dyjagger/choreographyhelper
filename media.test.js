"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getEventListeners } = require("node:events");
const { waitForMediaReady } = require("./core.js");

function mediaPlayer(properties = {}) {
  return Object.assign(new EventTarget(), { readyState: 0, duration: NaN, error: null }, properties);
}

function assertCleanedUp(player, signal) {
  for (const event of ["loadedmetadata", "durationchange", "error"]) {
    assert.equal(getEventListeners(player, event).length, 0, event);
  }
  if (signal) assert.equal(getEventListeners(signal, "abort").length, 0);
}

test("ready media starts without waiting for another metadata event", async () => {
  const player = mediaPlayer({ readyState: 1, duration: 42 });
  await waitForMediaReady(player);
  assertCleanedUp(player);
});

test("a reload waits for usable metadata rather than a stale duration", async () => {
  const player = mediaPlayer({ duration: 42 });
  const controller = new AbortController();
  let resolved = false;
  const ready = waitForMediaReady(player, { signal: controller.signal }).then(() => { resolved = true; });
  player.dispatchEvent(new Event("loadedmetadata"));
  await Promise.resolve();
  assert.equal(resolved, false);
  player.readyState = 1;
  player.duration = Infinity;
  player.dispatchEvent(new Event("durationchange"));
  await Promise.resolve();
  assert.equal(resolved, false);
  player.duration = 42;
  player.dispatchEvent(new Event("durationchange"));
  await ready;
  assertCleanedUp(player, controller.signal);
});

test("an existing media error fails even if duration is still available", async () => {
  const player = mediaPlayer({ readyState: 1, duration: 42, error: { code: 3 } });
  await assert.rejects(waitForMediaReady(player), /could not be loaded/);
  assertCleanedUp(player);
});

test("decoder errors during a reload reject and release listeners", async () => {
  const player = mediaPlayer();
  const ready = waitForMediaReady(player);
  player.error = { code: 3 };
  player.dispatchEvent(new Event("error"));
  await assert.rejects(ready, /could not be loaded/);
  assertCleanedUp(player);
});

test("an error queued for an old source cannot cancel a healthy reload", async () => {
  const player = mediaPlayer();
  const ready = waitForMediaReady(player);
  player.dispatchEvent(new Event("error"));
  player.readyState = 1;
  player.duration = 42;
  player.dispatchEvent(new Event("loadedmetadata"));
  await ready;
  assertCleanedUp(player);
});

test("pausing or replacing media cancels a pending reload", async () => {
  const player = mediaPlayer();
  const controller = new AbortController();
  const ready = waitForMediaReady(player, { signal: controller.signal });
  controller.abort();
  await assert.rejects(ready, { name: "AbortError" });
  assertCleanedUp(player, controller.signal);
  player.readyState = 1;
  player.duration = 42;
  player.dispatchEvent(new Event("loadedmetadata"));
});

test("an already cancelled request cannot start ready media", async () => {
  const player = mediaPlayer({ readyState: 1, duration: 42 });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitForMediaReady(player, { signal: controller.signal }), { name: "AbortError" });
  assertCleanedUp(player, controller.signal);
});

test("unreadable media cannot leave playback waiting indefinitely", async () => {
  const player = mediaPlayer();
  await assert.rejects(waitForMediaReady(player, { timeoutMs: 10 }), /timed out/);
  assertCleanedUp(player);
});
