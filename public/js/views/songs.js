import { midiToName } from '/shared/theory.js';
import { isUnlocked } from '/shared/srs.js';
import { SONGS, requiredNotes, isSongUnlocked } from '/shared/songs.js';
import { PianoKeyboard } from '../keyboard.js';
import { SequencePlayer, sessionFieldsFromResult } from '../sequence-player.js';

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
      <p>Songs unlock automatically once you know every note they use. The learning path teaches them one by one.</p>
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
  let bpm = song.bpm;

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

  const keyboard = new PianoKeyboard(container.querySelector('#sg-keyboard'), { lowMidi: 48, highMidi: 84 });
  keyboard.markKnown(ctx.getKnownNotes());
  const startBtn = container.querySelector('#sg-start');

  const player = new SequencePlayer({
    ctx,
    notationEl: container.querySelector('#sg-notation'),
    keyboard,
    feedbackEl: container.querySelector('#sg-feedback'),
    async onFinish(result) {
      startBtn.disabled = false;
      try {
        await ctx.recordSession({ mode: 'song', songId: song.id, songTitle: song.title, ...sessionFieldsFromResult(result) });
      } catch (err) {
        console.error('Failed to record session', err);
      }
    },
  });
  player.load(song.notes, { timeSignature: song.timeSignature });

  startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    player.start({ mode: 'tempo', bpm });
  });

  nav.cleanup = () => player.destroy();
}
