import { PianoMIDI } from './midi.js';
import {
  fetchState,
  saveProgress as apiSaveProgress,
  savePath as apiSavePath,
  recordSession as apiRecordSession,
} from './api.js';
import { CURRICULUM } from '/shared/theory.js';
import { getKnownNotes, createInitialNoteState } from '/shared/srs.js';
import { createInitialPathProgress } from '/shared/path.js';

import { renderHome } from './views/home.js';
import { renderLesson } from './views/lesson.js';
import { renderTrainer } from './views/trainer.js';
import { renderSheet } from './views/sheet.js';
import { renderSongs } from './views/songs.js';
import { renderStats } from './views/stats.js';

const views = { home: renderHome, lesson: renderLesson, trainer: renderTrainer, sheet: renderSheet, songs: renderSongs, stats: renderStats };
// Views without their own nav button highlight this one instead.
const NAV_PARENT = { lesson: 'home' };

const midi = new PianoMIDI();
window.pianoMIDI = midi; // handy for debugging from the devtools console

const viewRoot = document.getElementById('view-root');
const navButtons = [...document.querySelectorAll('.nav-btn')];

let state = { progress: {}, sessions: [], path: createInitialPathProgress() };
let currentDestroy = null;

// Saves are chained so PUTs reach the server in order; each one serializes the
// latest state when it runs, so the last write always wins with fresh data.
let progressSaves = Promise.resolve();
let pathSaves = Promise.resolve();

const ctx = {
  midi,
  curriculum: CURRICULUM,
  getState: () => state,
  getKnownNotes: () => getKnownNotes(state.progress, CURRICULUM),
  getNoteState: (midiNum) => state.progress[midiNum] || createInitialNoteState(midiNum),
  saveProgress(updatedProgress) {
    state.progress = updatedProgress;
    progressSaves = progressSaves.catch(() => {}).then(() => apiSaveProgress(state.progress));
    return progressSaves;
  },
  getPathProgress: () => state.path,
  savePathProgress(updatedPath) {
    state.path = updatedPath;
    pathSaves = pathSaves.catch(() => {}).then(() => apiSavePath(state.path));
    return pathSaves;
  },
  async recordSession(session) {
    const saved = await apiRecordSession(session);
    state.sessions.push(saved);
    return saved;
  },
  navigateTo,
};

/** @param {string} name @param {object} [params] - view-specific, e.g. { unitId, stepId } for 'lesson'. */
function navigateTo(name, params = {}) {
  if (!views[name]) return;
  if (currentDestroy) {
    try { currentDestroy(); } catch (err) { console.error(err); }
    currentDestroy = null;
  }
  const navName = NAV_PARENT[name] || name;
  navButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.view === navName));
  viewRoot.replaceChildren();
  window.scrollTo(0, 0);
  currentDestroy = views[name](viewRoot, ctx, params) || null;
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.view));
});

// --- MIDI connection UI (persistent, in the header, shared across views) ---

const statusEl = document.getElementById('midi-status');
const selectEl = document.getElementById('midi-device-select');
const connectBtn = document.getElementById('midi-connect-btn');
const refreshBtn = document.getElementById('midi-refresh-btn');

const LAST_DEVICE_KEY = 'piano-learning:last-midi-device-name';

function renderDeviceOptions(devices) {
  selectEl.replaceChildren();
  if (devices.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'No MIDI devices found';
    opt.disabled = true;
    selectEl.appendChild(opt);
    return;
  }
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name || d.id;
    selectEl.appendChild(opt);
  }

  let lastName = null;
  try { lastName = localStorage.getItem(LAST_DEVICE_KEY); } catch { /* ignore */ }
  const match = lastName && devices.find((d) => d.name === lastName);
  if (match) {
    selectEl.value = match.id;
    midi.connect(match.id);
  }
}

async function refreshDevices() {
  try {
    const devices = await midi.requestAccess();
    renderDeviceOptions(devices);
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

connectBtn.addEventListener('click', () => {
  const id = selectEl.value;
  if (!id) return;
  midi.connect(id);
});

refreshBtn.addEventListener('click', refreshDevices);

midi.addEventListener('connected', (e) => {
  statusEl.textContent = `Connected: ${e.detail.name}`;
  statusEl.classList.remove('midi-status--disconnected');
  statusEl.classList.add('midi-status--connected');
  try { localStorage.setItem(LAST_DEVICE_KEY, e.detail.name); } catch { /* ignore */ }
});

midi.addEventListener('devicechange', (e) => renderDeviceOptions(e.detail));

// --- boot ---

async function boot() {
  try {
    const loaded = await fetchState();
    state = { ...state, ...loaded, path: loaded.path || createInitialPathProgress() };
  } catch (err) {
    console.error('Failed to load saved progress, starting fresh.', err);
  }

  if (midi.isSupported) {
    refreshDevices();
  } else {
    statusEl.textContent = 'Web MIDI not supported — use Chrome or Edge';
  }

  navigateTo('home');
}

boot();
