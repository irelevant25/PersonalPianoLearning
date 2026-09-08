import { midiToName } from '/shared/theory.js';
import { pickPracticeQueue, isUnlocked } from '/shared/srs.js';
import { SONGS, isSongUnlocked } from '/shared/songs.js';

export function renderHome(container, ctx) {
  const { progress, sessions } = ctx.getState();
  const knownCount = ctx.getKnownNotes().length;
  const isKnown = (m) => isUnlocked(progress[m]);
  const unlockedSongs = SONGS.filter((s) => isSongUnlocked(s, isKnown)).length;
  const queue = pickPracticeQueue(progress, ctx.curriculum, { count: 5 });

  container.innerHTML = `
    <div class="card">
      <h2>Welcome back</h2>
      <p>You know <strong>${knownCount}/${ctx.curriculum.length}</strong> notes from the curriculum,
      have <strong>${unlockedSongs}/${SONGS.length}</strong> songs unlocked, and have logged
      <strong>${sessions.length}</strong> practice session${sessions.length === 1 ? '' : 's'}.</p>

      <p>Up next: ${queue.map(midiToName).join(', ')}</p>

      <div class="controls-row">
        <button data-go="trainer" type="button">Start Note Trainer</button>
        <button data-go="sheet" type="button">Sheet Practice</button>
        <button data-go="songs" type="button">Songs</button>
        <button data-go="stats" type="button">View Stats</button>
      </div>
    </div>

    <div class="card">
      <h2>How this works</h2>
      <ol>
        <li>Connect your KAWAI (or any USB-MIDI piano) using the panel at the top of the page.</li>
        <li><strong>Note Trainer</strong> introduces a few new notes at a time and quizzes you on them.
          Notes you get right graduate through a spaced-repetition schedule (like a language app);
          miss one and it comes back around sooner.</li>
        <li>Once you know at least 3 notes, <strong>Sheet Practice</strong> generates short sight-reading
          exercises from the notes you actually know, and grades both pitch and timing against a metronome.</li>
        <li><strong>Songs</strong> unlock automatically as you learn the notes they need.</li>
        <li><strong>Stats</strong> shows your keyboard mastery heatmap, accuracy, streak, and session history.</li>
      </ol>
    </div>
  `;

  container.querySelectorAll('button[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.navigateTo(btn.dataset.go));
  });

  return () => {};
}
