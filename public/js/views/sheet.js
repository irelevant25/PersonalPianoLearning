import { midiToName } from '/shared/theory.js';
import { gradeAttempt, updateNoteState } from '/shared/srs.js';
import { PianoKeyboard } from '../keyboard.js';
import { Notation } from '../notation.js';
import { Metronome } from '../metronome.js';

const SEQUENCE_LENGTH = 6;
const MIN_KNOWN_NOTES = 3;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateSequence(knownNotes, length) {
  const seq = [];
  let last = null;
  for (let i = 0; i < length; i++) {
    let pick;
    do {
      pick = knownNotes[Math.floor(Math.random() * knownNotes.length)];
    } while (pick === last && knownNotes.length > 1);
    seq.push(pick);
    last = pick;
  }
  return seq;
}

export function renderSheet(container, ctx) {
  const knownTreble = shuffle(ctx.getKnownNotes().filter((m) => m >= 60));

  if (knownTreble.length < MIN_KNOWN_NOTES) {
    container.innerHTML = `
      <div class="card">
        <h2>Sheet Practice</h2>
        <p>Learn at least ${MIN_KNOWN_NOTES} notes in Note Trainer first — you currently know ${knownTreble.length}.
        Sheet Practice mixes whichever notes you've learned into a short piece of music for you to sight-read.</p>
        <button id="sh-goto-trainer" type="button">Go to Note Trainer</button>
      </div>
    `;
    container.querySelector('#sh-goto-trainer').addEventListener('click', () => ctx.navigateTo('trainer'));
    return () => {};
  }

  const progress = { ...ctx.getState().progress };
  let sequence = generateSequence(knownTreble, SEQUENCE_LENGTH);
  let bpm = 80;
  let index = 0;
  let active = false;
  let expectedTimes = [];
  let secondsPerBeat = 60 / bpm;
  let correctCount = 0;
  let timingErrors = [];
  let staveNotes = [];
  let startedAt = null;
  const metronome = new Metronome();

  container.innerHTML = `
    <div class="card">
      <h2>Sheet Practice</h2>
      <p class="tag">Known notes used: ${knownTreble.map(midiToName).join(', ')}</p>
      <div class="controls-row">
        <label>Tempo:
          <select id="sh-bpm">
            <option value="60">60 BPM</option>
            <option value="70">70 BPM</option>
            <option value="80" selected>80 BPM</option>
            <option value="100">100 BPM</option>
            <option value="120">120 BPM</option>
          </select>
        </label>
        <button id="sh-new" type="button">New sheet</button>
        <button id="sh-start" type="button">Start (4-beat count-in)</button>
      </div>
      <div id="sh-notation" class="notation-container"></div>
      <p class="feedback" id="sh-feedback">Press Start, then play the notes in order along with the click.</p>
      <div id="sh-keyboard"></div>
    </div>
  `;

  const notation = new Notation(container.querySelector('#sh-notation'));
  const keyboard = new PianoKeyboard(container.querySelector('#sh-keyboard'), { lowMidi: 48, highMidi: 84 });
  keyboard.markKnown(ctx.getKnownNotes());
  const feedbackEl = container.querySelector('#sh-feedback');
  const bpmSelect = container.querySelector('#sh-bpm');
  const startBtn = container.querySelector('#sh-start');

  function draw() {
    staveNotes = notation.renderSequence(sequence.map((midi) => ({ midi })));
  }
  draw();

  bpmSelect.addEventListener('change', () => { bpm = Number(bpmSelect.value); });
  container.querySelector('#sh-new').addEventListener('click', () => {
    sequence = generateSequence(knownTreble, SEQUENCE_LENGTH);
    draw();
    feedbackEl.textContent = 'New sheet ready. Press Start when you are.';
    feedbackEl.className = 'feedback';
  });

  function markCurrent() {
    staveNotes.forEach((n, i) => {
      const el = n.getSVGElement();
      if (!el) return;
      el.classList.remove('is-current', 'is-correct', 'is-incorrect');
      if (i === index) el.classList.add('is-current');
    });
  }

  function startAttempt() {
    active = true;
    index = 0;
    correctCount = 0;
    timingErrors = [];
    startedAt = new Date().toISOString();
    secondsPerBeat = 60 / bpm;
    keyboard.clearStates();
    markCurrent();
    feedbackEl.textContent = 'Listen to the 4-beat count-in, then play along.';
    feedbackEl.className = 'feedback';
    startBtn.disabled = true;

    const { expectedPerformanceTimes } = metronome.schedule(sequence.length, bpm, { leadInBeats: 4 });
    expectedTimes = expectedPerformanceTimes;
  }

  async function finishAttempt() {
    active = false;
    startBtn.disabled = false;
    const accuracy = Math.round((correctCount / sequence.length) * 100);
    const avgTimingError = timingErrors.length
      ? Math.round(timingErrors.reduce((a, b) => a + Math.abs(b), 0) / timingErrors.length)
      : null;
    feedbackEl.textContent = `Done — ${correctCount}/${sequence.length} correct (${accuracy}%)${avgTimingError !== null ? `, avg timing off by ${avgTimingError}ms` : ''}.`;
    feedbackEl.className = accuracy >= 80 ? 'feedback feedback--correct' : 'feedback';

    try {
      await ctx.recordSession({
        mode: 'sheet',
        startedAt,
        endedAt: new Date().toISOString(),
        attempts: sequence.length,
        correct: correctCount,
        accuracy,
        bpm,
        avgTimingErrorMs: avgTimingError,
      });
    } catch (err) {
      console.error('Failed to record session', err);
    }
  }

  async function onNoteOn(e) {
    if (!active) return;
    const played = e.detail.midi;
    const target = sequence[index];
    const correct = played === target;
    const timingErrorMs = e.detail.timestamp - expectedTimes[index];
    const timingToleranceMs = secondsPerBeat * 1000 * 0.5;
    const grade = gradeAttempt({ correct, timingErrorMs, timingToleranceMs });

    progress[target] = updateNoteState(progress[target] || ctx.getNoteState(target), grade, timingErrorMs);
    if (correct) { correctCount += 1; timingErrors.push(timingErrorMs); }

    const el = staveNotes[index].getSVGElement();
    if (el) {
      el.classList.remove('is-current');
      el.classList.add(correct ? 'is-correct' : 'is-incorrect');
    }
    keyboard.setKeyState(played, correct ? 'correct' : 'incorrect');
    setTimeout(() => keyboard.clearStates(), 250);

    try {
      await ctx.saveProgress(progress);
    } catch (err) {
      console.error('Failed to save progress', err);
    }

    index += 1;
    if (index >= sequence.length) {
      finishAttempt();
    } else {
      markCurrent();
    }
  }

  ctx.midi.addEventListener('noteon', onNoteOn);
  startBtn.addEventListener('click', startAttempt);

  return () => {
    ctx.midi.removeEventListener('noteon', onNoteOn);
  };
}
