// TALENT TWIN — Job Redesign Lab · single API function (Netlify Functions v2)
// Routes live under /api/*. Students need no login: they enter a name and get a
// random token kept in their browser. Faculty sign in with ADMIN_PASSWORD.
import TT from '../../public/js/model.js';
import * as SC from './scoring.mjs';
import * as S from './store.mjs';
import * as AI from './ai.mjs';
import { sha256, newToken, newCode, checkAdminPassword, issueAdminToken, verifyAdminToken, bearer, adminStatus, setupAdminPassword, changeAdminPassword } from './auth.mjs';

const GRACE_MS = 45 * 1000;          // network grace after the deadline
const MAX_BODY = 200 * 1024;
const CHUNK = 3 * 1024 * 1024;       // document upload/view piece size (keeps each request under Netlify's 6 MB limit)
const MAX_FILE = 50 * 1024 * 1024;
const ALLOWED_DOC_TYPES = {
  'application/pdf': 'pdf', 'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/gif': 'image',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xlsx',
  'text/csv': 'csv', 'text/plain': 'text', 'text/markdown': 'text'
};

export const DEFAULT_SETTINGS = {
  title: 'TALENT TWIN — Job Redesign Lab',
  isOpen: true,                 // accept new participants
  timeLimitMinutes: 45,         // per participant; 0 = no limit
  endsAt: null,                 // ISO time when the session ends for everyone (optional)
  currentRound: 'Round 1',
  case: TT.DEFAULT_CASE,
  showScore: true,              // show score + rubric in the participant report right after submission
  releaseDebrief: false,        // show reference answers + LEAH recommendation to participants
  showRank: false,              // show rank within the round in participant reports
  ai: AI.DEFAULT_AI,
  leah: { orchestratorUrl: 'https://iimv.agentic.leahai.com/orchestrator/9e6d6c015b6b425a9fe5d30b4b56ec07?tab=preview', agent: null, classInsights: {} }
};

/* ---------------- helpers ---------------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function body(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request too large');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON'); }
}
const cleanText = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

async function getSettings() {
  const row = await S.getSettingsRow();
  const d = (row && row.data) || {};
  const s = Object.assign({}, DEFAULT_SETTINGS, d);
  s.case = TT.sanitizeCase(Object.assign({}, DEFAULT_SETTINGS.case, d.case || {}));
  s.leah = Object.assign({}, DEFAULT_SETTINGS.leah, d.leah || {});
  s.leah.classInsights = s.leah.classInsights || {};
  s.ai = Object.assign({}, AI.DEFAULT_AI, d.ai || {});
  return s;
}

function deadlineFor(p, s) {
  let d = null;
  if (Number(s.timeLimitMinutes) > 0) d = Date.parse(p.started_at) + Number(s.timeLimitMinutes) * 60000;
  if (s.endsAt) { const e = Date.parse(s.endsAt); if (Number.isFinite(e)) d = d === null ? e : Math.min(d, e); }
  return d;
}

/* Score a participant from their saved draft and store the official result. */
async function finalize(p, s, auto) {
  const decisions = TT.sanitizeDecisions(p.draft || {});
  const { res, rb } = SC.score(p.case_snapshot, decisions);
  const summary = {
    monthlyNet: Math.round(res.monthlyNet), monthlySpend: res.monthlySpend, capex: res.capex,
    payback: Number.isFinite(res.payback) ? Math.round(res.payback * 10) / 10 : null,
    horizonNet: Math.round(res.horizonNet), aiShare: res.aiShare, fteReleased: Math.round(res.fteReleased * 10) / 10,
    overrun: res.overrun, capexOver: res.capexOver, highRiskAuto: res.highRiskAuto,
    modes: decisions.modes, recommendation: decisions.recommendation,
    missing: TT.validate(decisions)
  };
  const score = TT.r1(TT.clamp(rb.total + Number(p.adjustment || 0), 0, 100));
  return S.updateParticipant(p.id, {
    status: auto ? 'auto_submitted' : 'submitted', submitted_at: new Date().toISOString(),
    decisions, rubric: rb, summary, score
  });
}

async function finalizeIfExpired(p, s) {
  if (p.status !== 'in_progress') return p;
  const dl = deadlineFor(p, s);
  if (dl !== null && Date.now() > dl + GRACE_MS) return finalize(p, s, true);
  return p;
}

async function participantFromReq(req) {
  const tok = bearer(req);
  if (!tok || tok.startsWith('admin.')) throw new HttpError(401, 'Your session was not found. Start again from the home page.');
  const p = await S.participantByTokenHash(sha256(tok));
  if (!p) throw new HttpError(401, 'Your session was not found. Start again from the home page.');
  return p;
}
async function requireAdmin(req) {
  if (!(await verifyAdminToken(bearer(req)))) throw new HttpError(401, 'Faculty sign-in required.');
}

function publicSettings(s) {
  return { title: s.title, isOpen: s.isOpen, timeLimitMinutes: Number(s.timeLimitMinutes) || 0, endsAt: s.endsAt,
    round: s.currentRound, showScore: !!s.showScore, releaseDebrief: !!s.releaseDebrief, showRank: !!s.showRank,
    coach: !!(s.ai.enabled && s.ai.bot), aiReport: !!(s.ai.enabled && s.ai.report) };
}
const docMeta = d => ({ id: d.id, title: d.title, kind: ALLOWED_DOC_TYPES[d.mime] || 'other', mime: d.mime, size: d.size_bytes });

function participantView(p, s) {
  const dl = deadlineFor(p, s);
  return { code: p.code, name: p.name, roll: p.roll, round: p.round, status: p.status,
    startedAt: p.started_at, submittedAt: p.submitted_at, deadline: dl ? new Date(dl).toISOString() : null,
    serverNow: new Date().toISOString(), draft: p.draft || {} };
}

/* Build the participant report (only after submission). */
async function buildReport(p, s, forAdmin) {
  const decisions = TT.sanitizeDecisions(p.decisions || p.draft || {});
  const { res, rb } = SC.score(p.case_snapshot, decisions);
  const showScore = forAdmin || s.showScore;
  const release = forAdmin || s.releaseDebrief;
  const report = {
    code: p.code, name: p.name, roll: p.roll, round: p.round, status: p.status,
    startedAt: p.started_at, submittedAt: p.submitted_at, case: res.case, decisions,
    economics: {
      payroll: res.payroll, labourPerHour: res.labourPerHour, savedActual: res.savedActual, realized: res.realized,
      rec: res.rec, oversight: res.oversight, monthlySpend: res.monthlySpend, monthlyNet: res.monthlyNet, capex: res.capex,
      payback: Number.isFinite(res.payback) ? res.payback : null, horizonNet: res.horizonNet, aiShare: res.aiShare,
      riskScore: res.riskScore, overrun: res.overrun, capexOver: res.capexOver, fteReleased: res.fteReleased,
      growthFte: res.growthFte, profile: res.profile, systemRecommendation: res.systemRecommendation,
      rows: res.rows.map(r => Object.assign({}, r, { reason: SC.TASK_REASONS[r.id] }))
    },
    futureJD: SC.futureJD(res), reskilling: SC.reskillingPlan(res), workforce: SC.workforcePlan(res),
    leahFeedback: p.leah_feedback || null, aiSuggestions: p.ai_report || null, scoreVisible: showScore, debriefReleased: release
  };
  if (showScore) {
    report.score = Number(p.score != null ? p.score : rb.total);
    report.rubricTotal = rb.total; report.adjustment = Number(p.adjustment || 0);
    report.adjustmentNote = forAdmin || report.adjustment ? (p.adjustment_note || '') : '';
    report.band = SC.band(report.score); report.rubric = rb; report.categories = TT.CATEGORIES;
    const db = SC.debrief(res, rb);
    report.strengths = db.strengths; report.improvements = db.improvements;
    if (release) report.taskFeedback = db.taskFeedback;
  }
  if (release && s.leah && s.leah.agent) report.leahAgent = s.leah.agent;
  if (release && s.leah && s.leah.classInsights && s.leah.classInsights[p.round]) report.leahClassInsights = s.leah.classInsights[p.round];
  if (showScore && (forAdmin || s.showRank)) {
    const peers = (await S.listParticipants(p.round)).filter(x => x.status !== 'in_progress' && x.score != null)
      .sort((a, b) => Number(b.score) - Number(a.score));
    const idx = peers.findIndex(x => x.id === p.id);
    report.rank = idx >= 0 ? idx + 1 : null; report.ofTotal = peers.length;
  }
  return report;
}

/* ---------------- participant routes ---------------- */
async function routePublic() {
  const s = await getSettings();
  return json({ settings: publicSettings(s), caseFacts: s.case, serverNow: new Date().toISOString() });
}

async function routeStart(req) {
  const s = await getSettings();
  const b = await body(req);
  const name = cleanText(b.name, 80); const roll = cleanText(b.roll, 40);
  if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  if (!s.isOpen) throw new HttpError(403, 'The simulation is not open right now. Please wait for your faculty to open it.');
  if (s.endsAt && Date.parse(s.endsAt) <= Date.now()) throw new HttpError(403, 'This simulation session has ended.');
  const token = newToken();
  for (let i = 0; i < 6; i++) {
    const r = await S.insertParticipant({ code: newCode(), name, roll: roll || null, round: s.currentRound,
      token_hash: sha256(token), case_snapshot: s.case, draft: TT.emptyDecisions(),
      user_agent: cleanText(req.headers.get('user-agent'), 200) });
    if (r.row) return json({ token, me: participantView(r.row, s) });
  }
  throw new HttpError(500, 'Could not create your session. Please try again.');
}

async function routeMe(req) {
  const s = await getSettings();
  let p = await participantFromReq(req);
  p = await finalizeIfExpired(p, s);
  const docs = (await S.listDocuments(true)).map(docMeta);
  const out = { me: participantView(p, s), settings: publicSettings(s), case: TT.caseContent(p.case_snapshot),
    caseFacts: TT.sanitizeCase(p.case_snapshot), documents: docs };
  if (p.status !== 'in_progress') out.report = await buildReport(p, s, false);
  out.coach = coachState(p, s);
  return json(out);
}

async function routeSave(req) {
  const s = await getSettings();
  let p = await participantFromReq(req);
  const b = await body(req);
  if (p.status !== 'in_progress') return json({ ok: false, status: p.status, message: 'Already submitted.' }, 409);
  const dl = deadlineFor(p, s);
  if (dl !== null && Date.now() > dl + GRACE_MS) { p = await finalize(p, s, true); return json({ ok: false, status: p.status, message: 'Time is up — your last saved work was submitted.' }, 409); }
  const draft = TT.sanitizeDecisions(b.draft);
  await S.updateParticipant(p.id, { draft, last_seen_at: new Date().toISOString() });
  return json({ ok: true, savedAt: new Date().toISOString(), deadline: dl ? new Date(dl).toISOString() : null, serverNow: new Date().toISOString() });
}

async function routeSubmit(req) {
  const s = await getSettings();
  let p = await participantFromReq(req);
  const b = await body(req);
  if (p.status !== 'in_progress') return json({ ok: true, alreadySubmitted: true });
  const dl = deadlineFor(p, s);
  const late = dl !== null && Date.now() > dl + GRACE_MS;
  if (!late && b.draft) {
    const draft = TT.sanitizeDecisions(b.draft);
    const missing = TT.validate(draft);
    if (missing.length && !b.auto) throw new HttpError(400, 'Please complete: ' + missing.join('; '));
    p = await S.updateParticipant(p.id, { draft });
  }
  p = await finalize(p, s, late || !!b.auto);
  return json({ ok: true, status: p.status });
}

async function docAccess(req, id) {
  const tok = bearer(req); const isAdmin = await verifyAdminToken(tok);
  if (!isAdmin) await participantFromReq(req);
  const d = await S.documentById(id);
  if (!d || d.status !== 'ready' || (!d.visible && !isAdmin)) throw new HttpError(404, 'Document not found.');
  return d;
}
async function routeDoc(req, id) {
  const d = await docAccess(req, id);
  return json({ id: d.id, title: d.title, mime: d.mime, kind: ALLOWED_DOC_TYPES[d.mime] || 'other', size: d.size_bytes, chunks: d.chunks });
}
async function routeDocChunk(req, id, n) {
  const d = await docAccess(req, id);
  if (!(n >= 0 && n < d.chunks)) throw new HttpError(404, 'Not found');
  const buf = await S.getChunk(id, n);
  if (!buf) throw new HttpError(404, 'Document part missing — ask faculty to re-upload.');
  return new Response(buf, { status: 200, headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store, private',
    'content-disposition': 'inline', 'x-content-type-options': 'nosniff' } });
}

/* ---------------- AI coach & AI report suggestions ---------------- */
function coachState(p, s) {
  const used = (p.chat || []).filter(m => m.role === 'assistant' && m.source === 'ai').length;
  return { enabled: !!(s.ai.enabled && s.ai.bot), remaining: Math.max(0, s.ai.botMessages - used), limit: s.ai.botMessages,
    history: (p.chat || []).slice(-20).map(m => ({ role: m.role, content: m.content, source: m.source })) };
}

async function routeCoach(req) {
  const s = await getSettings();
  const p = await participantFromReq(req);
  const b = await body(req);
  const q = String(b.question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (q.length < 2) throw new HttpError(400, 'Type a question first.');
  const history = p.chat || [];
  const used = history.filter(m => m.role === 'assistant' && m.source === 'ai').length;
  let answer = null, source = 'builtin', note = '';
  let reason = !s.ai.bot ? 'The AI coach is switched off by faculty.' : await AI.blockedReason(s.ai);
  if (!reason && used >= s.ai.botMessages) reason = 'You have used all ' + s.ai.botMessages + ' AI coach replies for this attempt.';
  if (!reason) {
    try { answer = await AI.coachReply(s.ai, p.case_snapshot, TT.sanitizeDecisions(p.draft || {}), history, q); source = 'ai'; }
    catch (e) { console.error('AI coach failed:', e.message); reason = 'The AI service did not respond.'; }
  }
  if (!answer) { answer = AI.builtinCoach(q); note = reason ? reason + ' Answered by the built-in coach.' : ''; if (reason && !/switched off|used all/.test(reason)) await AI.recordFallback().catch(() => {}); }
  const at = new Date().toISOString();
  const chat = history.concat([{ role: 'user', content: q, at }, { role: 'assistant', content: answer, source, at }]).slice(-40);
  const np = await S.updateParticipant(p.id, { chat });
  return json({ answer, source, note, coach: coachState(np, s) });
}

async function routeAiReport(req) {
  const s = await getSettings();
  let p = await participantFromReq(req);
  if (p.status === 'in_progress') throw new HttpError(400, 'Submit first.');
  if (p.ai_report) return json({ available: true, suggestions: p.ai_report });
  if (!s.showScore) return json({ available: false, reason: 'Results have not been released yet.' });
  if (!s.ai.report) return json({ available: false, reason: 'AI suggestions are switched off by faculty.' });
  const reason = await AI.blockedReason(s.ai);
  if (reason) return json({ available: false, reason });
  try {
    const rep = await buildReport(p, s, false);
    const sug = await AI.reportSuggestions(s.ai, rep, !!s.releaseDebrief, SC.REFERENCE);
    if (!sug.suggestions.length) throw new Error('empty suggestions');
    const stored = Object.assign({ generatedAt: new Date().toISOString(), model: s.ai.model }, sug);
    await S.updateParticipant(p.id, { ai_report: stored });
    return json({ available: true, suggestions: stored });
  } catch (e) {
    console.error('AI report failed:', e.message); await AI.recordFallback().catch(() => {});
    return json({ available: false, reason: 'The AI service did not respond. Try again in a minute.', retry: true });
  }
}

/* ---------------- admin routes ---------------- */
async function routeAdminLogin(req) {
  const b = await body(req);
  if (!(await checkAdminPassword(String(b.password || '')))) {
    await new Promise(r => setTimeout(r, 900));
    throw new HttpError(401, 'Incorrect password.');
  }
  return json({ token: await issueAdminToken(12) });
}
async function routeAdminSetup(req) {
  const b = await body(req);
  await setupAdminPassword(String(b.password || ''));
  return json({ token: await issueAdminToken(12) });
}
async function routeAdminPassword(req) {
  await requireAdmin(req);
  const b = await body(req);
  await changeAdminPassword(String(b.current || ''), String(b.password || ''));
  return json({ ok: true, token: await issueAdminToken(12) });
}

async function routeAdminState(req, url) {
  await requireAdmin(req);
  const s = await getSettings();
  const round = url.searchParams.get('round') || s.currentRound;
  let rows = await S.listParticipants(round === '__all__' ? null : round);
  rows = await Promise.all(rows.map(p => finalizeIfExpired(p, s)));
  const nameCount = {};
  rows.forEach(p => { const k = p.name.toLowerCase(); nameCount[k] = (nameCount[k] || 0) + 1; });
  const scored = rows.filter(p => p.status !== 'in_progress' && p.score != null).sort((a, b) => Number(b.score) - Number(a.score));
  const rankOf = new Map(scored.map((p, i) => [p.id, i + 1]));
  const participants = rows.map(p => {
    const dl = deadlineFor(p, s); const d = TT.sanitizeDecisions(p.draft || {});
    const progress = TT.TASK_IDS.filter(id => d.modes[id]).length + (d.skills.length ? 1 : 0) + (d.workforce.strategy ? 1 : 0) +
      (d.recommendation ? 1 : 0) + (d.rationale.trim().length >= 40 ? 1 : 0);
    return { id: p.id, code: p.code, name: p.name, roll: p.roll, round: p.round, status: p.status,
      startedAt: p.started_at, submittedAt: p.submitted_at, lastSeen: p.last_seen_at,
      deadline: dl ? new Date(dl).toISOString() : null, progress: Math.round(progress / 10 * 100),
      score: p.score != null ? Number(p.score) : null, rank: rankOf.get(p.id) || null,
      rubric: p.rubric ? { business: p.rubric.business, course: p.rubric.course, job: p.rubric.job, ethics: p.rubric.ethics, complete: p.rubric.complete, total: p.rubric.total } : null,
      adjustment: Number(p.adjustment || 0), adjustmentNote: p.adjustment_note || '',
      summary: p.summary || null, decisions: p.decisions || null, hasLeah: !!p.leah_feedback, hasAi: !!p.ai_report,
      coachQuestions: (p.chat || []).filter(m => m.role === 'user').length,
      duplicateName: nameCount[p.name.toLowerCase()] > 1 };
  });
  const rounds = await S.listRounds();
  if (!rounds.includes(s.currentRound)) rounds.push(s.currentRound);
  const documents = (await S.listDocuments(false)).map(d => Object.assign(docMeta(d), { visible: d.visible, fileName: d.file_name, createdAt: d.created_at }));
  const ai = { configured: AI.aiConfigured(), usage: await AI.usage() };
  return json({ settings: s, ai, round, rounds, participants, documents, categories: TT.CATEGORIES,
    reference: SC.REFERENCE, taskReasons: SC.TASK_REASONS, serverNow: new Date().toISOString() });
}

async function routeAdminSettings(req) {
  await requireAdmin(req);
  const s = await getSettings(); const b = await body(req);
  const next = Object.assign({}, s);
  if ('title' in b) next.title = cleanText(b.title, 100) || DEFAULT_SETTINGS.title;
  if ('isOpen' in b) next.isOpen = !!b.isOpen;
  if ('timeLimitMinutes' in b) next.timeLimitMinutes = TT.clamp(Math.round(Number(b.timeLimitMinutes) || 0), 0, 600);
  if ('endsAt' in b) { const t = b.endsAt ? Date.parse(b.endsAt) : NaN; next.endsAt = Number.isFinite(t) ? new Date(t).toISOString() : null; }
  if ('endNow' in b && b.endNow) { next.endsAt = new Date().toISOString(); next.isOpen = false; }
  if ('currentRound' in b) next.currentRound = cleanText(b.currentRound, 60) || s.currentRound;
  if ('case' in b) next.case = TT.sanitizeCase(Object.assign({}, s.case, b.case));
  if ('showScore' in b) next.showScore = !!b.showScore;
  if ('releaseDebrief' in b) next.releaseDebrief = !!b.releaseDebrief;
  if ('showRank' in b) next.showRank = !!b.showRank;
  if (b.ai && typeof b.ai === 'object') {
    const a = Object.assign({}, s.ai);
    if ('enabled' in b.ai) a.enabled = !!b.ai.enabled;
    if ('bot' in b.ai) a.bot = !!b.ai.bot;
    if ('report' in b.ai) a.report = !!b.ai.report;
    if ('botMessages' in b.ai) a.botMessages = TT.clamp(Math.round(Number(b.ai.botMessages) || 0), 0, 50);
    if ('monthlyCreditCap' in b.ai) a.monthlyCreditCap = TT.clamp(Number(b.ai.monthlyCreditCap) || 0, 0, 280);
    if ('model' in b.ai && /^[a-z0-9.\-]{3,40}$/.test(String(b.ai.model))) a.model = String(b.ai.model);
    next.ai = a;
  }
  if ('orchestratorUrl' in b) {
    const u = String(b.orchestratorUrl || '').trim();
    next.leah = Object.assign({}, s.leah, { orchestratorUrl: /^https:\/\//.test(u) ? u.slice(0, 500) : DEFAULT_SETTINGS.leah.orchestratorUrl });
  }
  await S.saveSettingsData(next);
  return json({ ok: true, settings: next });
}

async function routeAdminParticipant(req, id) {
  await requireAdmin(req);
  const s = await getSettings(); const b = await body(req);
  const p = await S.participantById(id);
  if (!p) throw new HttpError(404, 'Participant not found.');
  if (b.action === 'report') return json({ report: await buildReport(p, s, true), draft: p.draft, chat: (p.chat || []).slice(-40) });
  if (b.action === 'clearAi') { await S.updateParticipant(id, { ai_report: null }); return json({ ok: true }); }
  if (b.action === 'adjust') {
    const adj = TT.clamp(Number(b.adjustment) || 0, -10, 10);
    const base = p.rubric ? Number(p.rubric.total) : null;
    await S.updateParticipant(id, { adjustment: adj, adjustment_note: cleanText(b.note, 300) || null,
      score: base == null ? null : TT.r1(TT.clamp(base + adj, 0, 100)) });
    return json({ ok: true });
  }
  if (b.action === 'forceSubmit') { if (p.status === 'in_progress') await finalize(p, s, true); return json({ ok: true }); }
  if (b.action === 'reopen') {
    await S.updateParticipant(id, { status: 'in_progress', submitted_at: null, started_at: new Date().toISOString(), decisions: null, rubric: null, summary: null, score: null, ai_report: null });
    return json({ ok: true });
  }
  if (b.action === 'delete') { await S.deleteParticipant(id); return json({ ok: true }); }
  throw new HttpError(400, 'Unknown action');
}

async function routeAdminDocInit(req) {
  await requireAdmin(req);
  const b = await body(req);
  const mime = String(b.mime || ''); const size = Number(b.size) || 0;
  if (!ALLOWED_DOC_TYPES[mime]) throw new HttpError(400, 'Unsupported file type. Upload PDF, image, Word (.docx), Excel (.xlsx), CSV or text. Convert PowerPoint to PDF first.');
  if (size <= 0) throw new HttpError(400, 'The file is empty.');
  if (size > MAX_FILE) throw new HttpError(400, 'File is larger than 50 MB.');
  for (const old of await S.listStaleUploads(6 * 3600 * 1000)) await S.deleteDocument(old.id).catch(() => {});
  const d = await S.insertDocument({ title: cleanText(b.title, 120) || cleanText(b.fileName, 120) || 'Document', file_name: cleanText(b.fileName, 160),
    mime, size_bytes: size, chunks: Math.ceil(size / CHUNK) });
  return json({ id: d.id, chunkSize: CHUNK, chunks: d.chunks });
}

async function routeAdminDocChunk(req, id, n) {
  await requireAdmin(req);
  const d = await S.documentById(id);
  if (!d || d.status !== 'uploading') throw new HttpError(404, 'Upload not found.');
  if (!(n >= 0 && n < d.chunks)) throw new HttpError(400, 'Invalid part number.');
  const buf = await req.arrayBuffer();
  const expected = n < d.chunks - 1 ? CHUNK : d.size_bytes - CHUNK * (d.chunks - 1);
  if (buf.byteLength !== expected) throw new HttpError(400, 'Upload part has the wrong size — please retry.');
  await S.putChunk(id, n, buf);
  return json({ ok: true });
}

async function routeAdminDocComplete(req, id) {
  await requireAdmin(req);
  const d = await S.documentById(id);
  if (!d || d.status !== 'uploading') throw new HttpError(404, 'Upload not found.');
  if ((await S.chunkCount(id)) !== d.chunks) throw new HttpError(400, 'Upload did not complete. Please try again.');
  const row = await S.updateDocument(id, { status: 'ready', visible: true });
  return json({ ok: true, document: docMeta(row) });
}

async function routeAdminDoc(req, id) {
  await requireAdmin(req);
  const b = await body(req);
  const d = await S.documentById(id);
  if (!d) throw new HttpError(404, 'Document not found.');
  if (b.action === 'toggle') { await S.updateDocument(id, { visible: !d.visible }); return json({ ok: true }); }
  if (b.action === 'rename') { await S.updateDocument(id, { title: cleanText(b.title, 120) || d.title }); return json({ ok: true }); }
  if (b.action === 'delete') { await S.deleteDocument(id); return json({ ok: true }); }
  throw new HttpError(400, 'Unknown action');
}

async function routeAdminAiTest(req) {
  await requireAdmin(req);
  const s = await getSettings();
  if (!AI.aiConfigured()) return json({ ok: false, message: 'Netlify AI Gateway is not available here. It needs a credit-based Netlify plan (Free, Personal or Pro), at least one production deploy, and AI features enabled for your team.' });
  try { const a = await AI.coachReply(Object.assign({}, s.ai, { enabled: true }), s.case, TT.emptyDecisions(), [], 'In one sentence, what does "capacity is not cash" mean here?'); return json({ ok: true, message: a, usage: await AI.usage() }); }
  catch (e) { return json({ ok: false, message: 'AI call failed: ' + e.message }); }
}

/* LEAH bridge: import orchestrator output pasted by faculty. */
function extractJsonBlock(raw, label) {
  const text = String(raw || '');
  const cands = [];
  const li = label ? text.indexOf(label) : -1;
  if (li >= 0) cands.push(text.slice(li));
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi; let m;
  while ((m = fence.exec(text))) cands.push(m[1]);
  cands.push(text);
  for (const c of cands) {
    const start = c.indexOf('{'); if (start < 0) continue;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(c.slice(start, i + 1)); } catch { break; } } }
    }
  }
  return null;
}

async function routeAdminLeahAgent(req) {
  await requireAdmin(req);
  const s = await getSettings(); const b = await body(req);
  if (b.clear) { s.leah.agent = null; await S.saveSettingsData(s); return json({ ok: true }); }
  const raw = String(b.raw || '').slice(0, 60000);
  if (raw.trim().length < 50) throw new HttpError(400, 'Paste the full LEAH response.');
  const j = extractJsonBlock(raw, 'TT_AGENT_JSON');
  let tasks = null;
  if (j && j.tasks) {
    tasks = {};
    TT.TASK_IDS.forEach(id => { const v = String(j.tasks[id] || '').toLowerCase(); tasks[id] = ['auto', 'assist', 'human'].includes(v) ? v : null; });
  }
  const narrative = raw.replace(/```[\s\S]*?```/g, '').replace(/TT_AGENT_JSON/g, '').trim();
  s.leah.agent = { importedAt: new Date().toISOString(), tasks,
    recommendation: j && TT.RECOMMENDATIONS[j.recommendation] ? j.recommendation : null,
    criticalTask: j && TT.TASK_IDS.includes(j.critical_task) ? j.critical_task : null,
    summary: j && j.summary ? cleanText(j.summary, 3000) : '', narrative: narrative.slice(0, 40000) };
  await S.saveSettingsData(s);
  return json({ ok: true, parsed: !!tasks, agent: s.leah.agent });
}

async function routeAdminLeahDebrief(req) {
  await requireAdmin(req);
  const s = await getSettings(); const b = await body(req);
  const round = cleanText(b.round, 60) || s.currentRound;
  const j = extractJsonBlock(String(b.raw || '').slice(0, 200000), 'TT_DEBRIEF_JSON');
  if (!j || !Array.isArray(j.students)) throw new HttpError(400, 'Could not find the TT_DEBRIEF_JSON block in the pasted text. Paste LEAH\'s full answer including the JSON block.');
  const rows = await S.listParticipants(round);
  const byCode = new Map(rows.map(p => [p.code.toUpperCase(), p]));
  let matched = 0; const unmatched = [];
  for (const st of j.students) {
    const p = byCode.get(String(st.code || '').toUpperCase().trim());
    if (!p) { unmatched.push(String(st.code || '?')); continue; }
    await S.updateParticipant(p.id, { leah_feedback: { importedAt: new Date().toISOString(),
      feedback: cleanText(st.feedback, 3000), strength: cleanText(st.strength, 800), improve: cleanText(st.improve, 800) } });
    matched++;
  }
  if (j.class_insights) {
    s.leah.classInsights = Object.assign({}, s.leah.classInsights, { [round]: { importedAt: new Date().toISOString(), text: cleanText(j.class_insights, 6000) } });
    await S.saveSettingsData(s);
  }
  return json({ ok: true, matched, unmatched });
}

/* ---------------- router ---------------- */
export default async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '/api').replace(/\/+$/, '');
  const m = req.method;
  try {
    if (path === '/api/public' && m === 'GET') return await routePublic();
    if (path === '/api/start' && m === 'POST') return await routeStart(req);
    if (path === '/api/me' && m === 'GET') return await routeMe(req);
    if (path === '/api/save' && m === 'POST') return await routeSave(req);
    if (path === '/api/submit' && m === 'POST') return await routeSubmit(req);
    let mm;
    if ((mm = path.match(/^\/api\/doc\/([0-9a-f-]{36})$/)) && m === 'GET') return await routeDoc(req, mm[1]);
    if ((mm = path.match(/^\/api\/doc\/([0-9a-f-]{36})\/chunk\/(\d{1,3})$/)) && m === 'GET') return await routeDocChunk(req, mm[1], Number(mm[2]));
    if (path === '/api/admin/status' && m === 'GET') return json(await adminStatus());
    if (path === '/api/admin/setup' && m === 'POST') return await routeAdminSetup(req);
    if (path === '/api/admin/password' && m === 'POST') return await routeAdminPassword(req);
    if (path === '/api/admin/login' && m === 'POST') return await routeAdminLogin(req);
    if (path === '/api/admin/state' && m === 'GET') return await routeAdminState(req, url);
    if (path === '/api/admin/settings' && m === 'POST') return await routeAdminSettings(req);
    if ((mm = path.match(/^\/api\/admin\/participant\/([0-9a-f-]{36})$/)) && m === 'POST') return await routeAdminParticipant(req, mm[1]);
    if (path === '/api/admin/doc/init' && m === 'POST') return await routeAdminDocInit(req);
    if ((mm = path.match(/^\/api\/admin\/doc\/([0-9a-f-]{36})\/chunk\/(\d{1,3})$/)) && m === 'PUT') return await routeAdminDocChunk(req, mm[1], Number(mm[2]));
    if ((mm = path.match(/^\/api\/admin\/doc\/([0-9a-f-]{36})\/complete$/)) && m === 'POST') return await routeAdminDocComplete(req, mm[1]);
    if ((mm = path.match(/^\/api\/admin\/doc\/([0-9a-f-]{36})$/)) && m === 'POST') return await routeAdminDoc(req, mm[1]);
    if (path === '/api/admin/leah/agent' && m === 'POST') return await routeAdminLeahAgent(req);
    if (path === '/api/admin/leah/debrief' && m === 'POST') return await routeAdminLeahDebrief(req);
    if (path === '/api/coach' && m === 'POST') return await routeCoach(req);
    if (path === '/api/ai-report' && m === 'POST') return await routeAiReport(req);
    if (path === '/api/admin/ai/test' && m === 'POST') return await routeAdminAiTest(req);
    if (path === '/api/health') return json({ ok: true, version: TT.RUBRIC_VERSION, ai: AI.aiConfigured() });
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    return json({ error: e.message || 'Server error' }, status);
  }
}

export const config = { path: '/api/*' };
