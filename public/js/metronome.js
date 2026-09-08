// Click track + timing reference for tempo-graded practice (sheet & song
// modes). Clicks are scheduled as sample-accurate Web Audio events; the
// expected onset of each beat is also translated into a performance.now()
// timestamp so it can be compared directly against MIDI note-on timestamps
// (see midi.js, which stamps events with performance.now()).

export class Metronome {
  constructor() {
    this.audioCtx = null;
  }

  _ensureCtx() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioCtx;
  }

  _click(time, accent) {
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1000 : 800;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.25, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.09);
  }

  /**
   * Plays `leadInBeats` count-in clicks followed by one click per beat of
   * the sequence, at the given bpm. Returns the performance.now() timestamp
   * each *sequence* beat (i.e. excluding the lead-in) is expected to land on.
   */
  schedule(beatCount, bpm, { leadInBeats = 4 } = {}) {
    const ctx = this._ensureCtx();
    const secondsPerBeat = 60 / bpm;
    const ctxTimeAtStart = ctx.currentTime;
    const startAudioTime = ctxTimeAtStart + 0.15;
    const startPerfTime = performance.now();

    const totalBeats = leadInBeats + beatCount;
    const expectedPerformanceTimes = [];

    for (let i = 0; i < totalBeats; i++) {
      const audioTime = startAudioTime + i * secondsPerBeat;
      this._click(audioTime, i % 4 === 0);
      if (i >= leadInBeats) {
        const perfTime = startPerfTime + (audioTime - ctxTimeAtStart) * 1000;
        expectedPerformanceTimes.push(perfTime);
      }
    }

    return { expectedPerformanceTimes, secondsPerBeat, leadInMs: leadInBeats * secondsPerBeat * 1000 };
  }
}
