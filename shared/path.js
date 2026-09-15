// Guided learning path, Duolingo-style: phases -> units -> steps.
// Every unit walks the same ladder - meet the new notes, drill them as
// flashcards, read a short melody, play it in time, then play a real song -
// so each unit goes from single notes ("words") to melodies ("sentences") to
// a song ("story"). Steps unlock strictly in order; a step counts as passed
// once its best accuracy reaches PASS_ACCURACY, and stays passed on replay.
//
// Pure data + logic, shared by server and browser like the rest of shared/.

import { nameToMidi } from './theory.js';
import { SONGS } from './songs.js';

export const PASS_ACCURACY = 80;

export const STEP_TYPES = {
  meet: { title: 'Meet the notes', short: 'Meet' },
  drill: { title: 'Note drill', short: 'Drill' },
  read: { title: 'Read a melody', short: 'Read' },
  tempo: { title: 'Play in time', short: 'In time' },
  song: { title: 'Song', short: 'Song' },
};

/** Where each right-hand note sits on the keyboard, shown when it's introduced. */
export const NOTE_HINTS = {
  60: 'Middle C: the white key just left of the two black keys, near the middle of your piano.',
  62: 'D sits between the two black keys.',
  64: 'E is just right of the two black keys.',
  65: 'F is just left of the three black keys.',
  67: 'G sits between the first and second of the three black keys.',
  69: 'A sits between the second and third of the three black keys.',
  71: 'B is just right of the three black keys.',
  72: 'This C is one octave above Middle C - the next C to the right.',
};

function unit(id, title, newNoteNames, songId) {
  const steps = [];
  if (newNoteNames.length) steps.push({ id: 'meet', type: 'meet' });
  steps.push(
    { id: 'drill', type: 'drill' },
    { id: 'read', type: 'read' },
    { id: 'tempo', type: 'tempo' },
    { id: 'song', type: 'song', songId },
  );
  return { id, title, newNotes: newNoteNames.map(nameToMidi), steps };
}

// Later phases are listed (comingSoon, no units) so the learner can see the
// whole journey; each one needs new app capabilities before its units can be
// written - see the project skill's "Learning path roadmap".
export const PHASES = [
  {
    id: 'right-hand',
    title: 'Right hand',
    description: 'Learn the notes from Middle C up to the next C, one small group at a time.',
    keyboard: { lowMidi: 48, highMidi: 84 },
    units: [
      unit('rh-1', 'C, D, E', ['C4', 'D4', 'E4'], 'hot-cross-buns'),
      unit('rh-2', 'G', ['G4'], 'mary-had-a-little-lamb'),
      unit('rh-3', 'F', ['F4'], 'ode-to-joy'),
      unit('rh-4', 'A', ['A4'], 'twinkle-twinkle'),
      unit('rh-5', 'B and high C', ['B4', 'C5'], 'joy-to-the-world'),
    ],
  },
  { id: 'left-hand', title: 'Left hand', comingSoon: true, units: [], description: 'The same steps for the left hand, reading the bass clef: C3 to G3, then A3 and B3.' },
  { id: 'hands-together', title: 'Both hands', comingSoon: true, units: [], description: 'Melodies passed between the hands, then both hands playing at the same time.' },
  { id: 'left-hand-chords', title: 'Left-hand chords', comingSoon: true, units: [], description: 'C, F and G chords in the left hand.' },
  { id: 'right-hand-chords', title: 'Right-hand chords', comingSoon: true, units: [], description: 'The same chords in the right hand.' },
  { id: 'melody-and-chords', title: 'Melody and chords', comingSoon: true, units: [], description: 'A right-hand melody over left-hand chords.' },
];

PHASES.forEach((phase, p) => {
  phase.number = p + 1;
  phase.units.forEach((u, i) => { u.number = i + 1; u.phaseId = phase.id; });
});

/** Every step of the path in the order it must be completed. */
export const PATH_STEPS = PHASES.flatMap((phase) => phase.units.flatMap((u) => u.steps.map((step) => ({
  key: stepKey(u.id, step.id),
  phase,
  unit: u,
  step,
}))));

export function stepKey(unitId, stepId) {
  return `${unitId}/${stepId}`;
}

export function findStep(unitId, stepId) {
  return PATH_STEPS.find((e) => e.key === stepKey(unitId, stepId)) || null;
}

export function findUnit(unitId) {
  for (const phase of PHASES) {
    const u = phase.units.find((x) => x.id === unitId);
    if (u) return u;
  }
  return null;
}

export function songForStep(step) {
  return SONGS.find((s) => s.id === step.songId) || null;
}

export function createInitialPathProgress() {
  return { steps: {} };
}

export function getStepRecord(pathProgress, key) {
  return pathProgress?.steps?.[key] || null;
}

export function isStepPassed(pathProgress, key) {
  const record = getStepRecord(pathProgress, key);
  return !!record && record.bestAccuracy >= PASS_ACCURACY;
}

function firstOpenIndex(pathProgress) {
  const i = PATH_STEPS.findIndex((e) => !isStepPassed(pathProgress, e.key));
  return i === -1 ? PATH_STEPS.length : i;
}

/** A step is playable once every step before it has been passed. */
export function isStepUnlocked(pathProgress, key) {
  const i = PATH_STEPS.findIndex((e) => e.key === key);
  return i !== -1 && i <= firstOpenIndex(pathProgress);
}

/** The first step not yet passed, or null when the whole available path is done. */
export function getNextStep(pathProgress) {
  return PATH_STEPS[firstOpenIndex(pathProgress)] || null;
}

/** The step that follows `key` in path order (may belong to the next unit), or null. */
export function getStepAfter(key) {
  const i = PATH_STEPS.findIndex((e) => e.key === key);
  return i === -1 ? null : PATH_STEPS[i + 1] || null;
}

/** 'done' | 'current' | 'locked' */
export function getUnitStatus(pathProgress, u) {
  if (u.steps.every((s) => isStepPassed(pathProgress, stepKey(u.id, s.id)))) return 'done';
  return isStepUnlocked(pathProgress, stepKey(u.id, u.steps[0].id)) ? 'current' : 'locked';
}

/** Returns a new path progress object with one step attempt applied. */
export function recordStepResult(pathProgress, key, accuracy, now = new Date()) {
  const prev = getStepRecord(pathProgress, key);
  const bestAccuracy = Math.max(prev?.bestAccuracy ?? 0, accuracy);
  const record = {
    attempts: (prev?.attempts ?? 0) + 1,
    lastAccuracy: accuracy,
    bestAccuracy,
    passedAt: prev?.passedAt ?? (bestAccuracy >= PASS_ACCURACY ? now.toISOString() : null),
    updatedAt: now.toISOString(),
  };
  return { ...pathProgress, steps: { ...(pathProgress?.steps || {}), [key]: record } };
}

/** All notes a unit may use: its own new notes plus those of earlier units in the same phase. */
export function notePoolForUnit(unitId) {
  for (const phase of PHASES) {
    const i = phase.units.findIndex((u) => u.id === unitId);
    if (i !== -1) return [...new Set(phase.units.slice(0, i + 1).flatMap((u) => u.newNotes))].sort((a, b) => a - b);
  }
  return [];
}

function shuffle(arr, random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Random order in which the same note never appears twice in a row whenever
 * the mix allows it: each slot is drawn (weighted by how many copies are
 * left) only from notes that still leave a repeat-free way to fill the rest.
 */
function spreadOut(notes, random) {
  const counts = new Map();
  for (const m of notes) counts.set(m, (counts.get(m) || 0) + 1);
  const out = [];
  while (out.length < notes.length) {
    const last = out[out.length - 1];
    const left = notes.length - out.length - 1; // slots left after this pick
    const available = [...counts].filter(([m, c]) => c > 0 && m !== last);
    const feasible = available.filter(([m]) => [...counts].every(([x, c]) => {
      const after = x === m ? c - 1 : c;
      return x === m ? after <= Math.floor(left / 2) : after <= Math.ceil(left / 2);
    }));
    const options = feasible.length ? feasible : available.length ? available : [...counts].filter(([, c]) => c > 0);
    let r = random() * options.reduce((sum, [, c]) => sum + c, 0);
    const [pick] = options.find(([, c]) => (r -= c) < 0) || options[options.length - 1];
    out.push(pick);
    counts.set(pick, counts.get(pick) - 1);
  }
  return out;
}

/**
 * Flashcard prompts for a drill step: about 40% of the prompts are the unit's
 * new notes, the rest reinforce earlier notes of the phase - those the
 * scheduler wants to see soonest (overdue or never practiced) come first.
 */
export function buildDrillRound(u, progressMap, length = 10, random = Math.random) {
  const pool = notePoolForUnit(u.id);
  const older = pool
    .filter((m) => !u.newNotes.includes(m))
    .sort((a, b) => dueTime(progressMap[a]) - dueTime(progressMap[b]));

  const newCount = older.length === 0 ? length : u.newNotes.length === 0 ? 0 : Math.max(u.newNotes.length, Math.round(length * 0.4));
  const prompts = [];
  for (let i = 0; i < newCount; i++) prompts.push(u.newNotes[i % u.newNotes.length]);
  for (let i = 0; prompts.length < length; i++) prompts.push(older[i % older.length]);
  return spreadOut(prompts, random);
}

function dueTime(state) {
  return state?.dueAt ? new Date(state.dueAt).getTime() : 0;
}

/**
 * A short, singable melody over `pool`: moves mostly by step (occasionally a
 * skip), starts and ends on the lowest note (the "home" note, C for the right
 * hand), and includes every note in `mustInclude` at least once.
 */
export function generateMelody(pool, length = 8, mustInclude = [], random = Math.random) {
  const notes = [...pool].sort((a, b) => a - b);
  if (notes.length === 1) return Array(length).fill(notes[0]);

  // Try a batch of random walks and keep the most singable one, rather than
  // forcing new notes into a walk afterwards (which creates awkward leaps).
  let melody = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 200 && bestScore > 0; attempt++) {
    const candidate = randomWalk(notes, length, random);
    const score = melodyScore(candidate, notes, mustInclude);
    if (score < bestScore) {
      melody = candidate;
      bestScore = score;
    }
  }

  // Safety net for tiny lengths where no walk can reach a must-include note.
  const inner = Array.from({ length: Math.max(0, length - 2) }, (_, i) => i + 1);
  for (const m of mustInclude) {
    if (melody.includes(m) || inner.length === 0) continue;
    const spots = inner.filter((i) => melody[i - 1] !== m && melody[i + 1] !== m && !mustInclude.includes(melody[i]));
    const choices = spots.length ? spots : inner;
    melody[choices[Math.floor(random() * choices.length)]] = m;
  }
  return melody;
}

function randomWalk(notes, length, random) {
  const idx = [0];
  while (idx.length < length - 1) {
    const cur = idx[idx.length - 1];
    const r = random();
    let move = r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.85 ? 2 : -2;
    if (cur + move < 0 || cur + move >= notes.length) move = -move;
    idx.push(Math.min(notes.length - 1, Math.max(0, cur + move)));
  }
  idx.push(0);
  return idx.map((i) => notes[i]);
}

/** 0 = ideal: has every must-include note, never repeats a note back-to-back, steps (or a small skip) into the final home note. */
function melodyScore(melody, notes, mustInclude) {
  let score = mustInclude.filter((m) => !melody.includes(m)).length * 100;
  for (let i = 1; i < melody.length; i++) if (melody[i] === melody[i - 1]) score += 10;
  if (notes.indexOf(melody[melody.length - 2]) > 2) score += 5;
  return score;
}
