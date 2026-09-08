import { Router } from 'express';
import { readJson, writeJson } from '../lib/storage.js';

const PROGRESS_FILE = 'progress.json';
const SESSIONS_FILE = 'sessions.json';

export const apiRouter = Router();

// Everything the frontend needs to boot: per-note SRS state + session history.
apiRouter.get('/state', async (req, res, next) => {
  try {
    const [progress, sessions] = await Promise.all([
      readJson(PROGRESS_FILE, {}),
      readJson(SESSIONS_FILE, []),
    ]);
    res.json({ progress, sessions });
  } catch (err) {
    next(err);
  }
});

// The frontend computes SRS updates itself (shared/srs.js runs in both
// places) and PUTs the resulting note-state map back for persistence.
apiRouter.put('/progress', async (req, res, next) => {
  try {
    const progress = req.body;
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
      return res.status(400).json({ error: 'Body must be a JSON object keyed by MIDI note number.' });
    }
    await writeJson(PROGRESS_FILE, progress);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Append one completed-session summary (note trainer run, sheet, or song).
apiRouter.post('/sessions', async (req, res, next) => {
  try {
    const session = req.body;
    if (!session || typeof session !== 'object') {
      return res.status(400).json({ error: 'Body must be a session object.' });
    }
    const sessions = await readJson(SESSIONS_FILE, []);
    const stamped = { ...session, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, recordedAt: new Date().toISOString() };
    sessions.push(stamped);
    await writeJson(SESSIONS_FILE, sessions);
    res.status(201).json(stamped);
  } catch (err) {
    next(err);
  }
});
