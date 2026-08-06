# Choreo Helper Gauntlet Progress

This branch is the isolated development fork for the Choreo Helper Gauntlet.
The original `main` worktree is intentionally unchanged.

## Constraints

- Local-first static browser app; no backend, accounts, cloud sync, analytics,
  runtime AI, or external network dependencies.
- Preserve support for up to 50 dancers, exact-time keyframes, interpolated
  playback, local audio/video, independent volume controls, autosave, and JSON
  import/export.
- Loaded media must never be serialized into project data or edit history.
- Changes must remain reversible through Git and compatible with existing
  version-1 project files.

## Baseline

- Branch: `gauntlet/choreo-helper-v1`
- Baseline commit: `3f1816123510df5fda05c7f9a1291b28e4381272`
- Automated baseline: 10 tests passing; `app.js` and `core.js` pass syntax
  checks.
- Privacy baseline: no outbound requests, third-party scripts, analytics, or
  serialized media data found.

## Public Workflow References

- Choreographic: <https://www.choreographic.app/>
- StageKeep: <https://stagekeep.com/>

These are quality and workflow references only. No proprietary code, assets,
or private behavior may be copied.

## Critique Round 1

Product critique found the largest workflow opportunity is named, whole-cast
formation cues. Engineering and quality critique found a prerequisite: current
edits are not safely reversible, importing replaces the active project, and
precise time navigation is difficult. The safe editing foundation therefore
comes first; named formation cues are the leading candidate for round 2.

## Iteration 1: Safe Editing and Exact Navigation

Status: complete at the code/static-test gate

Scope:

- Bounded in-memory undo/redo for choreography edits.
- Editable dancer names.
- Exact numeric playhead entry and clickable selected-dancer keyframes.
- Import confirmation plus a recoverable pre-import history state.
- Persistence guards: flush the latest valid edit on page exit, do not replace
  corrupt stored data automatically, and keep save failures visibly announced.
- Narrow playback guard so pausing after one media file ends cannot move the
  choreography backward.

Acceptance gates:

- One drag, coordinate record, key nudge, add, remove, rename, keyframe delete,
  manual duration change, and confirmed import each produce coherent undo steps.
- Redo is invalidated by a new edit and history is capped at 50 entries.
- Undo/redo preserves loaded audio/video object URLs and volumes.
- Existing version-1 plans still import; invalid/oversized input is rejected
  before state mutation.
- A user can type `10` or `12` seconds and click a keyframe time to seek audio,
  video, and choreography together.
- The most recent edit is synchronously persisted on page exit when storage is
  available; corrupt stored data is not silently overwritten.
- Save errors remain visible at mobile widths and are announced to assistive
  technology.
- Pausing after shorter media ends does not move the playhead backward.
- Automated tests cover pure history behavior, validation bounds, and name
  normalization. All existing tests remain green.
- No new network requests or serialized media information.

## Deferred

- Named whole-cast formation cues (next product iteration).
- Multi-select and group movement.
- Bulk cast setup, custom stages, props, collaboration, and printable output.
- Rendered-browser performance/accessibility claims until a browser automation
  runtime is available.

## Critique Round 2

The first implementation failed review on title-history consistency,
same-project import atomicity, focus restoration, counter validity after cast
changes, and a stale media-start race. The repair rounds resolved those defects
and added regression coverage. Fresh product and quality critics both passed
iteration 1 after inspecting the final diff.

Verified evidence:

- 22 automated tests pass.
- `app.js` and `core.js` pass JavaScript syntax checks.
- `git diff --check` passes.
- All HTML IDs are unique and all JavaScript element bindings resolve.
- The static app serves successfully over local HTTP.
- Static privacy review found no fetch, XHR, WebSocket, beacon, analytics,
  third-party script, or external runtime asset.
- Project serialization and edit history exclude loaded media URLs, filenames,
  bytes, playback state, and volume.

Known browser-only verification boundary:

- Actual audio/video start-cancel races, long-play drift, and exact media seek.
- Live focus-event ordering and assistive-technology announcements.
- BFCache behavior after `pagehide`.
- Rendered mobile overflow and touch geometry across real browsers.
- Real DOM playback performance and marker overlap with 50 dancers.

No browser automation runtime was installed for this iteration, so these remain
unverified limitations rather than claimed passes.
