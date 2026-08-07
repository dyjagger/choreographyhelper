# Formation Studio v2 Roadmap

This roadmap records the approved upgrade sequence for the web editor and the
future Windows desktop application. Work is developed away from `main` and is
merged only after the milestone's acceptance checks pass.

Implementation status: milestones 0–5 and the Windows application/build work
are complete on the `roadmap/choreo-v2` branch. A clean-machine Windows
installer check, public code signing, and advanced Formation Path controls
remain release follow-ups.

## Product rules

- Existing version-one JSON plans must remain importable.
- Choreography positions remain normalized stage coordinates from 0 to 100.
- Zoom is presentation state and must never rewrite choreography keyframes.
- Stage orientation is reversible and must not repeatedly mutate keyframes.
- A group edit creates synchronized keyframes at the current playhead time and
  is one undoable transaction.
- Hold and resume events are deterministic timeline data and never depend on
  runtime AI or playback state.
- Imported packages are untrusted input and must be bounded and validated
  before replacing the open project.
- The web and Windows editions share the same editor and project format.

## Milestone 0: Coordinate and interaction foundation

Status: complete.

- Add pure conversions between stored stage coordinates and displayed
  coordinates.
- Add pure group-delta and path-sampling helpers.
- Centralize stage pointer conversion so flip, zoom, drag, and touch use the
  same math.
- Add regression tests before connecting new controls.

Acceptance:

- Forward and inverse coordinate transformations round-trip without drift.
- Group boundary clamping preserves the formation.
- Existing version-one projects and all existing tests continue to pass.

## Milestone 1: Dancer naming and stage orientation

Status: complete.

- Make naming available during dancer creation.
- Add a visible rename action in the dancer list while retaining the selected
  dancer name editor.
- Add Front at top / Front at bottom controls.
- Mirror displayed Y coordinates when the front changes while keeping stored
  X/Y values stable.
- Save the chosen orientation in version-two plans.

Acceptance:

- Existing plans default to Front at bottom.
- Names and orientation survive export, import, autosave, undo, and redo.
- Flipping twice returns every dancer to the original displayed location.

## Milestone 2: Stage zoom and pan

Status: complete.

- Add zoom out, zoom percentage/reset, and zoom in controls.
- Zoom with a mouse wheel around the pointer location.
- Pinch around the gesture midpoint on touch devices.
- Pan a zoomed stage without changing dancer positions.
- Constrain zoom to 50–300 percent.

Acceptance:

- Dragging at every zoom level records the same normalized position.
- Pinch does not create dancer keyframes.
- Zoom remains usable in phone portrait and landscape layouts.

## Milestone 3: Multi-dancer selection and group movement

Status: complete.

- Replace scalar selection with an ordered selection collection and a primary
  dancer.
- Support modifier-click, selection rectangle, Select all, and Clear.
- Let touch users add or remove dancers directly without a separate mode.
- Drag or nudge the selected dancers as a rigid group.
- Clamp the shared movement delta so relative spacing is preserved.

Acceptance:

- One group drag records one keyframe per selected dancer at the same time.
- One undo reverses the complete group edit.
- No dancer can be pushed outside the supported stage bounds.

## Milestone 4: Formation Path alignment

Status: core line/freehand tool complete; circle, arc, fixed spacing, reverse
order, and nearby-dancer capture remain follow-ups.

- Add a Formation Path tool for selected dancers.
- Draw straight or smoothed freehand paths with a live ghost preview.
- Evenly distribute selected dancers while minimizing crossovers.
- Add circle, arc, fixed-spacing, reverse-order, and nearby-dancer capture as
  follow-up options after the reliable core tool.

Acceptance:

- Applying a path is one undoable transaction.
- Preview and final positions agree.
- Short or invalid paths cannot silently stack dancers.

## Milestone 5: Complete project packages

Status: complete for bounded web packages up to 1 GB.

- Keep portable JSON export/import.
- Add a `.formation` ZIP package containing a manifest, choreography JSON, and
  optional local audio/video files.
- Restore media, volumes, duration, orientation, and choreography together.
- Validate entry names, counts, declared sizes, decompressed sizes, media
  types, and project data before applying a package.

Acceptance:

- A package round-trip restores the complete project.
- A malformed package leaves the current project unchanged.
- Large files show progress or a clear bounded-size error.

## Milestone 6: Windows desktop application

Status: application and unsigned installer workflow complete. Clean-machine
Windows installation still needs release validation, and public distribution
requires publisher-owned code-signing credentials.

- Wrap the shared editor in a sandboxed Electron shell.
- Add native New/Open/Export commands, formation undo/redo, drag-and-drop
  opening, and `.formation` file association.
- Build a Windows installer in a Windows GitHub Actions job.
- Validate offline use and clean Windows installation.
- Keep signing credentials outside the repository; add public code signing
  when the owner supplies a certificate.

Acceptance:

- The same `.formation` package opens in the web and Windows editions.
- The renderer has no direct Node access, uses context isolation and sandboxing,
  and cannot navigate to arbitrary content.
- The unsigned test installer and signed public-release path are documented.

Release validation on a Windows machine:

- Install and uninstall on a clean user account.
- Confirm `.formation` file association and double-click opening.
- Confirm media playback and complete-project round trips in the installed app.

## Milestone 7: Hold Position and editing refinements

Status: complete on the feature branch.

- Clear loaded audio and video when starting a confirmed new project.
- Record hold and resume events for one or many selected dancers.
- Show active holds on dancer markers and the timeline.
- Keep freeform path drawing as the default and snap straight while Shift is held.
- Keep version-one and version-two projects importable while exporting version three.
