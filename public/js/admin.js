/* TALENT TWIN — faculty console */
(function () {
  'use strict';
  const M = window.TTModel; const U = window.TTUI; const { esc, $, $$, api, toast, store, fmtTime, fmtDuration, pct } = U;
  const KEY = 'tt_admin_token_v2';
  const money = n => M.money(n);
  let token = store.get(KEY);
  let st = null; let tab = 'dashboard'; let round = null; let refreshTimer = null; let filter = { q: '', status: 'all' };
  let clockOffset = 0;

  const show = id => ['login', 'console'].forEach(x => $('#' + x).classList.toggle('hide', x !== id));
  const nowS = () => Date.now() + clockOffset;

  /* ---------------- auth ---------------- */
  let setupMode = false;
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#loginBtn'); const label = b.textContent; b.disabled = true; b.textContent = setupMode ? 'Saving…' : 'Signing in…';
    try {
      if (setupMode && $('#pw').value !== $('#pw2').value) throw new Error('The two passwords do not match.');
      const r = await api('POST', setupMode ? '/admin/setup' : '/admin/login', { password: $('#pw').value });
      token = r.token; store.set(KEY, token); $('#pw').value = ''; $('#pw2').value = ''; if (setupMode) toast('Faculty password created. Keep it safe.', 5000); setupMode = false; await load();
    } catch (err) { toast(err.message, 5000); } finally { b.disabled = false; b.textContent = label; }
  });
  $('#logoutBtn').addEventListener('click', () => { store.del(KEY); token = null; clearInterval(refreshTimer); location.reload(); });

  async function load(silent) {
    try {
      const q = round ? '?round=' + encodeURIComponent(round) : '';
      st = await api('GET', '/admin/state' + q, null, token);
      round = st.round; clockOffset = Date.parse(st.serverNow) - Date.now();
      show('console'); ['liveChip', 'roundSel', 'logoutBtn'].forEach(id => $('#' + id).classList.remove('hide'));
      const rs = $('#roundSel');
      rs.innerHTML = st.rounds.map(r => '<option value="' + esc(r) + '" ' + (r === round ? 'selected' : '') + '>' + esc(r) + (r === st.settings.currentRound ? ' (current)' : '') + '</option>').join('') + '<option value="__all__" ' + (round === '__all__' ? 'selected' : '') + '>All rounds</option>';
      const lc = $('#liveChip'); const open = st.settings.isOpen && !(st.settings.endsAt && Date.parse(st.settings.endsAt) <= nowS());
      lc.className = 'chip ' + (open ? 'ok' : 'warn'); lc.textContent = open ? '● Open for participants' : '● Closed';
      if (!silent || tab === 'dashboard') renderTab(silent);
      clearInterval(refreshTimer); refreshTimer = setInterval(() => { if (tab === 'dashboard' && !document.hidden && !$('.drawer')) load(true); }, 10000);
    } catch (e) {
      if (e.status === 401) { store.del(KEY); token = null; show('login'); ['liveChip', 'roundSel', 'logoutBtn'].forEach(id => $('#' + id).classList.add('hide')); if (silent) toast('Session expired — please sign in again.'); }
      else toast(e.message, 5000);
    }
  }
  $('#roundSel').addEventListener('change', e => { round = e.target.value; load(); });
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; $$('.tab').forEach(t => t.classList.toggle('active', t === b)); renderTab(); });

  function renderTab(silent) {
    const host = $('#tabHost');
    if (tab === 'dashboard') { const y = window.scrollY; host.innerHTML = viewDashboard(); if (silent) window.scrollTo(0, y); }
    if (tab === 'settings') host.innerHTML = viewSettings();
    if (tab === 'documents') host.innerHTML = viewDocuments();
    if (tab === 'leah') host.innerHTML = viewLeah();
    if (tab === 'guide') host.innerHTML = viewGuide();
  }

  /* ---------------- dashboard ---------------- */
  const statusChip = p => {
    if (p.status === 'submitted') return '<span class="chip ok">Submitted</span>';
    if (p.status === 'auto_submitted') return '<span class="chip warn">Auto-submitted</span>';
    const left = p.deadline ? Date.parse(p.deadline) - nowS() : null;
    return '<span class="chip">In progress · ' + p.progress + '%' + (left != null ? ' · ' + (left > 0 ? fmtDuration(left) + ' left' : 'time up') : '') + '</span>';
  };
  function filtered() {
    const q = filter.q.toLowerCase();
    return st.participants.filter(p => (filter.status === 'all' || (filter.status === 'done' ? p.status !== 'in_progress' : p.status === 'in_progress')) &&
      (!q || (p.name + ' ' + p.code + ' ' + (p.roll || '')).toLowerCase().includes(q)))
      .sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || Date.parse(a.startedAt) - Date.parse(b.startedAt));
  }
  function viewDashboard() {
    const P = st.participants; const done = P.filter(p => p.status !== 'in_progress' && p.score != null);
    const avg = done.length ? done.reduce((s, p) => s + p.score, 0) / done.length : null;
    const s = st.settings;
    const stat = (k, v, sub) => '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
    const h = [];
    h.push('<div class="grid cols-4">' + stat('Participants', P.length, esc(round === '__all__' ? 'all rounds' : round)) + stat('In progress', P.filter(p => p.status === 'in_progress').length, 'working now') +
      stat('Submitted', done.length, P.filter(p => p.status === 'auto_submitted').length + ' auto-submitted') + stat('Average score', avg == null ? '—' : avg.toFixed(1), done.length ? 'top ' + Math.max(...done.map(p => p.score)) + ' · below 60: ' + done.filter(p => p.score < 60).length : '') + '</div>');

    const studentUrl = location.origin + '/';
    h.push('<div class="card" style="margin-top:14px"><div class="card-head"><div><h2>Session control</h2><p>Time limit: <b>' + (s.timeLimitMinutes ? s.timeLimitMinutes + ' minutes per participant' : 'none') + '</b>' + (s.endsAt ? ' · Session ends ' + fmtTime(s.endsAt) : '') + ' · Current round: <b>' + esc(s.currentRound) + '</b></p></div>' +
      '<div class="btn-row">' + (s.isOpen ? '<button class="btn btn-ghost" data-act="close">Close to new participants</button>' : '<button class="btn btn-primary" data-act="open">Open to participants</button>') +
      '<button class="btn btn-danger" data-act="endnow">End session now</button></div></div>' +
      '<div class="btn-row"><span class="small muted">Student link:</span><span class="mono">' + esc(studentUrl) + '</span><button class="btn btn-ghost btn-sm" data-copy="' + esc(studentUrl) + '">Copy</button><span class="small muted">· "End session now" auto-submits everyone\'s saved work.</span></div></div>');

    h.push('<div class="card"><div class="card-head"><div><h2>Leaderboard</h2><p>Ranked by automatic rubric score (plus any faculty adjustment). Click a row for the full report and decisions.</p></div><div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="csv">Export CSV</button></div></div>' +
      '<div class="btn-row" style="margin-bottom:10px"><input type="text" id="q" placeholder="Search name, code or roll" value="' + esc(filter.q) + '" style="max-width:280px"><select id="statusF" style="max-width:200px">' +
      [['all', 'All statuses'], ['done', 'Submitted'], ['progress', 'In progress']].map(([v, l]) => '<option value="' + v + '" ' + (filter.status === v ? 'selected' : '') + '>' + l + '</option>').join('') + '</select><span class="small muted">Auto-refreshes every 10 s</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Participant</th><th>Status</th><th class="num">Score</th>' + st.categories.map(c => '<th class="num" title="' + esc(c.label) + '">' + esc(c.label.split(' ')[0]) + ' /' + c.max + '</th>').join('') + '<th class="num">Time</th><th>LEAH</th></tr></thead><tbody id="lbBody">' + lbRows() + '</tbody></table></div></div>');

    if (done.length) {
      h.push('<div class="grid cols-2"><div class="card"><h2>Category averages</h2>' + st.categories.map(c => { const a = done.reduce((s2, p) => s2 + (p.rubric ? p.rubric[c.key] : 0), 0) / done.length; return '<div class="cat-row"><span>' + esc(c.label) + '</span><b style="text-align:right">' + a.toFixed(1) + ' / ' + c.max + '</b><div class="bar"><i style="width:' + pct(a, c.max) + '%"></i></div></div>'; }).join('') + '</div>');
      h.push('<div class="card"><h2>Class decisions</h2><p class="small muted" style="margin-top:4px">Share of submitted participants choosing each mode. Green = human-led, blue = augmented, amber = automated.</p>' + M.TASKS.map(t => {
        const c = { human: 0, assist: 0, auto: 0 }; done.forEach(p => { const m = p.decisions && p.decisions.modes[t.id] || 'human'; c[m]++; });
        const seg = (k, col) => '<i style="width:' + pct(c[k], done.length) + '%;background:' + col + ';display:inline-block;height:100%;border-radius:0"></i>';
        return '<div style="margin:10px 0"><div class="kv" style="border:0;padding:0 0 4px"><span class="small">' + esc(t.short) + '</span><span class="small muted">' + c.human + ' · ' + c.assist + ' · ' + c.auto + '</span></div><div class="bar" style="display:flex">' + seg('human', '#3b7d4f') + seg('assist', '#2e5aac') + seg('auto', '#d68b1d') + '</div></div>';
      }).join('') + '</div></div>');
    }
    return h.join('');
  }
  function lbRows() {
    const rows = filtered();
    if (!rows.length) return '<tr><td colspan="' + (6 + st.categories.length) + '" class="muted">No participants yet. Share the student link to begin.</td></tr>';
    return rows.map(p => {
      const end = p.submittedAt ? Date.parse(p.submittedAt) : nowS(); const dur = end - Date.parse(p.startedAt);
      const rk = p.rank ? '<span class="rank ' + (p.rank <= 3 ? 'r' + p.rank : '') + '">' + p.rank + '</span>' : '<span class="muted">—</span>';
      return '<tr class="clickable" data-pid="' + p.id + '"><td>' + rk + '</td><td><b>' + esc(p.name) + '</b>' + (p.duplicateName ? ' <span class="chip warn" title="Same name used more than once">duplicate</span>' : '') + '<div class="small muted"><span class="mono">' + esc(p.code) + '</span>' + (p.roll ? ' · ' + esc(p.roll) : '') + (round === '__all__' ? ' · ' + esc(p.round) : '') + '</div></td><td>' + statusChip(p) + '</td>' +
        '<td class="num"><b>' + (p.score != null ? p.score : '—') + '</b>' + (p.adjustment ? '<div class="small muted">' + (p.adjustment > 0 ? '+' : '') + p.adjustment + ' adj.</div>' : '') + '</td>' +
        st.categories.map(c => '<td class="num">' + (p.rubric ? p.rubric[c.key] : '—') + '</td>').join('') + '<td class="num">' + fmtDuration(dur) + '</td><td>' + (p.hasLeah ? '<span class="chip ok">✓</span>' : '') + '</td></tr>';
    }).join('');
  }

  /* ---------------- participant drawer ---------------- */
  async function openParticipant(id) {
    const p = st.participants.find(x => x.id === id); if (!p) return;
    const host = $('#drawerHost');
    host.innerHTML = '<div class="drawer-backdrop" data-close-drawer></div><aside class="drawer"><div class="drawer-head"><b style="flex:1">' + esc(p.name) + ' <span class="mono muted">' + esc(p.code) + '</span></b><button class="btn btn-ghost btn-sm" data-close-drawer>Close</button></div><div class="drawer-body"><p class="muted">Loading…</p></div></aside>';
    host.onclick = e => { if (e.target.closest('[data-close-drawer]')) host.innerHTML = ''; };
    try {
      const r = await api('POST', '/admin/participant/' + id, { action: 'report' }, token);
      const body = host.querySelector('.drawer-body');
      const actions = '<div class="card"><h3>Faculty actions</h3>' +
        (p.status !== 'in_progress' ? '<div class="grid cols-3" style="margin-top:10px;align-items:end"><div><label class="lbl" for="adjV">Score adjustment (−10 to +10)</label><input type="number" id="adjV" min="-10" max="10" step="0.5" value="' + p.adjustment + '"></div><div style="grid-column:span 2"><label class="lbl" for="adjN">Reason (shown to the participant)</label><input type="text" id="adjN" maxlength="300" value="' + esc(p.adjustmentNote) + '" placeholder="e.g. Excellent oral defence"></div></div><div class="btn-row" style="margin-top:10px"><button class="btn btn-primary btn-sm" data-pa="adjust">Save adjustment</button><button class="btn btn-ghost btn-sm" data-pa="reopen">Reopen attempt</button><button class="btn btn-danger btn-sm" data-pa="delete">Delete</button></div>'
          : '<p class="small muted" style="margin-top:6px">Live draft below (autosaved by the participant).</p><div class="btn-row"><button class="btn btn-primary btn-sm" data-pa="forceSubmit">Submit now on their behalf</button><button class="btn btn-danger btn-sm" data-pa="delete">Delete</button></div>') + '</div>';
      if (p.status === 'in_progress') {
        const d = M.sanitizeDecisions(r.draft || {}); const res = M.compute(r.report.case, d);
        body.innerHTML = actions + '<div class="card"><h3>Current draft</h3><div class="table-wrap" style="margin-top:8px"><table><tbody>' + M.TASKS.map(t => '<tr><td>' + esc(t.name) + '</td><td>' + (d.modes[t.id] ? M.MODES[d.modes[t.id]] : '<span class="muted">—</span>') + '</td></tr>').join('') + '</tbody></table></div>' +
          '<p class="small" style="margin-top:10px"><b>Skills:</b> ' + (d.skills.map(esc).join(' · ') || '—') + '<br><b>Net monthly benefit so far:</b> ' + money(res.monthlyNet) + '<br><b>Rationale:</b> ' + esc(d.rationale || '—') + '</p></div>';
      } else {
        body.innerHTML = actions + '<div id="drRep"></div>';
        window.TTReport.mount($('#drRep'), r.report, { admin: true });
      }
      body.onclick = async e => {
        const b = e.target.closest('[data-pa]'); if (!b) return; const a = b.dataset.pa;
        if (a === 'delete' && !(await U.confirmBox('Delete this attempt?', 'This permanently removes ' + esc(p.name) + '\'s attempt and score.', 'Delete'))) return;
        if (a === 'reopen' && !(await U.confirmBox('Reopen this attempt?', 'The participant can edit and resubmit from the same browser. Their score is cleared and their timer restarts.', 'Reopen'))) return;
        if (a === 'forceSubmit' && !(await U.confirmBox('Submit now?', 'Their current saved draft will be scored as an auto-submission.', 'Submit'))) return;
        const payload = { action: a }; if (a === 'adjust') { payload.adjustment = Number($('#adjV').value) || 0; payload.note = $('#adjN').value; }
        try { await api('POST', '/admin/participant/' + id, payload, token); toast('Saved.'); host.innerHTML = ''; await load(); if (a === 'adjust') openParticipant(id); } catch (err) { toast(err.message, 5000); }
      };
    } catch (e) { host.querySelector('.drawer-body').innerHTML = '<p class="note bad">' + esc(e.message) + '</p>'; }
  }

  /* ---------------- settings ---------------- */
  function toLocalInput(iso) { if (!iso) return ''; const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function viewSettings() {
    const s = st.settings; const c = s.case;
    const num = (id, label, v, hint, step) => '<div class="field"><label class="lbl" for="' + id + '">' + label + '</label><input type="number" id="' + id + '" value="' + v + '" step="' + (step || 1) + '" min="0">' + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
    const chk = (id, label, v, hint) => '<label class="check ' + (v ? 'on' : '') + '"><input type="checkbox" id="' + id + '" ' + (v ? 'checked' : '') + '><span>' + label + '<small>' + hint + '</small></span></label>';
    return '<div class="grid cols-2"><div class="card"><h2>Session & timer</h2>' +
      '<div class="field" style="margin-top:12px"><label class="lbl" for="sTitle">Simulation title</label><input type="text" id="sTitle" maxlength="100" value="' + esc(s.title) + '"></div>' +
      '<div class="field"><label class="check ' + (s.isOpen ? 'on' : '') + '"><input type="checkbox" id="sOpen" ' + (s.isOpen ? 'checked' : '') + '><span>Open to new participants<small>When off, nobody new can start. People already working continue.</small></span></label></div>' +
      num('sLimit', 'Time limit per participant (minutes)', s.timeLimitMinutes, '0 = no limit. Counted from when each participant starts. Changes apply to everyone immediately, including people already working.') +
      '<div class="field"><label class="lbl" for="sEnds">Session end time (optional)</label><input type="datetime-local" id="sEnds" value="' + toLocalInput(s.endsAt) + '"><div class="hint">At this time everyone\'s saved work is auto-submitted and new starts are blocked. Leave empty for no fixed end.</div></div>' +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-primary" data-act="saveSession">Save session settings</button></div></div>' +
      '<div class="card"><h2>Rounds & results visibility</h2><div class="field" style="margin-top:12px"><label class="lbl" for="sRound">Current round (new participants join this round)</label><input type="text" id="sRound" maxlength="60" value="' + esc(s.currentRound) + '"><div class="hint">Type a new name (e.g. "Section B" or "Round 2") to start a fresh leaderboard. Earlier rounds stay available in the round selector.</div></div>' +
      '<div class="radio-list" style="margin-top:12px">' + chk('sScore', 'Show score and rubric breakdown to participants after submission', s.showScore, 'If off, participants see only "submitted" until you switch it on.') +
      chk('sRank', 'Show each participant their rank in the round', s.showRank, 'Rank updates as more people submit.') +
      chk('sRelease', 'Release the debrief to participants', s.releaseDebrief, 'Adds the evidence-based reference choices and the LEAH case recommendation to every report. Switch on after everyone has submitted.') + '</div>' +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-primary" data-act="saveVisibility">Save round & visibility</button></div>' +
      '<h3 style="margin-top:22px">Faculty password</h3><div class="grid cols-2" style="margin-top:8px"><div><label class="lbl" for="pwCur">Current password</label><input type="password" id="pwCur" autocomplete="current-password"></div><div><label class="lbl" for="pwNew">New password (10+ characters)</label><input type="password" id="pwNew" autocomplete="new-password"></div></div><div class="btn-row" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-act="changePw">Change password</button><span class="small muted">If the ADMIN_PASSWORD environment variable is set in Netlify, change it there instead.</span></div></div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Case facts</h2><p>Fixed for all participants. Each participant is scored on the facts in force when they started, so mid-round changes do not affect people already working.</p></div><button class="btn btn-ghost btn-sm" data-act="resetCase">Reset to defaults</button></div>' +
      '<div class="grid cols-3"><div class="field"><label class="lbl" for="cCompany">Company name</label><input type="text" id="cCompany" value="' + esc(c.company) + '"></div><div class="field"><label class="lbl" for="cIndustry">Industry</label><input type="text" id="cIndustry" value="' + esc(c.industry) + '"></div>' +
      '<div class="field"><label class="lbl" for="cHorizon">Planning horizon</label><select id="cHorizon">' + [12, 36, 60].map(v => '<option value="' + v + '" ' + (c.horizon === v ? 'selected' : '') + '>' + v / 12 + ' year(s)</option>').join('') + '</select></div>' +
      num('cHead', 'Team size (executives)', c.headcount) + num('cSalary', 'Average monthly salary (₹)', c.salary, '', 1000) + num('cHours', 'Monthly task workload (hours)', c.hours, '', 100) +
      num('cSetup', 'One-time budget (₹)', c.setupBudget, '', 50000) + num('cCap', 'Monthly AI running-cost cap (₹)', c.monthlyCap, '', 10000) + num('cOver', 'Oversight cost per month if any AI is used (₹)', c.overhead, '', 5000) +
      num('cGrowth', 'Annual volume growth (%)', c.growth) + '</div><div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" data-act="saveCase">Save case facts</button><span class="small muted">Defaults are calibrated so the evidence-backed redesign is also the strongest business case.</span></div></div>';
  }

  /* ---------------- documents ---------------- */
  const EXT_MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown' };
  function viewDocuments() {
    return '<div class="card"><div class="card-head"><div><h2>Upload a document</h2><p>PDF, image, Word (.docx), Excel (.xlsx), CSV or text, up to 50 MB. Participants view documents in a protected viewer: no download button, watermarked with their name, and served only to signed-in participants. Convert PowerPoint to PDF before uploading.</p></div></div>' +
      '<div class="grid cols-3" style="align-items:end"><div class="field"><label class="lbl" for="dTitle">Title shown to participants</label><input type="text" id="dTitle" maxlength="120" placeholder="e.g. Sahaay Commerce — CX dashboard"></div><div class="field"><label class="lbl" for="dFile">File</label><input type="file" id="dFile" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.xls,.csv,.txt,.md"></div><div class="field"><button class="btn btn-primary" data-act="upload" style="width:100%">Upload</button></div></div><div id="upProg" class="hint"></div></div>' +
      '<div class="card"><h2>Shared documents</h2><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Title</th><th>Type</th><th class="num">Size</th><th>Visibility</th><th></th></tr></thead><tbody>' +
      (st.documents.length ? st.documents.map(d => '<tr><td><b>' + esc(d.title) + '</b><div class="small muted">' + esc(d.fileName) + ' · ' + fmtTime(d.createdAt) + '</div></td><td>' + esc(d.kind.toUpperCase()) + '</td><td class="num">' + (d.size ? Math.max(1, Math.round(d.size / 1024)).toLocaleString('en-IN') + ' KB' : '—') + '</td><td>' + (d.visible ? '<span class="chip ok">Visible</span>' : '<span class="chip">Hidden</span>') + '</td>' +
        '<td><div class="btn-row"><button class="btn btn-ghost btn-sm" data-dview="' + d.id + '" data-title="' + esc(d.title) + '">Preview</button><button class="btn btn-ghost btn-sm" data-dact="toggle" data-id="' + d.id + '">' + (d.visible ? 'Hide' : 'Show') + '</button><button class="btn btn-ghost btn-sm" data-dact="rename" data-id="' + d.id + '" data-title="' + esc(d.title) + '">Rename</button><button class="btn btn-danger btn-sm" data-dact="delete" data-id="' + d.id + '">Delete</button></div></td></tr>').join('')
        : '<tr><td colspan="5" class="muted">No documents yet.</td></tr>') + '</tbody></table></div><p class="hint">Honest limit: a web page cannot stop screenshots or a determined user with developer tools. These measures prevent casual downloading and make any leak traceable to a name.</p></div>';
  }
  async function upload() {
    const f = $('#dFile').files[0]; if (!f) return toast('Choose a file first.');
    const ext = (f.name.split('.').pop() || '').toLowerCase(); const mime = EXT_MIME[ext];
    if (!mime) return toast('Unsupported file type. Convert PowerPoint to PDF first.', 5000);
    if (f.size > 50 * 1024 * 1024) return toast('File is larger than 50 MB.');
    const title = $('#dTitle').value.trim() || f.name.replace(/\.[^.]+$/, '');
    const prog = $('#upProg'); prog.textContent = 'Preparing upload…';
    try {
      const init = await api('POST', '/admin/doc/init', { title, fileName: f.name, mime, size: f.size }, token);
      for (let i = 0; i < init.chunks; i++) {
        prog.textContent = 'Uploading… ' + Math.round(i / init.chunks * 100) + '%';
        const part = f.slice(i * init.chunkSize, Math.min(f.size, (i + 1) * init.chunkSize));
        let ok = false, lastErr = '';
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          const r = await fetch('/api/admin/doc/' + init.id + '/chunk/' + i, { method: 'PUT', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/octet-stream' }, body: part });
          ok = r.ok; if (!ok) lastErr = ((await r.json().catch(() => ({}))).error) || ('HTTP ' + r.status);
        }
        if (!ok) throw new Error('Upload failed: ' + lastErr);
      }
      prog.textContent = 'Finishing…';
      await api('POST', '/admin/doc/' + init.id + '/complete', null, token);
      prog.textContent = ''; toast('Uploaded: ' + title); await load();
    } catch (e) { prog.textContent = ''; toast(e.message, 6000); }
  }

  /* ---------------- LEAH bridge ---------------- */
  function caseBlock(c) {
    const cc = M.caseContent(c); const lph = c.headcount * c.salary / c.hours;
    return ['CASE BRIEF', ...cc.brief, '', 'CURRENT JOB DESCRIPTION: ' + cc.jd.title + ' (reports to ' + cc.jd.reportsTo + ', ' + cc.jd.location + ')', 'Purpose: ' + cc.jd.purpose,
      'Competencies: ' + cc.jd.competencies.join('; '), '', 'TASK GROUPS (key | name | share of workload | risk | time released if AI-augmented / automated | monthly AI running cost augmented / automated | one-time setup cost augmented / automated)',
      ...M.TASKS.map(t => '- ' + t.id + ' | ' + t.name + ' | ' + t.share + '% | ' + (t.risk >= 4 ? 'High' : t.risk === 2 ? 'Medium' : 'Low') + ' | ' + t.assist + '% / ' + t.auto + '% | ' + M.rupees(t.assistRun) + ' / ' + M.rupees(t.autoRun) + ' | ' + M.rupees(t.assistSetup) + ' / ' + M.rupees(t.autoSetup)),
      '', 'EVIDENCE CARDS', ...cc.evidence.map(e => e.id + ' ' + e.title + ': ' + e.points.join(' ')), '',
      'FINANCIAL ASSUMPTIONS: team ' + c.headcount + ' executives; average salary ' + M.rupees(c.salary) + '/month; payroll ' + M.rupees(c.headcount * c.salary) + '/month; workload ' + c.hours + ' task-hours/month; labour cost per workload-hour ' + M.rupees(lph) +
      '; human oversight ' + M.rupees(c.overhead) + '/month whenever any AI is used; one-time budget ' + M.rupees(c.setupBudget) + '; AI running-cost cap ' + M.rupees(c.monthlyCap) + '/month; planning horizon ' + c.horizon + ' months; volume growth ' + c.growth + '%/year.',
      'MODEL RULES: hours released = task hours x time-release % x adoption maturity; value realized = hours released x labour cost per hour x realization share (capacity is not cash); net monthly benefit = value realized - AI running costs - oversight; one-time cost = setup costs + reskilling; payback = one-time cost / net monthly benefit.'].join('\n');
  }
  function promptA() {
    return 'MODE A – CASE RECOMMENDATION\nYou are the TALENT TWIN – AI Job Redesign Orchestrator. Analyse the simulation case below for the TALENT TWIN Job Redesign Lab. Use only these facts. Assume expected adoption (80%) and 70% value realization unless you justify otherwise. Finish with the TT_AGENT_JSON block exactly as specified, using the task keys faq, routing, followup, refund, complaint, qa.\n\n' + caseBlock(st.settings.case);
  }
  function debriefRows() { return st.participants.filter(p => p.status !== 'in_progress' && p.decisions); }
  function promptB(batch, size) {
    const rows = debriefRows().slice(batch * size, batch * size + size);
    const lines = rows.map(p => {
      const d = p.decisions; const s = p.summary || {}; const r = p.rubric || {};
      return ['Code: ' + p.code + ' | Score ' + p.score + '/100 (business ' + r.business + '/25, task fit ' + r.course + '/25, job design ' + r.job + '/20, responsible AI ' + r.ethics + '/20, completeness ' + r.complete + '/10)',
        'Tasks: ' + M.TASK_IDS.map(id => id + '=' + (d.modes[id] || 'human')).join(', '),
        'Skills: ' + (d.skills.join('; ') || 'none') + ' | Safeguards: ' + (d.safeguards.join('; ') || 'none'),
        'Workforce: ' + (M.WORKFORCE[d.workforce.strategy] ? M.WORKFORCE[d.workforce.strategy].label : 'none') + ' | Hiring trigger: ' + (M.HIRING_TRIGGERS[d.workforce.trigger] || 'none') + ' | New roles: ' + (d.workforce.roles.join('; ') || 'none'),
        'Assumptions: reskilling ' + M.rupees(d.training) + ', adoption ' + Math.round(d.adoption * 100) + '%, realization ' + Math.round(d.realization * 100) + '%',
        'Economics: net monthly ' + M.rupees(s.monthlyNet || 0) + '; monthly AI+oversight ' + M.rupees(s.monthlySpend || 0) + (s.overrun ? ' (OVER CAP)' : '') + '; one-time ' + M.rupees(s.capex || 0) + (s.capexOver ? ' (OVER BUDGET)' : '') + '; payback ' + (s.payback == null ? 'not reached' : s.payback + ' months'),
        'Recommendation: ' + (M.RECOMMENDATIONS[d.recommendation] || 'none') + ' | Human-accountability task: ' + (d.criticalTask || 'none'),
        'Rationale: "' + (d.rationale || '').replace(/\s+/g, ' ').trim() + '"'].join('\n');
    });
    return 'MODE B – CLASS DEBRIEF\nYou are the TALENT TWIN – AI Job Redesign Orchestrator. Debrief this batch of student submissions from the TALENT TWIN Job Redesign Lab (' + (round === '__all__' ? 'all rounds' : round) + '). Use the anonymous codes exactly as given; never guess identities; do not change scores. Finish with the TT_DEBRIEF_JSON block exactly as specified.\n\n' +
      caseBlock(st.settings.case) + '\n\nSTUDENT SUBMISSIONS (' + rows.length + ')\n' + lines.join('\n---\n');
  }
  function viewLeah() {
    const s = st.settings; const a = s.leah.agent; const n = debriefRows().length; const size = 12; const batches = Math.max(1, Math.ceil(n / size));
    const ins = s.leah.classInsights && s.leah.classInsights[round];
    return '<div class="card"><div class="card-head"><div><h2>LEAH · TALENT TWIN orchestrator</h2><p>LEAH runs inside IIMV\'s LEAH workspace. This console prepares the exact input, you run it in LEAH, then paste LEAH\'s answer back here. The app imports the result for every participant: no LEAH accounts are needed for students.</p></div></div>' +
      '<div class="grid cols-3" style="align-items:end"><div class="field" style="grid-column:span 2"><label class="lbl" for="lUrl">Orchestrator link</label><input type="text" id="lUrl" value="' + esc(s.leah.orchestratorUrl) + '"></div><div class="field btn-row"><button class="btn btn-ghost" data-act="saveUrl">Save link</button><a class="btn btn-dark" href="' + esc(s.leah.orchestratorUrl) + '" target="_blank" rel="noopener">Open LEAH ↗</a></div></div>' +
      '<ol class="small muted" style="margin:10px 0 0;padding-left:18px"><li>Copy a prompt below.</li><li>Open the orchestrator in LEAH, choose <b>Preview</b>, paste and send.</li><li>When LEAH finishes, copy its whole answer (including the JSON block at the end) and paste it into the matching box below.</li></ol></div>' +

      '<div class="grid cols-2"><div class="card"><h2>Step A · Case recommendation</h2><p class="small muted" style="margin-top:4px">Run once per case. Shown to participants (with a task-by-task comparison) when you release the debrief.</p>' +
      '<label class="lbl" style="margin-top:10px">Prompt for LEAH</label><textarea id="pA" readonly style="min-height:150px" class="mono">' + esc(promptA()) + '</textarea><div class="btn-row" style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-copyel="pA">Copy prompt</button></div>' +
      '<label class="lbl" for="rA" style="margin-top:12px">Paste LEAH\'s answer</label><textarea id="rA" placeholder="Paste the full answer, including the TT_AGENT_JSON block"></textarea><div class="btn-row" style="margin-top:8px"><button class="btn btn-primary btn-sm" data-act="importA">Import recommendation</button>' + (a ? '<button class="btn btn-danger btn-sm" data-act="clearA">Remove</button>' : '') + '</div>' +
      (a ? '<div class="leah" style="margin-top:12px"><span class="tag">Imported ' + fmtTime(a.importedAt) + '</span>' + (a.tasks ? '<p class="small">' + M.TASKS.map(t => esc(t.short) + ': <b>' + (M.MODES[a.tasks[t.id]] || '—') + '</b>').join(' · ') + '</p>' : '<p class="note warn">No TT_AGENT_JSON block was found, so only the narrative was saved.</p>') + (a.summary ? '<p class="small" style="margin:0">' + esc(a.summary) + '</p>' : '') + '</div>' : '') + '</div>' +

      '<div class="card"><h2>Step B · Class debrief and per-student feedback</h2><p class="small muted" style="margin-top:4px">Uses anonymous codes only (no names). ' + n + ' submitted participant(s) in ' + esc(round === '__all__' ? 'all rounds' : round) + '. Feedback appears in each participant\'s report as soon as it is imported.</p>' +
      (n ? '<div class="btn-row" style="margin-top:10px"><label class="lbl" for="bSel" style="margin:0">Batch</label><select id="bSel" style="width:auto">' + Array.from({ length: batches }, (_, i) => '<option value="' + i + '">' + (i + 1) + ' of ' + batches + ' (participants ' + (i * size + 1) + '–' + Math.min(n, (i + 1) * size) + ')</option>').join('') + '</select></div>' +
        '<label class="lbl" style="margin-top:10px">Prompt for LEAH</label><textarea id="pB" readonly style="min-height:150px" class="mono">' + esc(promptB(0, size)) + '</textarea><div class="btn-row" style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-copyel="pB">Copy prompt</button></div>' +
        '<label class="lbl" for="rB" style="margin-top:12px">Paste LEAH\'s answer</label><textarea id="rB" placeholder="Paste the full answer, including the TT_DEBRIEF_JSON block"></textarea><div class="btn-row" style="margin-top:8px"><button class="btn btn-primary btn-sm" data-act="importB">Import feedback</button></div>'
        : '<p class="note" style="margin-top:10px">No submissions yet in this round.</p>') +
      (ins ? '<div class="leah" style="margin-top:12px"><span class="tag">Class insights · imported ' + fmtTime(ins.importedAt) + '</span><p class="prose" style="margin:0">' + esc(ins.text) + '</p></div>' : '') + '</div></div>';
  }

  /* ---------------- scoring guide ---------------- */
  function viewGuide() {
    const ref = st.reference;
    return '<div class="card"><h2>How participants are scored</h2><p class="muted" style="margin-top:4px">The score is calculated on the server from each participant\'s decisions; the browser cannot submit its own score. The rubric is a transparent teaching aid, not a validated assessment.</p>' +
      '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Category</th><th class="num">Points</th><th>What is scored</th></tr></thead><tbody>' +
      '<tr><td>Business impact & economics</td><td class="num">25</td><td class="small">Net monthly benefit (10), planning-horizon value (5), within monthly AI cap (4), within one-time budget (3), payback ≤12 / ≤24 / ≤36 months (3/2/1)</td></tr>' +
      '<tr><td>Course concepts & task fit</td><td class="num">25</td><td class="small">Each task\'s mode against its repeatability, risk and need for judgment (table below), scaled to 25</td></tr>' +
      '<tr><td>Job design & reskilling</td><td class="num">20</td><td class="small">Focused 3–7 skill portfolio (7), an AI-collaboration skill (1.5), a human-judgment skill (1.5), Hackman & Oldham safeguards (10, full credit at 3)</td></tr>' +
      '<tr><td>Responsible AI & people impact</td><td class="num">20</td><td class="small">Human accountability on refunds, complaints and QA (8), change management (2), judgment/empathy skill (2), quality skill (2), reskilling ≥ ₹75K (2), cautious adoption and realization (2), people-first workforce strategy (2)</td></tr>' +
      '<tr><td>Completeness & case evidence</td><td class="num">10</td><td class="small">All six tasks decided (1), recommendation consistent with own results (2), human-accountability task = complaints or refunds (2), rationale length + at least two evidence IDs cited (3), 3+ safeguards (1), workforce plan complete (1)</td></tr></tbody></table></div>' +
      '<p class="small" style="margin-top:10px"><b>Faculty adjustment:</b> up to ±10 points per participant with a reason shown to them, e.g. for an oral defence. The rationale is checked for length and evidence citations, not judged for quality; use the LEAH debrief and class discussion for that.</p></div>' +
      '<div class="card"><h2>Reference pattern (faculty only)</h2><p class="small muted" style="margin-top:4px">Not visible to participants until you release the debrief.</p><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Task</th><th>Strongest fit</th><th>Also defensible</th><th>Evidence</th><th>Why</th></tr></thead><tbody>' +
      M.TASKS.map(t => { const r = ref[t.id]; return '<tr><td><b>' + esc(t.short) + '</b></td><td>' + M.MODES[r.best] + '</td><td>' + r.ok.map(x => M.MODES[x]).join(', ') + '</td><td class="mono">' + r.evidence.join(', ') + '</td><td class="small">' + esc(r.why) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="small" style="margin-top:10px">With the default case facts, the reference pattern scores about 97, a cautious "augment routine work" design about 95, "automate only FAQs" about 91, "no AI" about 72 and "automate everything" about 66–70. Changing case facts changes the economics, so re-check before class.</p></div>' +
      '<div class="card"><h2>Debrief questions</h2><ol class="small"><li>Which tasks did you keep human-critical, and which evidence card drove that choice?</li><li>Where was AI technically feasible but economically unattractive? (Look at negative task-level net values.)</li><li>What is the difference between hours released and cash savings? What did you assume, and why?</li><li>Does your redesign enrich or hollow out the job: autonomy, skill variety, task identity, significance, feedback?</li><li>How does your workforce plan use 28% attrition and 32% growth instead of layoffs?</li><li>What would you need to validate before implementing this in a real Indian company (data, DPDP Act compliance, pilot metrics)?</li></ol></div>';
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', async e => {
    if (!st) return;
    const row = e.target.closest('tr[data-pid]'); if (row && $('#tabHost').contains(row)) return openParticipant(row.dataset.pid);
    const cp = e.target.closest('[data-copy]'); if (cp) { await copy(cp.dataset.copy); return; }
    const ce = e.target.closest('[data-copyel]'); if (ce) { await copy($('#' + ce.dataset.copyel).value); return; }
    const dv = e.target.closest('[data-dview]'); if (dv) return window.TTViewer.open(dv.dataset.dview, token, 'Faculty preview', dv.dataset.title);
    const da = e.target.closest('[data-dact]');
    if (da) {
      const id = da.dataset.id; const a = da.dataset.dact; const payload = { action: a };
      if (a === 'delete' && !(await U.confirmBox('Delete document?', 'Participants will no longer see it. This cannot be undone.', 'Delete'))) return;
      if (a === 'rename') { const t = prompt('New title', da.dataset.title); if (!t) return; payload.title = t; }
      try { await api('POST', '/admin/doc/' + id, payload, token); await load(); } catch (err) { toast(err.message, 5000); }
      return;
    }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === 'open' || act === 'close') { await saveSettings({ isOpen: act === 'open' }); }
      if (act === 'endnow') { if (await U.confirmBox('End the session now?', 'Everyone still working will have their saved work auto-submitted, and new participants are blocked. You can reopen later by clearing the end time.', 'End session')) await saveSettings({ endNow: true }); }
      if (act === 'csv') exportCsv();
      if (act === 'saveSession') { const v = $('#sEnds').value; await saveSettings({ title: $('#sTitle').value, isOpen: $('#sOpen').checked, timeLimitMinutes: Number($('#sLimit').value) || 0, endsAt: v ? new Date(v).toISOString() : null }); }
      if (act === 'saveVisibility') await saveSettings({ currentRound: $('#sRound').value, showScore: $('#sScore').checked, showRank: $('#sRank').checked, releaseDebrief: $('#sRelease').checked });
      if (act === 'saveCase') await saveSettings({ case: { company: $('#cCompany').value, industry: $('#cIndustry').value, horizon: Number($('#cHorizon').value), headcount: Number($('#cHead').value), salary: Number($('#cSalary').value), hours: Number($('#cHours').value), setupBudget: Number($('#cSetup').value), monthlyCap: Number($('#cCap').value), overhead: Number($('#cOver').value), growth: Number($('#cGrowth').value) } });
      if (act === 'resetCase') { if (await U.confirmBox('Reset case facts?', 'Restore the calibrated default case for new participants.', 'Reset')) await saveSettings({ case: M.DEFAULT_CASE }); }
      if (act === 'upload') await upload();
      if (act === 'changePw') { const r = await api('POST', '/admin/password', { current: $('#pwCur').value, password: $('#pwNew').value }, token); token = r.token; store.set(KEY, token); $('#pwCur').value = ''; $('#pwNew').value = ''; toast('Password changed. Other faculty sessions are signed out.', 5000); }
      if (act === 'saveUrl') await saveSettings({ orchestratorUrl: $('#lUrl').value });
      if (act === 'importA') { const r = await api('POST', '/admin/leah/agent', { raw: $('#rA').value }, token); toast(r.parsed ? 'LEAH recommendation imported.' : 'Imported, but no TT_AGENT_JSON block was found.', 5000); await load(); }
      if (act === 'clearA') { await api('POST', '/admin/leah/agent', { clear: true }, token); await load(); }
      if (act === 'importB') { const r = await api('POST', '/admin/leah/debrief', { raw: $('#rB').value, round: round === '__all__' ? st.settings.currentRound : round }, token); toast('Feedback imported for ' + r.matched + ' participant(s)' + (r.unmatched.length ? '. Unmatched codes: ' + r.unmatched.join(', ') : '.'), 7000); await load(); }
    } catch (err) { toast(err.message, 6000); }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') { filter.q = e.target.value; $('#lbBody').innerHTML = lbRows(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'statusF') { filter.status = e.target.value; $('#lbBody').innerHTML = lbRows(); }
    if (e.target.id === 'bSel') $('#pB').value = promptB(Number(e.target.value), 12);
    if (e.target.matches('.check input')) e.target.closest('.check').classList.toggle('on', e.target.checked);
  });
  async function saveSettings(patch) { await api('POST', '/admin/settings', patch, token); toast('Settings saved.'); await load(); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.'); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied.'); }
  }

  function exportCsv() {
    const cats = st.categories;
    const head = ['Rank', 'Code', 'Name', 'Roll', 'Round', 'Status', 'Score', ...cats.map(c => c.label + ' /' + c.max), 'Adjustment', 'Adjustment note', 'Started', 'Submitted', 'Minutes taken',
      ...M.TASKS.map(t => t.short), 'Recommendation', 'Net monthly benefit (INR)', 'Payback (months)', 'One-time cost (INR)', 'LEAH feedback'];
    const rows = filtered().map(p => {
      const d = p.decisions || {}; const s = p.summary || {}; const end = p.submittedAt ? Date.parse(p.submittedAt) : null;
      return [p.rank || '', p.code, p.name, p.roll || '', p.round, p.status, p.score == null ? '' : p.score, ...cats.map(c => p.rubric ? p.rubric[c.key] : ''), p.adjustment, p.adjustmentNote,
        new Date(p.startedAt).toISOString(), p.submittedAt || '', end ? Math.round((end - Date.parse(p.startedAt)) / 60000) : '',
        ...M.TASKS.map(t => d.modes ? (M.MODES[d.modes[t.id]] || '') : ''), d.recommendation ? M.RECOMMENDATIONS[d.recommendation] : '', s.monthlyNet == null ? '' : s.monthlyNet, s.payback == null ? '' : s.payback, s.capex == null ? '' : s.capex, p.hasLeah ? 'yes' : ''];
    });
    const cell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const csv = '﻿' + [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'talent-twin-' + (round === '__all__' ? 'all-rounds' : round.replace(/[^A-Za-z0-9]+/g, '-')) + '-results.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function boot() {
    if (token) return load();
    show('login');
    try {
      const st0 = await api('GET', '/admin/status');
      if (!st0.configured) {
        $('#loginTitle').textContent = 'Create the faculty password';
        $('#loginHint').textContent = 'First-time setup: choose the password faculty will use for this console (at least 10 characters). Do this right after deploying.';
        $('#pw2Wrap').classList.remove('hide'); $('#pw').setAttribute('autocomplete', 'new-password'); $('#loginBtn').textContent = 'Create password'; setupMode = true;
      }
    } catch (e) { toast(e.message, 6000); }
  }
  boot();
})();
