// Thin wrapper around the backend's local JSON-file persistence.

export async function fetchState() {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error(`Failed to load state: ${res.status}`);
  return res.json();
}

export async function saveProgress(progress) {
  const res = await fetch('/api/progress', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
  });
  if (!res.ok) throw new Error(`Failed to save progress: ${res.status}`);
}

export async function recordSession(session) {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  });
  if (!res.ok) throw new Error(`Failed to record session: ${res.status}`);
  return res.json();
}
