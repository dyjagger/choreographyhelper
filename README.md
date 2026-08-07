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

Use the **Go to** field or a recorded-position time to move the playhead to an exact second. Dancer names can be edited directly in the cast list. Undo and redo buttons cover formation edits, and Ctrl/Cmd+Z plus Ctrl/Cmd+Shift+Z work whenever focus is outside an input field.

Use **New project** to permanently clear the choreography, loaded audio, and loaded video after a confirmation. Export anything you want to keep first.

Up to 50 dancers are supported. Edit dancer names directly in the cast list. Unnamed dancers use their number on the stage; named dancers use the first two characters of their name, such as `Ma` for Maya. The front of the stage can be shown at the top or bottom without rewriting saved keyframes.

Use the `−`, `100%`, and `+` controls, the mouse wheel, or a two-finger pinch to zoom the stage from 100% to 300%. Pinch movement also pans the zoomed view.

Use modifier-click or a desktop selection rectangle to select several dancers. On touch screens, tap dancers to add or remove them from the selection. **Select all** and **Clear** provide quick selection controls. Dragging any selected dancer or pressing an arrow key moves the selected formation as one rigid group and records one undoable edit at the current playhead time.

Select dancers and choose **Hold position** to freeze them from the current playhead time. Their dotted stage rings and the dotted timeline range show the active hold. Move to a later time and choose **End hold**; they then continue toward their next recorded destination. Hold and resume events are saved, exported, imported, and undoable.

Select two or more dancers and activate **Align to path** to draw a freeform curve. Hold Shift while dragging to snap the path to a perfectly straight line. Labeled ghost markers preview the result before the dancers are evenly placed along the path.

Audio and video remain local to the device. **Export JSON** creates a portable choreography-only plan. **Export complete** creates a validated `.formation` package containing the choreography, volume settings, audio, and video. Complete web packages are bounded to 1 GB. Import accepts both formats; JSON import keeps currently loaded media, while complete-project import replaces it with the packaged media. Music and video have independent volume controls. The app starts in dark mode and remembers any later theme choice in that browser.

The interface adapts automatically to narrow screens and touch input. Mobile layouts use larger touch targets, reorganized transport controls, a cast-first side panel, and stage scrolling that remains available outside draggable dancer markers.

On touch phones in landscape orientation, the stage and transport occupy the left side beside a height-matched, scrollable video and music panel. Dancer setup moves into its own full-width panel beneath both columns.

## Test it

```bash
npm test
```

## Windows desktop edition

The Windows edition uses the same local-first editor and `.formation` files as the web edition. Its Electron renderer is sandboxed, has no Node access, uses context isolation, denies permission requests and navigation, and loads only the allowlisted local application files.

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
