# Formation Studio

A local-first browser app for planning dance formations against a timer, an MP3/WAV track, or a reference video.

## Live app

<https://dyjagger.github.io/choreographyhelper/>

## Run it

```bash
cd /home/daniel/choreography-positioner
npm start
```

Then open <http://localhost:4173>.

No dependency installation or backend is required.

## Use it

1. Type an optional dancer name and add the dancer.
2. Move the timeline to a time.
3. Drag the dancer to the desired stage position. Dropping records a position keyframe.
4. Move later in the timeline and drag the dancer again.
5. Press play to see a straight-line movement between the positions.

Use the **Go to** field to move the playhead to an exact second. Click a timeline dot or a recorded-position time below the timeline to pause and show the entire formation at that exact time, including Hold and Resume points. These navigation clicks keep project and dancer names editable. Choose **Edit transition** at a recorded position to preview changes to its formation. Moved dancers leave outlined markers at their original positions until you choose **Apply changes**; **Cancel** restores the original formation. An applied transition edit is one undoable action, even when several dancers change. Dancer names can be edited directly in the cast list. Undo and redo buttons cover formation edits, and Ctrl/Cmd+Z plus Ctrl/Cmd+Shift+Z work whenever focus is outside an input field.

Use **New project** to permanently clear the choreography, loaded audio, and loaded video after a confirmation. Export anything you want to keep first.

Up to 50 dancers are supported. Edit dancer names directly in the cast list. Unnamed dancers use their number on the stage; named dancers use the first two characters of their name, such as `Ma` for Maya. Switching the front of the stage between top and bottom turns the view through 180°, mirroring left/right and front/back without rewriting saved keyframes.

Projects saved with the front at the top before v0.5.5 used a different horizontal coordinate convention. Import pre-fix complete projects with **Restore the original left/right layout** checked; packages dated before that fix select it automatically. Version 4 was also used after the fix, so undated JSON and later packages offer the choice without guessing. New and restored projects use version 5 to prevent another conversion on reload. An ambiguous older autosave displays **Restore older layout / Keep current layout**; restoration is undoable and preserves all times, holds, dimensions, and media.

Choose **Stage size** to change width and depth independently from 1× to 4×. **Keep formation spacing** preserves the dancers' real spacing while width grows equally on both sides and depth is added behind the current stage; **Stretch to fill stage** keeps their percentage positions instead. The dashed outline shows the original boundary during the preview. Apply makes the whole resize one undoable edit, while Cancel restores the original stage and formations. A reduction that cannot contain an existing formation is blocked in Keep spacing mode.

Use the stage `−`, `100%`, and `+` controls or a two-finger pinch to zoom the stage from 100% to 300%. At 100%, the complete stage fits in the viewport regardless of its width and depth; dancer markers, original-position outlines, and formation previews scale with that fitted stage. Zoom in for larger editing targets and detailed scrolling. Pinch movement also pans the zoomed view.

Use modifier-click or a desktop selection rectangle to select several dancers. On touch screens, tap dancers to add or remove them from the selection. **Select all** and **Clear** provide quick selection controls. Dragging any selected dancer or pressing an arrow key moves the selected formation as one rigid group and records one undoable edit at the current playhead time.

Select dancers and choose **Hold position**, or press **H** while focus is outside a text field, to freeze them from the current playhead time. Their dotted stage rings and the dotted timeline range show the active hold. Move to a later time and choose **End hold** or press **H** again; they then continue toward their next recorded destination. At a Hold or Resume point, choose **Edit hold**, or click a dotted hold range, to edit its timing as an Apply/Cancel transaction. You can type exact start/resume times or move the timeline and choose **Use current time**. Moving Resume earlier keeps the later formation as the destination so the dancer travels instead of teleporting. Hold and resume events are saved, exported, imported, and undoable.

At an existing recorded arrival, **Hold position / H** instead previews replacing the selected dancers' incoming movements with holds. Each dancer stays at their preceding recorded position through that arrival; movement resumes toward their unchanged later destinations afterward. **Edit transition** keeps your selected group and also allows Hold position. Choose **Apply changes** to commit the whole group as one undoable edit, or **Cancel** to restore it. Dancers without their own keyframe at the edited time gain a resume point there; dancers with no preceding position are left unchanged. Holds already spanning the transition stay intact. At other times, the ordinary Hold position / End hold workflow remains available.

Press **=** or **−** to zoom the timeline around the current playhead, or use the timeline buttons. **Fit** restores the complete timeline. Timeline zoom is view-only and never changes choreography timing or exported data. The mouse wheel keeps its normal scrolling behavior over both the timeline and stage.

Select two or more dancers and activate **Align to path**, or press **A**, to draw a freeform curve. Hold Shift while dragging to snap the path to a perfectly straight line. Labeled ghost markers preview the result before the dancers are evenly placed along the path.

Press **Space** while focus is outside a text-entry control to play or pause the choreography.

The thin dashed **Timeline notes** line below the timeline adds text notes at the clicked time, including when the timeline is zoomed. Clicking a formation dot or one of the recorded times below the timeline pins the next note to that exact formation time; the visible hint shows the pinned time. Choose **Use clicked time**, or move the playhead to a different time, to return to placing notes anywhere along the line. Keyboard users can focus the line and press Enter to add a note at the current time.

**Always visible** shows the full note text by default. Turn it off to show square notepad icons instead; click an icon or visible note to edit its text/time or delete it. Nearby notes wrap to the available width and stack when needed; icons at nearby or identical times also stack so each remains clickable. Adding, editing, deleting, and changing note visibility are undoable. Notes and their exact times survive autosave, JSON, and complete-project export/import; notes never change dancer formations. A timeline cannot be shortened past its last note, and loading shorter media keeps later notes accessible without removing the media. Projects support up to 500 notes, each up to 2,000 characters.

If audio or video playback fails, the attachment stays in the project and in complete exports. Playback pauses safely; press **Play** to reload the retained file and retry from the current playhead. Remove or replace the attachment if the file itself cannot be decoded.

Audio and video remain local to the device. **Export JSON** creates a portable choreography-only plan. **Export complete** creates a validated `.formation` package containing the choreography, stage dimensions, volume settings, audio, and video. Complete web packages are bounded to 1 GB. Import accepts both formats, including `.formation.zip` downloads; JSON import keeps currently loaded media, while complete-project import replaces it with the packaged media. Version 5 marks the current coordinate convention and includes the stage dimensions introduced in version 4. Older version 1–3 projects remain supported and open at 1× width and 1× depth. Music and video have independent volume controls. The app starts in dark mode and remembers any later theme choice in that browser.

The interface adapts automatically to narrow screens and touch input. Mobile layouts use larger touch targets, reorganized transport controls, a cast-first side panel, and stage scrolling that remains available outside draggable dancer markers.

On touch phones in landscape orientation, the stage and transport occupy the left side beside a height-matched, scrollable video and music panel. Dancer setup moves into its own full-width panel beneath both columns.

## Test it

```bash
npm test
```

Run the desktop regressions with `npm run test:desktop`. They launch Electron in isolated temporary profiles and use mouse and keyboard input to check project and dancer names, focus while saving edits, shortcut handling while typing, timeline dots and recorded-time navigation, preview locks, history, and confirmation dialogs. Legacy checks cover old layouts, current v4/v5 projects, repeated conversion/import/reload, ambiguous autosave recovery, undo/redo, and byte-identical media export. Playback checks cover repeated stage flips, sustained playback, decoder errors, retained-media export, complete-project import with different media loading orders, retry, cancellation, seeking, and media replacement. Transition-hold checks cover Ctrl-click and Select all, H inside and outside an edit, repeated previews, moving after a hold preview, Cancel/Apply, single-action group undo/redo, preserved later formations, playback, export/reimport, ordinary holds, and autosave reopening. Note checks cover exact formation times, click placement while zoomed, text/icon visibility, desktop and narrow-screen collision-free wrapping, duplicate-time notes, safe text rendering, keyboard input, preview locks, history, media-preserving export/import, autosave reopening, and timeline-length protection. The Windows build runs all six regressions before packaging.

## Windows desktop edition

The Windows edition uses the same local-first editor and `.formation` files as the web edition. Its Electron renderer is sandboxed, has no Node access, uses context isolation, denies permission requests and navigation, and loads only the allowlisted local application files.

Download the latest Windows x64 edition:

- [Installer](https://github.com/dyjagger/choreographyhelper/releases/latest/download/Formation-Studio-Setup-Windows-x64.exe)
- [Portable ZIP](https://github.com/dyjagger/choreographyhelper/releases/latest/download/Formation-Studio-Windows-x64.zip)

Run the desktop edition during development:

```bash
npm ci
npm run desktop:start
```

Create a hardened package for the current operating system:

```bash
npm run desktop:package
```

The **Build Windows desktop app** GitHub Actions workflow packages Windows x64, verifies dependencies and tests, creates a portable ZIP, and builds a per-user Inno Setup installer. The installer associates `.formation` files with Formation Studio. Test installers are unsigned; a public release should be code-signed with publisher-owned credentials that are never committed to this repository.
