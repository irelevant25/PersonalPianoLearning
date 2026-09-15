---
name: piano-learning-app
description: Use for any development work on this repo (PersonalPianoLearning) - new features, bug fixes, learning-path/curriculum/song changes, or anything touching MIDI, notation, SRS scheduling, the learning path, or the practice views. Load this before making changes so conventions and known gotchas aren't rediscovered from scratch.
---

# Piano Learning App - project skill

Interactive piano-practice app for a KAWAI ES120 (or any class-compliant
USB-MIDI keyboard). Browser talks to the piano directly via the Web MIDI
API; Node/Express only serves files and persists progress as local JSON
(no database, no cloud). Read [README.md](../../../README.md) first for the
user-facing picture (how to run, how it works, current state) - this file
is the implementer's supplement: conventions, architecture, and gotchas
that cost time to rediscover.

**Keep this file current.** After any change, update this skill, the root
`CLAUDE.md`, `.claude/agents/piano-dev.md` and README "Current state" where
they're affected - the user explicitly wants the knowledge base maintained
with every change.

## Architecture

```
shared/            Pure JS, imported identically by server (Node) and
                    browser (served statically at /shared). Single source
                    of truth - never fork this logic between frontend/backend.
  theory.js         MIDI <-> note-name conversions, CURRICULUM (note
                    introduction order), clef assignment.
  srs.js            SM-2-style adaptive scheduler: grading, note-state
                    updates, practice-queue selection, unlock checks,
                    due-note count.
  songs.js          Song library + unlock-check helper.
  path.js           Learning path: PHASES -> units -> steps, PASS_ACCURACY,
                    unlock/next-step logic, drill-round and melody
                    generators, NOTE_HINTS. See "Learning path" below.

server/
  index.js           Express app: static file serving + /api routes.
                      PORT env var overrides package.json config.port.
  routes/api.js       GET /api/state ({progress, sessions, path}),
                      PUT /api/progress, PUT /api/path, POST /api/sessions.
  lib/storage.js      Whole-file JSON read/write under server/data/
                       (atomic write-then-rename). No DB. PIANO_DATA_DIR
                       env var points it at another directory (tests).
  data/                progress.json (per-note SRS), sessions.json (log),
                       path.json (path step results). These ARE tracked in
                       git (user's choice, commit 2565eb3) - never commit
                       test data over them. Delete them to reset progress.

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
                        multi-measure sequence rendering). Tags every drawn
                        note's SVG group with data-midi (used by tests).
  js/metronome.js      Click track; also converts each beat's AudioContext
                        time into a performance.now() timestamp so MIDI
                        note-on events can be graded against it directly.
                        stop() silences already-scheduled clicks.
  js/sequence-player.js SequencePlayer: renders a note sequence, highlights
                        the current note, grades MIDI input, updates SRS.
                        Modes 'tempo' (metronome, pitch+timing) and 'wait'
                        (no clock, waits for the right note, first-try
                        accuracy, key hint after 2 misses). Used by sheet,
                        songs and the lesson view - don't re-implement a
                        player loop in a view.
  js/api.js            fetch wrappers for the /api routes.
  js/app.js            Boots the app, owns the MIDI connection + router.
                        Exposes `window.pianoMIDI` for devtools/testing.
                        navigateTo(name, params) - params go to the view.
                        saveProgress/savePathProgress chain PUTs in order.
  js/views/*.js        home ("Learn" = the path), lesson (runs one path
                        step), trainer (Note Trainer), sheet (Sheet
                        Practice), songs (Songs), stats. Each exports
                        `render(container, ctx, params) -> destroy()`.
                        `ctx` is built once in app.js (see there for its shape).
```

## Learning path (the main flow)

Duolingo-style: words -> sentences -> story. Home ("Learn" nav) shows a
Continue button, every phase with its units and step chips, a "notes due
for review" banner (links to Note Trainer), and free-practice buttons.

- **Structure** (`shared/path.js`): `PHASES[]` -> `units[]` -> `steps[]`.
  Every unit uses the same step ladder, built by `unit()`:
  `meet` (only if the unit has new notes) -> `drill` -> `read` -> `tempo` -> `song`.
  - meet: each new note shown on staff + blue key + NOTE_HINTS text; play it 3x. Not graded (accuracy 100), no SRS update, no session.
  - drill: 10 flashcards, staff only (no name), ~40% new notes, rest older notes of the phase ordered by due date, never the same note twice in a row. Updates SRS.
  - read: 8-note melody from `generateMelody` (stepwise, starts/ends on the lowest pool note, contains every new note), SequencePlayer 'wait' mode.
  - tempo: fresh melody, SequencePlayer 'tempo' mode, 50-80 BPM (default 60).
  - song: the unit's song, 60/80/100% tempo (default 80%). Optional no-clock practice run that does NOT count; only the metronome run finishes the step.
- **Pass rule:** a step passes when its *best* accuracy >= `PASS_ACCURACY`
  (80). Steps unlock strictly in order across the whole path; retries are
  unlimited; a passed step stays passed if a replay scores lower.
- **Note pool** of a unit = all `newNotes` of that phase's units up to and
  including it (`notePoolForUnit`). Songs must only use pool notes and should
  use every new note of their unit - the check script below asserts this.
- **Persistence:** `server/data/path.json` = `{ steps: { "rh-2/drill": {attempts, lastAccuracy, bestAccuracy, passedAt, updatedAt} } }`.
  Step keys are `unitId/stepId` - renaming a unit or step id orphans saved progress, so don't.
- **Sessions** from lesson steps are logged with `mode: 'lesson'`, `label`, `unitId`, `stepId` (Stats shows `Lesson: <label>`).
- **CURRICULUM order must match the path's new-note order** (right hand
  first, then left hand). Free Note Trainer introduces notes in CURRICULUM order.
- Later phases are listed with `comingSoon: true` and no units; Home renders them as dashed "Coming soon" rows.

### Roadmap (agreed with the user, build one phase at a time, user tries each before the next)

| # | Phase (id) | Units | App capability needed first |
|---|---|---|---|
| 1 | Right hand (`right-hand`) - **done** | C D E -> G -> F -> A -> B C5, songs Hot Cross Buns, Mary, Ode to Joy, Twinkle, Joy to the World | - |
| 2 | Left hand (`left-hand`) | C3 D3 E3 -> F3 G3 -> A3 B3, simple tunes an octave lower | Bass clef in `Notation.renderSequence` (use `clefForMidi` / a clef option), phase.keyboard range lower, NOTE_HINTS for LH notes, bass-clef songs in songs.js |
| 3 | Both hands (`hands-together`) | alternate hands, then held LH note + RH melody | Grand staff rendering (treble + bass StaveConnector), sequences with simultaneous notes, grading two voices |
| 4 | Left-hand chords (`left-hand-chords`) | C, F, G triads | Chord detection (several note-ons within ~150 ms window graded as one event), chord SRS items (not just midi keys), half/whole note durations in Notation |
| 5 | Right-hand chords (`right-hand-chords`) | same chords RH | reuses 4 |
| 6 | Melody and chords (`melody-and-chords`) | RH melody over LH chords | reuses 3 + 4 |

Pass rule and step ladder stay the same in every phase. New step types
(e.g. a chord drill) go into `STEP_TYPES` + `STEP_RENDERERS` in `lesson.js`.

## Conventions

- **Vanilla JS/CSS only**, ES modules, no build step, no frontend
  framework - matches the project's original brief. Don't introduce
  bundlers/React/etc. without the user asking.
- **No database.** All persistence is flat JSON files via
  `server/lib/storage.js`. If you need new persisted state, add a field
  to the progress/session shape or a new top-level file - don't reach for
  SQLite/etc.
- **SRS logic lives only in `shared/srs.js`; path logic only in
  `shared/path.js`.** Views compute grades/updated state with those modules
  and PUT the result; the server just persists. Don't duplicate unlock or
  grading logic in a view or move it server-side.
- **View teardown matters.** Every view's `render()` must return a
  `destroy()` that removes any `ctx.midi` listeners it added (and clears
  pending timers) - app.js calls this on navigation. Sub-navigation
  *within* a view needs its own cleanup handoff: `nav.cleanup` in
  `songs.js`, `destroyBody` in `lesson.js` (step renderer <-> result screen).
  SequencePlayer adds its own listener - always call `player.destroy()`.
- **Curriculum is intentionally small (C3-C5 diatonic).** See
  `shared/theory.js` CURRICULUM and "Extending the curriculum" below
  before widening it.
- UI text is plain, short and encouraging - the user is a beginner and a
  non-native English speaker.

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
- **Don't `await` saves inside a MIDI handler before advancing.** The old
  sheet/songs handlers awaited `saveProgress` before `index += 1`, so two
  fast key presses were both graded against the same note. Advance state
  synchronously and fire the save; `ctx.saveProgress` chains PUTs so they
  still land in order.
- **Metronome clicks outlive the view** unless stopped - scheduled Web
  Audio oscillators keep ticking after navigation/restart. SequencePlayer
  calls `metronome.stop()` on start/stop/destroy.
- **Drill "no repeats" needs a constructive shuffle.** Plain re-shuffling
  left ~50% of rounds with back-to-back repeats when one note is ~half the
  round; `spreadOut` in path.js picks only notes that keep a repeat-free
  completion possible.

## Known issues (not fixed yet)

- **Every key press is a full SM-2 review, even seconds apart.** One path
  unit gives C/D/E ~15-30 graded attempts, so they reach `mastered` with
  10+ day intervals after a single sitting (seen in the 2026-09-15 test
  run). The "due for review" banner then stays quiet for days. A fix would
  count at most one SRS review per note per session/day (or only grow the
  interval once the note is actually due) in `shared/srs.js` - discuss
  with the user before changing scheduler behavior.
- **Tempo mode stalls if a note is skipped entirely** - the player only
  advances on key presses. The lesson "In time" step has a Restart button;
  a beat-driven advance would be the real fix.

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
Read what's on the staff with `.vf-stavenote[data-midi]` (in DOM order =
play order), e.g. `#dr-notation .vf-stavenote[data-midi]` for the current
drill prompt.

**Never test against the learner's real data** (server/data is tracked):

```bash
PORT=3099 PIANO_DATA_DIR=<scratchpad>/testdata node server/index.js
```

Tooling that works on the user's Windows machine: no global Playwright,
but Chrome and Edge are installed - `npm i playwright-core` in the
scratchpad and `chromium.launch({ channel: 'chrome', headless: true })`
(no browser download needed). Last full pass (2026-09-15): pure checks of
path.js (structure, unlock rules, songs fit pools, 500x drill/melody
generation) + an e2e run through all of Unit 1 (meet with a wrong key,
drill failing at 70% then passing, read with misses -> 88%, tempo, song
practice run not counting, metronome run -> "Unit complete"), then Sheet,
Songs, Trainer and Stats regression, asserting on `GET /api/state` and
zero page errors.

`navigator.requestMIDIAccess()` itself typically rejects in headless
Chromium even with `context.grantPermissions(['midi'])` - that's a
headless-environment limitation, not an app bug; the app already handles
the rejection gracefully (shows the error text in the status pill instead
of crashing), which is the property worth testing, not the permission
grant itself.

## Extending the curriculum

Currently: 15 white keys, C3-C5 (see `shared/theory.js` `CURRICULUM`);
the path uses the 8 right-hand ones. Sheet/song rendering is
treble-clef-only (`public/js/notation.js`) - the blocker for path phase 2.

Extension points (the path roadmap above decides the order):
1. **Bass clef in sheets/songs.** `shared/theory.js` `clefForMidi` already
   exists and is used by the single-note flashcard view; `renderSequence`
   needs a bass-clef code path (and sheet-generation in
   `public/js/views/sheet.js` would need to stop filtering to `midi >= 60`).
2. **Sharps/flats.** Add midi numbers to `CURRICULUM`; `midiToVexKey`/
   `midiToName` already handle accidentals correctly (`SHARP_NAMES`), and
   `Notation._buildNote` already adds a VexFlow `Accidental` when the key
   contains `#`. Flats aren't distinguished from sharps yet (everything
   is spelled sharp) - a key-signature-aware speller would be needed later.
3. **Wider range** (below A2 / above C5) - extend `CURRICULUM` and the
   keyboard's `lowMidi`/`highMidi` (per phase: `phase.keyboard`).
4. **More songs** - add entries to `shared/songs.js` `SONGS` and reference
   them from a unit; keep using `seq()` (all quarter notes) until rhythm
   variety lands in `Notation.renderSequence` (needed by phase 4 anyway).
