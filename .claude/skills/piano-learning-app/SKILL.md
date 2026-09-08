---
name: piano-learning-app
description: Use for any development work on this repo (PersonalPianoLearning) - new features, bug fixes, curriculum/song changes, or anything touching MIDI, notation, SRS scheduling, or the practice views. Load this before making changes so conventions and known gotchas aren't rediscovered from scratch.
---

# Piano Learning App - project skill

Interactive piano-practice app for a KAWAI ES120 (or any class-compliant
USB-MIDI keyboard). Browser talks to the piano directly via the Web MIDI
API; Node/Express only serves files and persists progress as local JSON
(no database, no cloud). Read [README.md](../../../README.md) first for the
user-facing picture (how to run, how it works, current state) - this file
is the implementer's supplement: conventions, architecture, and gotchas
that cost time to rediscover.

## Architecture

```
shared/            Pure JS, imported identically by server (Node) and
                    browser (served statically at /shared). Single source
                    of truth - never fork this logic between frontend/backend.
  theory.js         MIDI <-> note-name conversions, CURRICULUM (note
                    introduction order), clef assignment.
  srs.js            SM-2-style adaptive scheduler: grading, note-state
                    updates, practice-queue selection, unlock checks.
  songs.js          Starter song library + unlock-check helper.

server/
  index.js           Express app: static file serving + /api routes.
  routes/api.js       GET /api/state, PUT /api/progress, POST /api/sessions.
  lib/storage.js      Whole-file JSON read/write under server/data/
                       (atomic write-then-rename). No DB.
  data/                Generated at runtime, gitignored. Delete the two
                       JSON files here to reset a learner's progress.

public/
  index.html, css/style.css   App shell. MIDI connect UI lives in the
                                persistent header (app.js), not a view -
                                it must stay connected across navigation.
  js/midi.js           PianoMIDI: Web MIDI wrapper, EventTarget emitting
                        'noteon'/'noteoff' (performance.now()-stamped) and
                        'connected'/'devicechange'.
  js/keyboard.js       PianoKeyboard: SVG on-screen keyboard, colorable
                        per key (practice feedback or mastery heatmap).
  js/notation.js       Notation: thin VexFlow wrapper (single note or
                        multi-measure sequence rendering).
  js/metronome.js      Click track; also converts each beat's AudioContext
                        time into a performance.now() timestamp so MIDI
                        note-on events can be graded against it directly.
  js/api.js            fetch wrappers for the three /api routes.
  js/app.js            Boots the app, owns the MIDI connection + router.
                        Exposes `window.pianoMIDI` for devtools/testing.
  js/views/*.js        home, trainer (Note Trainer), sheet (Sheet
                        Practice), songs (Songs), stats. Each exports
                        `render(container, ctx) -> destroy()`. `ctx` is
                        built once in app.js (see there for its shape).
```

## Conventions

- **Vanilla JS/CSS only**, ES modules, no build step, no frontend
  framework - matches the project's original brief. Don't introduce
  bundlers/React/etc. without the user asking.
- **No database.** All persistence is flat JSON files via
  `server/lib/storage.js`. If you need new persisted state, add a field
  to the progress/session shape or a new top-level file - don't reach for
  SQLite/etc.
- **SRS logic lives only in `shared/srs.js`.** Frontend views compute the
  grade and updated note state themselves (via shared/srs.js) and PUT the
  result to the server, which just persists it. Don't duplicate grading
  logic in a view or move it server-side.
- **View teardown matters.** Every view's `render()` must return a
  `destroy()` that removes any `ctx.midi` listeners it added - app.js
  calls this on navigation. Sub-navigation *within* a view (e.g. songs.js:
  song list <-> player) needs its own internal cleanup handoff for the
  same reason - see the `nav.cleanup` pattern in `public/js/views/songs.js`.
- **Curriculum is intentionally small (C3-C5 diatonic).** See
  `shared/theory.js` CURRICULUM and "Extending the curriculum" below
  before widening it.

## Gotchas already hit (don't rediscover these)

- **`Renderer.Backends.SVG`, not `Renderer.Backend.SVG`.** VexFlow 5
  renamed this to plural; the singular is `undefined` and throws deep
  inside a draw call with a confusing stack.
- **Clear a VexFlow surface with `context.clear()`, not
  `container.replaceChildren()`.** The `Renderer` inserts its `<svg>`
  into the container once, in its constructor. Wiping the container's
  children on every redraw removes that same node from the DOM - later
  draws succeed against a *detached* element, so the container silently
  stays empty. `Notation` in `public/js/notation.js` already does this
  correctly; follow that pattern for any new rendering method.
- **Cap SM-2's ease factor and interval.** An uncapped ease factor
  compounds `intervalHours` exponentially under heavy repetition (a
  realistic case: drilling one note across several sessions), eventually
  overflowing JS's `Date` range and throwing `RangeError: Invalid time
  value` out of `updateNoteState`. `shared/srs.js` bounds both
  (`MIN/MAX_EASE_FACTOR`, `MAX_INTERVAL_HOURS`) - keep those bounds if you
  touch the scheduler.
- **New-note pacing counts only `status === 'learning'`**, not `review`,
  against `maxActiveNew` in `pickPracticeQueue`. Counting `review` too
  would block introducing note N+1 until note N is fully `mastered`
  (days/weeks away) instead of just past its initial acquisition -
  effectively freezing the curriculum for the average learner.

## Testing without real MIDI hardware

There's no piano attached in a dev/CI sandbox, so drive the app with a
synthetic MIDI event instead of trying to fake a `MIDIAccess` grant:

```js
// In a Playwright page.evaluate (or the browser devtools console):
window.pianoMIDI.dispatchEvent(new CustomEvent('noteon', {
  detail: { midi: 60, velocity: 100, timestamp: performance.now() },
}));
```

`window.pianoMIDI` (set in `app.js`) is the live `PianoMIDI` instance;
every practice view listens to it exactly like it would a real keyboard.
For a full pass: start the server, use Playwright/`chromium-cli` to
navigate each view, dispatch note-on events matching the on-screen
prompt/sequence, and assert on `GET /api/state` afterwards. See the "How
this was verified" note in README for the scenario this was last
exercised against (8 trainer rounds + 2 full songs, checking for thrown
errors and for `intervalHours`/`dueAt` staying sane).

`navigator.requestMIDIAccess()` itself typically rejects in headless
Chromium even with `context.grantPermissions(['midi'])` - that's a
headless-environment limitation, not an app bug; the app already handles
the rejection gracefully (shows the error text in the status pill instead
of crashing), which is the property worth testing, not the permission
grant itself.

## Extending the curriculum

Currently: 15 white keys, C3-C5 (see `shared/theory.js` `CURRICULUM`).
Sheet/song rendering is treble-clef-only (`public/js/notation.js`), so
notes below C4 render with several ledger lines - acceptable for now
since the curriculum's left-hand notes (C3-G3) are only used in Note
Trainer, not in generated sheets or songs.

Planned extension points, in the order they'd naturally come up:
1. **Sharps/flats.** Add midi numbers to `CURRICULUM`; `midiToVexKey`/
   `midiToName` already handle accidentals correctly (`SHARP_NAMES`), and
   `Notation._buildNote` already adds a VexFlow `Accidental` when the key
   contains `#`. Flats aren't distinguished from sharps yet (everything
   is spelled sharp) - fine for now, but a key-signature-aware speller
   would be a real improvement later.
2. **Bass clef in sheets/songs.** `shared/theory.js` `clefForMidi` already
   exists and is used by the single-note flashcard view; `renderSequence`
   would need a bass-clef code path (and sheet-generation in
   `public/js/views/sheet.js` would need to stop filtering to `midi >= 60`).
3. **Wider range** (below A2 / above C5) - extend `CURRICULUM` and the
   keyboard's default `lowMidi`/`highMidi` in each view.
4. **More songs** - add entries to `shared/songs.js` `SONGS`; keep using
   `seq()` for now (all quarter notes) until rhythm variety is worth the
   added complexity in `Notation.renderSequence` (currently quarter-notes-only).
