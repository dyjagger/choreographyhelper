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

Up to 50 dancers are supported. Audio and video files remain local to the browser and are not included in exported choreography JSON files. Choreography data is autosaved in the browser and can also be exported or imported as JSON. Music and video have independent volume controls.

## Test it

```bash
npm test
```
