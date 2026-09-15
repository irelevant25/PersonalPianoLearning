// Pure music-theory helpers shared between the server (Node) and the
// browser frontend. No runtime dependencies, no side effects.

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const LETTER_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI note number -> scientific pitch name, e.g. 60 -> "C4". */
export function midiToName(midi) {
  const name = SHARP_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/** MIDI note number -> VexFlow key string, e.g. 60 -> "c/4", 61 -> "c#/4". */
export function midiToVexKey(midi) {
  const name = SHARP_NAMES[((midi % 12) + 12) % 12].toLowerCase();
  const octave = Math.floor(midi / 12) - 1;
  return `${name}/${octave}`;
}

/** Scientific pitch name -> MIDI note number, e.g. "C4" -> 60, "F#3" -> 54. */
export function nameToMidi(name) {
  const match = /^([A-Ga-g])(#|b)?(-?\d+)$/.exec(name.trim());
  if (!match) throw new Error(`Invalid note name: ${name}`);
  const [, letter, accidental, octaveStr] = match;
  let semitone = LETTER_SEMITONES[letter.toUpperCase()];
  if (accidental === '#') semitone += 1;
  if (accidental === 'b') semitone -= 1;
  const octave = parseInt(octaveStr, 10);
  return (octave + 1) * 12 + semitone;
}

export function isWhiteKey(midi) {
  return WHITE_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

// Lowest/highest keys of an 88-key piano (A0..C8), used to size the on-screen keyboard.
export const PIANO_LOWEST_MIDI = 21;
export const PIANO_HIGHEST_MIDI = 108;
export const MIDDLE_C = 60;

/**
 * Curriculum: the order in which notes are introduced.
 * Covers two diatonic (white-key only) octaves around Middle C: the whole
 * right hand first, then the left hand - the same order as the learning path
 * (shared/path.js), whose units introduce exactly these notes in this order.
 * Keep the two in sync. Sharps/flats and notes outside C3-C5 are a deliberate
 * extension point for later (see README "Extending the curriculum").
 */
export const CURRICULUM = [
  60, 62, 64, 67, 65, 69, // C4 D4 E4 G4 F4 A4 - right hand, in the order the path's songs need them
  71, 72, // B4 C5 - extend right hand upward
  48, 50, 52, 53, 55, // C3 D3 E3 F3 G3 - left hand five-finger position
  57, 59, // A3 B3 - fill the gap below middle C
];

export function clefForMidi(midi) {
  return midi < MIDDLE_C ? 'bass' : 'treble';
}
