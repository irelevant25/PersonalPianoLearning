// "Learn" view: the learning path. Shows a Continue button for the next
// step, every phase/unit with its step chips (passed / open / locked), and
// the free-practice modes underneath.

import { midiToName } from '/shared/theory.js';
import { countDueNotes } from '/shared/srs.js';
import {
  PHASES, PATH_STEPS, STEP_TYPES, getNextStep, getStepRecord, isStepPassed, isStepUnlocked,
  getUnitStatus, stepKey, songForStep,
} from '/shared/path.js';

export function renderHome(container, ctx) {
  const { progress } = ctx.getState();
  const pathProgress = ctx.getPathProgress();
  const next = getNextStep(pathProgress);
  const dueCount = countDueNotes(progress, ctx.curriculum);
  const started = PATH_STEPS.some((e) => isStepPassed(pathProgress, e.key));

  const continueCard = next ? `
    <div class="card continue-card">
      <div>
        <div class="tag">${started ? 'Continue where you left off' : 'Start here'}</div>
        <h2>Unit ${next.unit.number} · ${next.unit.title}</h2>
        <p class="continue-step">${STEP_TYPES[next.step.type].title}</p>
      </div>
      <button class="btn-primary btn-large" type="button" data-open="${next.key}">${started ? 'Continue' : 'Start learning'}</button>
    </div>
  ` : `
    <div class="card continue-card">
      <div>
        <div class="tag">All available units done</div>
        <h2>You finished the right hand! 🎉</h2>
        <p>The left hand is coming next. Until then, keep your notes fresh with free practice below.</p>
      </div>
    </div>
  `;

  const phases = PHASES.map((phase) => phase.comingSoon ? `
    <section class="phase is-coming">
      <div class="phase-head">
        <span class="phase-number">${phase.number}</span>
        <div><strong>${phase.title}</strong><div class="tag">${phase.description}</div></div>
        <span class="chip">Coming soon</span>
      </div>
    </section>
  ` : `
    <section class="card phase">
      <div class="phase-head">
        <span class="phase-number">${phase.number}</span>
        <div><h2>${phase.title}</h2><div class="tag">${phase.description}</div></div>
      </div>
      <ol class="unit-list">${phase.units.map((u) => renderUnit(u, pathProgress)).join('')}</ol>
    </section>
  `).join('');

  container.innerHTML = `
    ${continueCard}
    ${dueCount > 0 ? `
      <div class="review-banner">
        <span><strong>${dueCount}</strong> note${dueCount === 1 ? ' is' : 's are'} due for review.</span>
        <button type="button" data-go="trainer">Review in Note Trainer</button>
      </div>` : ''}
    ${phases}
    <div class="card">
      <h2>Free practice</h2>
      <p class="tag">Practice on your own, outside the path. It uses the same note progress, so it helps the path too.</p>
      <div class="controls-row">
        <button data-go="trainer" type="button">Note Trainer</button>
        <button data-go="sheet" type="button">Sheet Practice</button>
        <button data-go="songs" type="button">Songs</button>
        <button data-go="stats" type="button">Stats</button>
      </div>
    </div>
  `;

  container.querySelectorAll('button[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.navigateTo(btn.dataset.go));
  });
  container.querySelectorAll('button[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [unitId, stepId] = btn.dataset.open.split('/');
      ctx.navigateTo('lesson', { unitId, stepId });
    });
  });

  return () => {};
}

function renderUnit(u, pathProgress) {
  const status = getUnitStatus(pathProgress, u);
  const songStep = u.steps.find((s) => s.type === 'song');
  const song = songStep && songForStep(songStep);
  const details = [
    u.newNotes.length ? `New: ${u.newNotes.map(midiToName).join(', ')}` : 'Review',
    song ? `Song: ${song.title}` : null,
  ].filter(Boolean).join(' · ');

  const chips = u.steps.map((s) => {
    const key = stepKey(u.id, s.id);
    const record = getStepRecord(pathProgress, key);
    const passed = isStepPassed(pathProgress, key);
    const unlocked = isStepUnlocked(pathProgress, key);
    const cls = passed ? 'is-passed' : unlocked ? 'is-open' : 'is-locked';
    const score = passed && s.type !== 'meet' ? ` ${record.bestAccuracy}%` : '';
    const icon = passed ? '✓ ' : unlocked ? '▶ ' : '';
    return `<button type="button" class="step-chip ${cls}" data-open="${key}" ${unlocked ? '' : 'disabled'}
      title="${STEP_TYPES[s.type].title}">${icon}${STEP_TYPES[s.type].short}${score}</button>`;
  }).join('');

  return `
    <li class="unit is-${status}">
      <div class="unit-head">
        <span class="unit-badge">${status === 'done' ? '✓' : u.number}</span>
        <div><strong>Unit ${u.number} · ${u.title}</strong><div class="tag">${details}</div></div>
      </div>
      <div class="step-chips">${chips}</div>
    </li>
  `;
}
