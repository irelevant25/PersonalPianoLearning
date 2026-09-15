// Plays a note sequence against the learner's MIDI input: renders it as staff
// notation, highlights the current note, grades each played note and feeds
// the grades into shared/srs.js. Shared by Sheet Practice, Songs, and the
// learning path's read / play-in-time / song steps.
//
// Two modes:
//  - 'tempo': 4-beat metronome count-in, graded on pitch + timing; every key
//    press advances to the next note (right or wrong).
//  - 'wait':  no clock; waits on each note until it's played correctly.
//    Accuracy counts first-try hits; after a couple of misses the right key
//    is shown on the on-screen keyboard.

import { midiToName } from '/shared/theory.js';
import { gradeAttempt, updateNoteState } from '/shared/srs.js';
import { Notation } from './notation.js';
import { Metronome } from './metronome.js';

const WAIT_MODE_HINT_AFTER_MISSES = 2;

export class SequencePlayer {
  /**
   * @param {object} opts
   * @param {object} opts.ctx - the app ctx (midi, getState, getNoteState, saveProgress).
   * @param {HTMLElement} opts.notationEl
   * @param {import('./keyboard.js').PianoKeyboard} opts.keyboard
   * @param {HTMLElement} opts.feedbackEl
   * @param {(result: object) => void} [opts.onFinish] - called with
   *   { mode, bpm, correct, total, accuracy, avgTimingErrorMs, startedAt, endedAt }.
   */
  constructor({ ctx, notationEl, keyboard, feedbackEl, onFinish = () => {} }) {
    this.ctx = ctx;
    this.keyboard = keyboard;
    this.feedbackEl = feedbackEl;
    this.onFinish = onFinish;
    this.notation = new Notation(notationEl);
    this.metronome = new Metronome();
    this.notes = [];
    this.staveNotes = [];
    this.active = false;
    this._onNoteOn = (e) => this._handleNoteOn(e);
    ctx.midi.addEventListener('noteon', this._onNoteOn);
  }

  /** @param {{midi:number}[]} notes */
  load(notes, { timeSignature = '4/4' } = {}) {
    this.stop();
    this.notes = notes;
    this.staveNotes = this.notation.renderSequence(notes, { timeSignature });
  }

  get isActive() {
    return this.active;
  }

  start({ mode = 'tempo', bpm = 80 } = {}) {
    this.metronome.stop();
    this.mode = mode;
    this.bpm = bpm;
    this.active = true;
    this.index = 0;
    this.correct = 0;
    this.timingErrors = [];
    this.missesOnCurrent = 0;
    this.progress = { ...this.ctx.getState().progress };
    this.startedAt = new Date().toISOString();
    this.keyboard.clearStates();
    this._markCurrent();

    if (mode === 'tempo') {
      this.secondsPerBeat = 60 / bpm;
      this.expectedTimes = this.metronome.schedule(this.notes.length, bpm, { leadInBeats: 4 }).expectedPerformanceTimes;
      this._setFeedback('Listen to the 4-beat count-in, then play along.');
    } else {
      this.expectedTimes = null;
      this._setFeedback('Play the blue note. Take your time - there is no clock.');
    }
  }

  stop() {
    this.active = false;
    this.metronome.stop();
  }

  destroy() {
    this.stop();
    this.ctx.midi.removeEventListener('noteon', this._onNoteOn);
  }

  _handleNoteOn(e) {
    if (!this.active) return;
    const played = e.detail.midi;
    const target = this.notes[this.index].midi;
    if (this.mode === 'wait') this._handleWait(played, target);
    else this._handleTempo(played, target, e.detail.timestamp);
  }

  _handleTempo(played, target, timestamp) {
    const correct = played === target;
    const timingErrorMs = timestamp - this.expectedTimes[this.index];
    const grade = gradeAttempt({ correct, timingErrorMs, timingToleranceMs: this.secondsPerBeat * 1000 * 0.5 });
    this._updateSrs(target, grade, timingErrorMs);
    if (correct) {
      this.correct += 1;
      this.timingErrors.push(timingErrorMs);
    }
    this._markNote(this.index, correct ? 'is-correct' : 'is-incorrect');
    this.keyboard.setKeyState(played, correct ? 'correct' : 'incorrect');
    setTimeout(() => this.keyboard.clearStates(), 250);
    this._advance();
  }

  _handleWait(played, target) {
    if (played !== target) {
      // Only the first miss on a note counts against it in the scheduler.
      if (this.missesOnCurrent === 0) this._updateSrs(target, gradeAttempt({ correct: false, timingErrorMs: null }), null);
      this.missesOnCurrent += 1;
      this.keyboard.setKeyState(played, 'incorrect');
      setTimeout(() => this.keyboard.setKeyState(played, null), 400);
      if (this.missesOnCurrent >= WAIT_MODE_HINT_AFTER_MISSES) this.keyboard.setKeyState(target, 'target');
      this._setFeedback(`That was ${midiToName(played)} - try again.`, 'incorrect');
      return;
    }

    const firstTry = this.missesOnCurrent === 0;
    if (firstTry) {
      this.correct += 1;
      this._updateSrs(target, gradeAttempt({ correct: true, timingErrorMs: null }), null);
    }
    this.missesOnCurrent = 0;
    this._markNote(this.index, firstTry ? 'is-correct' : 'is-incorrect');
    this.keyboard.clearStates();
    this.keyboard.setKeyState(played, 'correct');
    setTimeout(() => this.keyboard.setKeyState(played, null), 250);
    this._setFeedback(firstTry ? 'Good!' : 'Got it.', 'correct');
    this._advance();
  }

  _updateSrs(target, grade, timingErrorMs) {
    this.progress[target] = updateNoteState(this.progress[target] || this.ctx.getNoteState(target), grade, timingErrorMs);
    this.ctx.saveProgress(this.progress).catch((err) => console.error('Failed to save progress', err));
  }

  _advance() {
    this.index += 1;
    if (this.index < this.notes.length) {
      this._markCurrent();
      return;
    }

    this.active = false;
    const total = this.notes.length;
    const accuracy = Math.round((this.correct / total) * 100);
    const avgTimingErrorMs = this.timingErrors.length
      ? Math.round(this.timingErrors.reduce((a, b) => a + Math.abs(b), 0) / this.timingErrors.length)
      : null;
    this._setFeedback(
      `Done - ${this.correct}/${total} correct (${accuracy}%)${avgTimingErrorMs !== null ? `, avg timing off by ${avgTimingErrorMs}ms` : ''}.`,
      accuracy >= 80 ? 'correct' : null,
    );
    this.onFinish({
      mode: this.mode,
      bpm: this.mode === 'tempo' ? this.bpm : null,
      correct: this.correct,
      total,
      accuracy,
      avgTimingErrorMs,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
    });
  }

  _markNote(i, cls) {
    const el = this.staveNotes[i]?.getSVGElement();
    if (!el) return;
    el.classList.remove('is-current', 'is-correct', 'is-incorrect');
    el.classList.add(cls);
  }

  _markCurrent() {
    this.staveNotes.forEach((n, i) => {
      const el = n.getSVGElement();
      if (!el) return;
      if (i >= this.index) el.classList.remove('is-correct', 'is-incorrect');
      el.classList.toggle('is-current', i === this.index);
    });
  }

  _setFeedback(text, kind = null) {
    this.feedbackEl.textContent = text;
    this.feedbackEl.className = kind ? `feedback feedback--${kind}` : 'feedback';
  }
}

/** The session-log fields shared by every mode that uses a SequencePlayer. */
export function sessionFieldsFromResult(result) {
  return {
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    attempts: result.total,
    correct: result.correct,
    accuracy: result.accuracy,
    bpm: result.bpm,
    avgTimingErrorMs: result.avgTimingErrorMs,
  };
}
