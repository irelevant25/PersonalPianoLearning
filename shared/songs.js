// Starter song library. Every song uses only notes from the C3-C5 diatonic
// curriculum in shared/theory.js so the earliest-learned notes are already
// enough to unlock something musical. Add more songs here as the curriculum
// grows (see README "Extending the curriculum").

import { nameToMidi } from './theory.js';

function seq(names, durationBeats = 1) {
  let beat = 0;
  return names.map((n) => {
    const note = { midi: nameToMidi(n), beat, durationBeats };
    beat += durationBeats;
    return note;
  });
}

export const SONGS = [
  {
    id: 'hot-cross-buns',
    title: 'Hot Cross Buns',
    bpm: 90,
    timeSignature: '4/4',
    notes: seq(['E4', 'D4', 'C4', 'E4', 'D4', 'C4', 'C4', 'C4', 'C4', 'C4', 'D4', 'D4', 'D4', 'D4', 'E4', 'D4', 'C4']),
  },
  {
    id: 'mary-had-a-little-lamb',
    title: 'Mary Had a Little Lamb',
    bpm: 100,
    timeSignature: '4/4',
    notes: seq(['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4', 'D4', 'D4', 'D4', 'E4', 'G4', 'G4']),
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy (opening phrase)',
    bpm: 100,
    timeSignature: '4/4',
    notes: seq(['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4']),
  },
  {
    id: 'twinkle-twinkle',
    title: 'Twinkle Twinkle Little Star (opening)',
    bpm: 100,
    timeSignature: '4/4',
    notes: seq(['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4']),
  },
];

/** Unique MIDI notes a song requires, used to decide when it unlocks. */
export function requiredNotes(song) {
  return [...new Set(song.notes.map((n) => n.midi))];
}

/** A song unlocks once every note it uses is known (per isKnown(midi)). */
export function isSongUnlocked(song, isKnown) {
  return requiredNotes(song).every(isKnown);
}
