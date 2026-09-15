import { midiToName } from '/shared/theory.js';
import { PianoKeyboard } from '../keyboard.js';
import { SequencePlayer, sessionFieldsFromResult } from '../sequence-player.js';

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
        <p>Learn at least ${MIN_KNOWN_NOTES} notes first — you currently know ${knownTreble.length}.
        Sheet Practice mixes whichever notes you've learned into a short piece of music for you to sight-read.</p>
        <button id="sh-goto-path" type="button">Go to the learning path</button>
      </div>
    `;
    container.querySelector('#sh-goto-path').addEventListener('click', () => ctx.navigateTo('home'));
    return () => {};
  }

  let bpm = 80;

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

  const keyboard = new PianoKeyboard(container.querySelector('#sh-keyboard'), { lowMidi: 48, highMidi: 84 });
  keyboard.markKnown(ctx.getKnownNotes());
  const feedbackEl = container.querySelector('#sh-feedback');
  const bpmSelect = container.querySelector('#sh-bpm');
  const startBtn = container.querySelector('#sh-start');

  const player = new SequencePlayer({
    ctx,
    notationEl: container.querySelector('#sh-notation'),
    keyboard,
    feedbackEl,
    async onFinish(result) {
      startBtn.disabled = false;
      try {
        await ctx.recordSession({ mode: 'sheet', ...sessionFieldsFromResult(result) });
      } catch (err) {
        console.error('Failed to record session', err);
      }
    },
  });

  function loadNewSheet() {
    player.load(generateSequence(knownTreble, SEQUENCE_LENGTH).map((midi) => ({ midi })));
    startBtn.disabled = false;
  }
  loadNewSheet();

  bpmSelect.addEventListener('change', () => { bpm = Number(bpmSelect.value); });
  container.querySelector('#sh-new').addEventListener('click', () => {
    loadNewSheet();
    feedbackEl.textContent = 'New sheet ready. Press Start when you are.';
    feedbackEl.className = 'feedback';
  });
  startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    player.start({ mode: 'tempo', bpm });
  });

  return () => player.destroy();
}
