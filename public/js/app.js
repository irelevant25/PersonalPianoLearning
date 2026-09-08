import { PianoMIDI } from './midi.js';
import { fetchState, saveProgress as apiSaveProgress, recordSession as apiRecordSession } from './api.js';
import { CURRICULUM } from '/shared/theory.js';
import { getKnownNotes, createInitialNoteState } from '/shared/srs.js';

import { renderHome } from './views/home.js';
import { renderTrainer } from './views/trainer.js';
import { renderSheet } from './views/sheet.js';
import { renderSongs } from './views/songs.js';
import { renderStats } from './views/stats.js';

const views = { home: renderHome, trainer: renderTrainer, sheet: renderSheet, songs: renderSongs, stats: renderStats };

const midi = new PianoMIDI();
window.pianoMIDI = midi; // handy for debugging from the devtools console

const viewRoot = document.getElementById('view-root');
const navButtons = [...document.querySelectorAll('.nav-btn')];

let state = { progress: {}, sessions: [] };
let currentDestroy = null;

const ctx = {
  midi,
  curriculum: CURRICULUM,
  getState: () => state,
  getKnownNotes: () => getKnownNotes(state.progress, CURRICULUM),
  getNoteState: (midiNum) => state.progress[midiNum] || createInitialNoteState(midiNum),
  async saveProgress(updatedProgress) {
    state.progress = updatedProgress;
    await apiSaveProgress(updatedProgress);
  },
  async recordSession(session) {
    const saved = await apiRecordSession(session);
    state.sessions.push(saved);
    return saved;
  },
  navigateTo,
};

function navigateTo(name) {
  if (!views[name]) return;
  if (currentDestroy) {
    try { currentDestroy(); } catch (err) { console.error(err); }
    currentDestroy = null;
  }
  navButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.view === name));
  viewRoot.replaceChildren();
  currentDestroy = views[name](viewRoot, ctx) || null;
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
    state = await fetchState();
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
