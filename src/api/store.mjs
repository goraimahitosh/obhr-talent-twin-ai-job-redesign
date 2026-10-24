// Data access for TALENT TWIN on Netlify Blobs (built into every Netlify site).
// No external database, no keys: Netlify configures access for the function automatically.
//
// Store "tt-data" (JSON):  settings · auth · p-<id> participant · t-<tokenHash> → id · c-<code> → id · d-<id> document meta
// Store "tt-files" (binary): f-<docId>-<n> document chunks   (flat keys: no "/" so prefix listing behaves the same everywhere)
import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

let stores = null;
function open(name) {
  // Local test harness only: TT_BLOBS_API_URL points at @netlify/blobs' BlobsServer.
  if (process.env.TT_BLOBS_API_URL) return getStore({ name, siteID: 'local-site', token: 'local-token', apiURL: process.env.TT_BLOBS_API_URL });
  return getStore({ name, consistency: 'strong' });
}
function s() {
  if (!stores) {
    try { stores = { data: open('tt-data'), files: open('tt-files') }; }
    catch (e) { throw Object.assign(new Error('Storage is not available. Deploy the site on Netlify (Netlify Blobs is configured automatically there).'), { status: 500 }); }
  }
  return stores;
}
const nowIso = () => new Date().toISOString();

/* ---- generic JSON helpers with optimistic concurrency ---- */
async function getJSON(key) { return s().data.get(key, { type: 'json' }); }
async function setJSON(key, value, opts) { return s().data.setJSON(key, value, opts); }
async function updateJSON(key, fn) {
  for (let i = 0; i < 6; i++) {
    const cur = await s().data.getWithMetadata(key, { type: 'json' });
    if (!cur || cur.data == null) return null;
    const next = fn(cur.data);
    const r = cur.etag ? await setJSON(key, next, { onlyIfMatch: cur.etag }) : await setJSON(key, next);
    if (!r || r.modified !== false) return next;
    await new Promise(res => setTimeout(res, 40 + Math.random() * 80));
  }
  const e = new Error('Busy — please try again.'); e.status = 503; throw e;
}
async function getMany(keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 25) {
    const part = await Promise.all(keys.slice(i, i + 25).map(k => getJSON(k)));
    part.forEach(v => { if (v) out.push(v); });
  }
  return out;
}
async function keysWithPrefix(store, prefix) {
  // List everything and filter here: behaves identically on Netlify and in the local Blobs test server,
  // and is cheap at classroom scale (a few hundred keys).
  const r = await store.list();
  return (r.blobs || []).map(b => b.key).filter(k => k.startsWith(prefix));
}

/* ---- settings & faculty auth ---- */
export async function getSettingsRow() { const data = await getJSON('settings'); return data ? { data } : null; }
export async function saveSettingsData(data) { await setJSON('settings', data); return { data }; }
export async function getAuth() { return getJSON('auth'); }
export async function createAuthIfMissing(auth) { const r = await setJSON('auth', auth, { onlyIfNew: true }); return !!(r && r.modified !== false); }
export async function saveAuth(auth) { await setJSON('auth', auth); }

/* ---- participants ---- */
export async function insertParticipant(row) {
  const id = crypto.randomUUID();
  const claim = await setJSON('c-' + row.code, { id }, { onlyIfNew: true });
  if (claim && claim.modified === false) return { duplicate: true };
  const full = Object.assign({ id, status: 'in_progress', draft: {}, decisions: null, rubric: null, summary: null, score: null,
    adjustment: 0, adjustment_note: null, leah_feedback: null, started_at: nowIso(), submitted_at: null, last_seen_at: nowIso() }, row);
  await setJSON('p-' + id, full);
  await setJSON('t-' + row.token_hash, { id });
  return { row: full };
}
export async function participantByTokenHash(hash) {
  const t = await getJSON('t-' + hash); if (!t) return null;
  return getJSON('p-' + t.id);
}
export async function participantById(id) { return getJSON('p-' + id); }
export async function updateParticipant(id, patch) { return updateJSON('p-' + id, cur => Object.assign({}, cur, patch)); }
export async function deleteParticipant(id) {
  const p = await getJSON('p-' + id); if (!p) return;
  await Promise.all([s().data.delete('t-' + p.token_hash), s().data.delete('c-' + p.code)]);
  await s().data.delete('p-' + id);
}
export async function listParticipants(round) {
  const all = await getMany(await keysWithPrefix(s().data, 'p-'));
  return all.filter(p => !round || p.round === round).sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
}
export async function listRounds() { return [...new Set((await listParticipants(null)).map(p => p.round))]; }

/* ---- documents ---- */
export async function listDocuments(onlyVisible) {
  const all = await getMany(await keysWithPrefix(s().data, 'd-'));
  return all.filter(d => d.status === 'ready' && (!onlyVisible || d.visible)).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}
export async function documentById(id) { return getJSON('d-' + id); }
export async function insertDocument(row) {
  const id = crypto.randomUUID();
  const full = Object.assign({ id, visible: false, status: 'uploading', created_at: nowIso() }, row);
  await setJSON('d-' + id, full); return full;
}
export async function updateDocument(id, patch) { return updateJSON('d-' + id, cur => Object.assign({}, cur, patch)); }
export async function deleteDocument(id) {
  const keys = await keysWithPrefix(s().files, 'f-' + id + '-');
  await Promise.all(keys.map(k => s().files.delete(k)));
  await s().data.delete('d-' + id);
}
export async function putChunk(id, n, buf) { await s().files.set('f-' + id + '-' + n, buf); }
export async function getChunk(id, n) { return s().files.get('f-' + id + '-' + n, { type: 'arrayBuffer' }); }
export async function chunkCount(id) { return (await keysWithPrefix(s().files, 'f-' + id + '-')).length; }
export async function listStaleUploads(olderThanMs) {
  const all = await getMany(await keysWithPrefix(s().data, 'd-'));
  return all.filter(d => d.status === 'uploading' && Date.now() - Date.parse(d.created_at) > olderThanMs);
}

/* ---- small counters / misc JSON (e.g. monthly AI usage) ---- */
export async function getKV(key) { return getJSON(key); }
export async function updateKV(key, fn) {
  for (let i = 0; i < 6; i++) {
    const cur = await s().data.getWithMetadata(key, { type: 'json' });
    const next = fn(cur ? cur.data : null);
    const r = cur && cur.etag ? await setJSON(key, next, { onlyIfMatch: cur.etag }) : await setJSON(key, next, cur ? undefined : { onlyIfNew: true });
    if (!r || r.modified !== false) return next;
    await new Promise(res => setTimeout(res, 30 + Math.random() * 60));
  }
  return null;
}
