import { midiToName } from '/shared/theory.js';
import { gradeAttempt, updateNoteState, isUnlocked } from '/shared/srs.js';
import { SONGS, requiredNotes, isSongUnlocked } from '/shared/songs.js';
import { PianoKeyboard } from '../keyboard.js';
import { Notation } from '../notation.js';
import { Metronome } from '../metronome.js';

export function renderSongs(container, ctx) {
  const progress = ctx.getState().progress;
  const isKnown = (midi) => isUnlocked(progress[midi]);
  // Holds whichever sub-view's teardown (MIDI listener removal) is currently
  // active, so switching between the song list and a player - or leaving the
  // view entirely - never leaks a stale 'noteon' handler.
  const nav = { cleanup: () => {} };

  renderList(container, ctx, isKnown, nav);
  return () => nav.cleanup();
}

function renderList(container, ctx, isKnown, nav) {
  nav.cleanup();
  nav.cleanup = () => {};
  const rows = SONGS.map((song) => {
    const unlocked = isSongUnlocked(song, isKnown);
    const names = requiredNotes(song).map(midiToName).join(', ');
    return `
      <li class="song-item ${unlocked ? '' : 'is-locked'}">
        <div>
          <strong>${song.title}</strong><br />
          <span class="tag">${song.bpm} BPM &middot; needs: ${names}</span>
        </div>
        <button type="button" data-song="${song.id}" ${unlocked ? '' : 'disabled'}>${unlocked ? 'Play' : 'Locked'}</button>
      </li>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <h2>Songs</h2>
      <p>Songs unlock automatically once you know every note they use. Keep practicing in Note Trainer to unlock more.</p>
      <ul class="song-list">${rows}</ul>
    </div>
  `;

  container.querySelectorAll('button[data-song]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const song = SONGS.find((s) => s.id === btn.dataset.song);
      renderPlayer(container, ctx, song, isKnown, nav);
    });
  });
}

function renderPlayer(container, ctx, song, isKnown, nav) {
  nav.cleanup();
  const progress = { ...ctx.getState().progress };
  let bpm = song.bpm;
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
      <h2>${song.title}</h2>
      <div class="controls-row">
        <button id="sg-back" type="button">&larr; Back to songs</button>
        <label>Tempo:
          <select id="sg-bpm"></select>
        </label>
        <button id="sg-start" type="button">Start (4-beat count-in)</button>
      </div>
      <div id="sg-notation" class="notation-container"></div>
      <p class="feedback" id="sg-feedback">Press Start, then play along with the click.</p>
      <div id="sg-keyboard"></div>
    </div>
  `;

  const bpmSelect = container.querySelector('#sg-bpm');
  [0.75, 1, 1.25].forEach((factor) => {
    const value = Math.round(song.bpm * factor);
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = `${value} BPM${factor === 1 ? ' (original)' : ''}`;
    if (factor === 1) opt.selected = true;
    bpmSelect.appendChild(opt);
  });
  bpmSelect.addEventListener('change', () => { bpm = Number(bpmSelect.value); });

  container.querySelector('#sg-back').addEventListener('click', () => renderList(container, ctx, isKnown, nav));

  const notation = new Notation(container.querySelector('#sg-notation'));
  const keyboard = new PianoKeyboard(container.querySelector('#sg-keyboard'), { lowMidi: 48, highMidi: 84 });
  keyboard.markKnown(ctx.getKnownNotes());
  const feedbackEl = container.querySelector('#sg-feedback');
  const startBtn = container.querySelector('#sg-start');

  staveNotes = notation.renderSequence(song.notes, { timeSignature: song.timeSignature });

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

    const { expectedPerformanceTimes } = metronome.schedule(song.notes.length, bpm, { leadInBeats: 4 });
    expectedTimes = expectedPerformanceTimes;
  }

  async function finishAttempt() {
    active = false;
    startBtn.disabled = false;
    const accuracy = Math.round((correctCount / song.notes.length) * 100);
    const avgTimingError = timingErrors.length
      ? Math.round(timingErrors.reduce((a, b) => a + Math.abs(b), 0) / timingErrors.length)
      : null;
    feedbackEl.textContent = `Done — ${correctCount}/${song.notes.length} correct (${accuracy}%)${avgTimingError !== null ? `, avg timing off by ${avgTimingError}ms` : ''}.`;
    feedbackEl.className = accuracy >= 80 ? 'feedback feedback--correct' : 'feedback';

    try {
      await ctx.recordSession({
        mode: 'song',
        songId: song.id,
        songTitle: song.title,
        startedAt,
        endedAt: new Date().toISOString(),
        attempts: song.notes.length,
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
    const target = song.notes[index].midi;
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
    if (index >= song.notes.length) {
      finishAttempt();
    } else {
      markCurrent();
    }
  }

  ctx.midi.addEventListener('noteon', onNoteOn);
  nav.cleanup = () => ctx.midi.removeEventListener('noteon', onNoteOn);
  startBtn.addEventListener('click', startAttempt);
}
