# Piano Learning

An interactive piano tutor for learning to read and play notes on a real
piano — built around a **KAWAI ES120** (or any class-compliant USB-MIDI
keyboard) plugged straight into your PC. The browser talks to the piano
directly; there's a small Node server for the app itself and for saving
your progress. No cloud, no database — everything is stored locally as
JSON files on your machine.

## How to run

1. Download the project (ZIP via GitHub's "Code → Download ZIP", or
   `git clone` if you're developing) and extract/open it.
2. Plug your piano into the PC via USB.
3. Run the launcher:
   - Windows: double-click `start.ps1` (or run `.\start.ps1` in PowerShell)
   - macOS/Linux: `./start.sh`

   It installs everything it needs on first run and then opens the app in
   your browser automatically. Press `Ctrl+C` in that terminal to stop it.
4. Use **Chrome or Edge** (required — see [Browser support](#browser-support)).
5. In the header, pick your piano from the device dropdown and click
   **Connect**.

## How it works

- **MIDI connection is direct and local.** The frontend uses the
  browser's [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
  to read note-on/note-off events straight from the piano — no backend,
  no driver installation beyond your OS's standard USB-MIDI support.
  This is also why the project doesn't need .NET or any native MIDI
  library: the browser already exposes everything required.
- **Note Trainer** teaches individual notes with an adaptive schedule —
  the same idea as spaced-repetition language apps (Anki, etc.), adapted
  for piano: each attempt is graded on correctness *and* how quickly/on
  time you played it, and that grade decides when the note comes back
  around. Notes you nail repeatedly get spaced further apart; notes you
  miss come back sooner. New notes are introduced one at a time, in a
  fixed curriculum order (see `shared/theory.js`), so you're never
  swamped with too many unfamiliar notes at once.
- **Sheet Practice** generates a short, original sight-reading exercise
  using *only* the notes you currently know, renders it as real staff
  notation, and grades both pitch and timing against a metronome as you
  play through it. It needs at least 3 known notes to have enough
  material to work with.
- **Songs** is a small curated library of beginner pieces (Hot Cross
  Buns, Mary Had a Little Lamb, Ode to Joy's opening phrase, Twinkle
  Twinkle). Each one unlocks automatically the moment you know every note
  it uses — no manual progression needed.
- **Stats** shows a keyboard heatmap of your mastery per note, overall
  accuracy, day streak, minutes practiced, and your session history. This
  is the shared source of truth for *your* piano progress — check it any
  time to see where you actually stand, independent of how a given
  practice round felt in the moment.

### Data & privacy

All practice history lives in `server/data/*.json` (progress per note,
session log) — never sent anywhere except your own local server. These
files are gitignored on purpose. To reset your progress entirely, stop
the server and delete `server/data/progress.json` and
`server/data/sessions.json`.

## Current state

Implemented and working end-to-end (verified with a scripted Playwright
run simulating MIDI input — see the project skill for how, since there's
no real piano attached in a dev sandbox):

- MIDI connect/disconnect UI, remembers your last device.
- Note Trainer: adaptive note introduction + SM-2-style spaced repetition,
  round-based practice with live accuracy, session logging.
- Sheet Practice: generated sight-reading from known notes, metronome
  count-in, per-note pitch + timing grading.
- Songs: 4 starter songs, auto-unlock, adjustable tempo (75%/100%/125% of
  the original), same grading as Sheet Practice.
- Stats: keyboard mastery heatmap, accuracy, streak, minutes practiced,
  session history table.

Curriculum currently covers **15 white keys, C3–C5** (two diatonic
octaves around Middle C) — enough to unlock all 4 starter songs. Sharps
and flats, a wider key range, and bass-clef sheet/song rendering are
deliberate follow-ups, not oversights — see "Extending the curriculum" in
the project skill (`.claude/skills/piano-learning-app/SKILL.md`) for
exactly where each hooks in.

## Browser support

Requires **Chrome or Edge** (or another Chromium-based browser) —
Firefox and Safari don't implement the Web MIDI API. The app detects this
and shows a clear message rather than failing silently.

## Project structure

```
shared/         Note-name/MIDI conversions, SRS scheduler, song library.
                Used identically by the server and the browser.
server/         Express app: static file serving, JSON-file persistence
                under server/data/ (no database).
public/         Frontend: vanilla JS/CSS, no build step, no framework.
  js/midi.js      Web MIDI wrapper
  js/keyboard.js  On-screen piano keyboard (SVG)
  js/notation.js  Staff notation rendering (VexFlow)
  js/metronome.js Click track + timing reference
  js/views/       One module per screen (home, trainer, sheet, songs, stats)
```

For architecture details, conventions, and known gotchas when making
changes here, see the project skill:
`.claude/skills/piano-learning-app/SKILL.md` — it's written to be loaded
before any development work on this repo (there's also a matching
`piano-dev` subagent preconfigured to load it automatically).
