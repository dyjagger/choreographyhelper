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

1. Add a dancer.
2. Move the timeline to a time.
3. Drag the dancer to the desired stage position. Dropping records a position keyframe.
4. Move later in the timeline and drag the dancer again.
5. Press play to see a straight-line movement between the positions.

Use the **Go to** field or a recorded-position time to move the playhead to an exact second. Dancer names can be edited beside the selected dancer controls. Undo and redo buttons cover formation edits, and Ctrl/Cmd+Z plus Ctrl/Cmd+Shift+Z work whenever focus is outside an input field.

Use **New project** to clear the title, dancers, recorded positions, and playhead after a confirmation. The reset is undoable and keeps locally loaded music or video in place.

Up to 50 dancers are supported. Audio and video files remain local to the browser and are not included in exported choreography JSON files or edit history. Choreography data is autosaved in the browser and can also be exported or imported as JSON. Importing asks for confirmation, remains undoable, and keeps loaded local media in place. Music and video have independent volume controls. The light/dark appearance toggle follows the device preference on first use and then remembers the user's choice in that browser.

The interface adapts automatically to narrow screens and touch input. Mobile layouts use larger touch targets, reorganized transport controls, a cast-first side panel, and stage scrolling that remains available outside draggable dancer markers.

## Test it

```bash
npm test
```
