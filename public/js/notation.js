// Thin wrapper around VexFlow for rendering staff notation. Sequences
// (sheet practice / songs) are rendered in treble clef only for now - the
// left-hand curriculum notes (C3-G3) would need bass clef or heavy ledger
// lines; see README "Extending the curriculum" for that follow-up.

import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from '/vendor/vexflow/entry/vexflow.js';
import { midiToVexKey, clefForMidi } from '/shared/theory.js';

export class Notation {
  constructor(container) {
    this.container = container;
    this.renderer = new Renderer(container, Renderer.Backends.SVG);
  }

  _buildNote(midi, clef) {
    const key = midiToVexKey(midi);
    const note = new StaveNote({ keys: [key], duration: 'q', clef });
    if (key.includes('#')) note.addModifier(new Accidental('#'));
    return note;
  }

  /** Flashcard-style single note, on whichever clef it naturally belongs to. */
  renderSingleNote(midi) {
    const width = 220;
    const height = 150;
    this.renderer.resize(width, height);
    const context = this.renderer.getContext();
    context.clear();
    const clef = clefForMidi(midi);

    const stave = new Stave(10, 10, width - 20);
    stave.addClef(clef);
    stave.setContext(context).draw();

    const note = this._buildNote(midi, clef);
    const voice = new Voice({ num_beats: 1, beat_value: 4 }).setMode(Voice.Mode.SOFT);
    voice.addTickables([note]);
    new Formatter().joinVoices([voice]).format([voice], width - 80);
    voice.draw(context, stave);

    return note;
  }

  /**
   * Renders a sequence of quarter notes as treble-clef measures.
   * @param {{midi:number}[]} sequence
   * @returns {StaveNote[]} one VexFlow note per sequence entry, in order -
   *   use note.getSVGElement() to highlight progress while the learner plays.
   */
  renderSequence(sequence, { beatsPerMeasure = 4, timeSignature = '4/4' } = {}) {
    const measures = [];
    for (let i = 0; i < sequence.length; i += beatsPerMeasure) {
      measures.push(sequence.slice(i, i + beatsPerMeasure));
    }

    const measureWidth = 170;
    const width = measures.length * measureWidth + 40;
    const height = 150;
    this.renderer.resize(width, height);
    const context = this.renderer.getContext();
    context.clear();

    let x = 10;
    const allNotes = [];

    measures.forEach((measureNotes, i) => {
      const stave = new Stave(x, 20, measureWidth);
      if (i === 0) {
        stave.addClef('treble').addTimeSignature(timeSignature);
      }
      stave.setContext(context).draw();

      const staveNotes = measureNotes.map(({ midi }) => this._buildNote(midi, 'treble'));

      const voice = new Voice({ num_beats: measureNotes.length, beat_value: 4 }).setMode(Voice.Mode.SOFT);
      voice.addTickables(staveNotes);
      new Formatter().joinVoices([voice]).format([voice], measureWidth - 30);
      voice.draw(context, stave);

      allNotes.push(...staveNotes);
      x += measureWidth;
    });

    return allNotes;
  }
}
