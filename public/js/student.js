/* TALENT TWIN — participant app */
(function () {
  'use strict';
  const M = window.TTModel; const U = window.TTUI; const { esc, $, $$, api, toast, store } = U;
  const TOKEN_KEY = 'tt_participant_token_v2';
  const money = n => M.money(n);

  let token = store.get(TOKEN_KEY);
  let S = null;                // server state from /me
  let draft = null;            // working decisions
  let step = 'case';
  let clockOffset = 0;         // serverNow − local now
  let saveTimer = null, saving = false, dirty = false;
  let lastRun = null;          // { hash, res }
  let submitting = false, warned5 = false, warned1 = false;
  let pollTimer = null, tickTimer = null, reportPoll = null;

  const show = id => ['landing', 'app', 'reportView'].forEach(x => $('#' + x).classList.toggle('hide', x !== id));
  const now = () => Date.now() + clockOffset;
  const econHash = () => JSON.stringify([draft.modes, draft.skills, draft.training, draft.adoption, draft.realization]);

  /* ---------------- boot / landing ---------------- */
  async function boot() {
    if (token) { try { await loadMe(); return; } catch (e) { if (e.status !== 401) { toast(e.message); } else { store.del(TOKEN_KEY); token = null; } } }
    showLanding();
  }

  async function showLanding() {
    show('landing'); ['whoChip', 'saveChip', 'timerChip'].forEach(id => $('#' + id).classList.add('hide'));
    try {
      const p = await api('GET', '/public');
      $('#landingTitle').textContent = p.settings.title;
      const st = $('#landingStatus');
      if (!p.settings.isOpen || (p.settings.endsAt && Date.parse(p.settings.endsAt) <= Date.parse(p.serverNow))) {
        st.className = 'note warn'; st.textContent = 'The simulation is not open right now. Please wait for your faculty to open it, then refresh this page.'; st.classList.remove('hide');
        $('#startBtn').disabled = true;
      } else { st.classList.add('hide'); $('#startBtn').disabled = false; }
      $('#limitNote').textContent = p.settings.timeLimitMinutes ? 'Time limit: ' + p.settings.timeLimitMinutes + ' minutes from start' : '';
    } catch (e) { const st = $('#landingStatus'); st.className = 'note bad'; st.textContent = e.message; st.classList.remove('hide'); }
  }

  $('#startForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const name = $('#pName').value.trim(); if (name.length < 2) { toast('Please enter your full name.'); return; }
    const btn = $('#startBtn'); btn.disabled = true; btn.textContent = 'Starting…';
    try {
      const r = await api('POST', '/start', { name, roll: $('#pRoll').value.trim() });
      token = r.token; store.set(TOKEN_KEY, token);
      await loadMe(); toast('Welcome, ' + name.split(' ')[0] + '. Your work saves automatically.');
    } catch (e) { toast(e.message, 5000); btn.disabled = false; btn.textContent = 'Start the simulation'; }
  });

  async function loadMe() {
    const r = await api('GET', '/me', null, token);
    S = r; clockOffset = Date.parse(r.me.serverNow) - Date.now();
    const who = $('#whoChip'); who.textContent = r.me.name + ' · ' + r.me.code; who.classList.remove('hide');
    coachSetup();
    if (r.me.status !== 'in_progress') { showReport(); return; }
    if (!draft) draft = Object.assign(M.emptyDecisions(), M.sanitizeDecisions(r.me.draft));
    show('app'); startClock(); renderSteps(); renderStep();
    clearInterval(pollTimer); pollTimer = setInterval(poll, 60000);
  }

  async function poll() {
    try {
      const r = await api('GET', '/me', null, token);
      S.me.deadline = r.me.deadline; clockOffset = Date.parse(r.me.serverNow) - Date.now(); S.documents = r.documents; S.settings = r.settings;
      if (!coachBusy) { S.coach = r.coach; coachSetup(); }
      if (r.me.status !== 'in_progress') { S = r; showReport(); } else renderSteps();
    } catch (e) { if (e.status === 401) { store.del(TOKEN_KEY); location.reload(); } }
  }

  /* ---------------- timer ---------------- */
  function startClock() {
    clearInterval(tickTimer); tick(); tickTimer = setInterval(tick, 1000);
  }
  function tick() {
    const chip = $('#timerChip');
    if (!S || !S.me.deadline || S.me.status !== 'in_progress') { chip.classList.add('hide'); return; }
    const left = Date.parse(S.me.deadline) - now();
    chip.classList.remove('hide');
    chip.className = 'chip timer ' + (left <= 60000 ? 'bad' : left <= 300000 ? 'warn' : '');
    chip.textContent = left > 0 ? '⏱ ' + U.fmtDuration(left) + ' left' : 'Time up';
    if (left <= 300000 && left > 60000 && !warned5) { warned5 = true; toast('5 minutes left. Your work is saved automatically and will be submitted when time runs out.', 6000); }
    if (left <= 60000 && left > 0 && !warned1) { warned1 = true; toast('1 minute left — finish your rationale and submit.', 6000); }
    if (left <= 0 && !submitting) autoSubmit();
  }
  async function autoSubmit() {
    submitting = true; clearTimeout(saveTimer);
    try { await api('POST', '/submit', { draft, auto: true }, token); } catch { /* server finalizes from saved draft */ }
    toast('Time is up — your work has been submitted.', 6000);
    try { await loadMe(); } catch { /* ignore */ }
  }

  /* ---------------- autosave ---------------- */
  function changed() {
    dirty = true; setSave('Saving…', '');
    clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200);
    renderSteps(); refreshSide();
  }
  function setSave(text, cls) { const c = $('#saveChip'); c.classList.remove('hide'); c.className = 'chip ' + (cls || ''); c.textContent = text; }
  async function save() {
    if (saving || !dirty || submitting) return; saving = true; dirty = false;
    try {
      const r = await api('POST', '/save', { draft }, token);
      if (r.deadline !== undefined) { S.me.deadline = r.deadline; clockOffset = Date.parse(r.serverNow) - Date.now(); }
      setSave('Saved ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), 'ok');
    } catch (e) {
      if (e.status === 409) { toast(e.message, 5000); await loadMe(); }
      else { dirty = true; setSave('Not saved — retrying', 'bad'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 5000); }
    } finally { saving = false; if (dirty) { clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200); } }
  }
  window.addEventListener('beforeunload', e => {
    if (dirty && token && S && S.me.status === 'in_progress') {
      try { fetch('/api/save', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ draft }) }); } catch { /* ignore */ }
      e.preventDefault(); e.returnValue = '';
    }
  });

  /* ---------------- steps ---------------- */
  function stepList() {
    const s = [{ id: 'case', label: 'Case & evidence' }];
    if (S.documents && S.documents.length) s.push({ id: 'docs', label: 'Documents' });
    s.push({ id: 'redesign', label: 'Redesign the job' }, { id: 'economics', label: 'Economics' }, { id: 'workforce', label: 'Workforce plan' },
      { id: 'recommend', label: 'Recommendation' }, { id: 'review', label: 'Review & submit' });
    return s;
  }
  function isDone(id) {
    if (id === 'redesign') return M.TASK_IDS.every(t => draft.modes[t]) && draft.skills.length > 0;
    if (id === 'economics') return !!lastRun && lastRun.hash === econHash();
    if (id === 'workforce') return !!(draft.workforce.strategy && draft.workforce.trigger);
    if (id === 'recommend') return !!(draft.recommendation && draft.criticalTask && draft.rationale.trim().length >= 40);
    return false;
  }
  function renderSteps() {
    const list = stepList(); if (!list.some(s => s.id === step)) step = 'case';
    $('#steps').innerHTML = list.map((s, i) => '<button class="step ' + (s.id === step ? 'active ' : '') + (isDone(s.id) ? 'done' : '') + '" data-step="' + s.id + '"><span class="n">' + String(i + 1).padStart(2, '0') + '</span>' + esc(s.label) + (isDone(s.id) ? ' ✓' : '') + '</button>').join('');
  }
  $('#steps').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) go(b.dataset.step); });
  function go(id) { step = id; renderSteps(); renderStep(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function nextBtn() {
    const list = stepList(); const i = list.findIndex(s => s.id === step); const n = list[i + 1];
    return n ? '<div class="btn-row" style="margin-top:16px;justify-content:flex-end"><button class="btn btn-dark" data-go="' + n.id + '">Next: ' + esc(n.label) + ' →</button></div>' : '';
  }

  function renderStep() {
    const host = $('#stepHost');
    const fn = { case: viewCase, docs: viewDocs, redesign: viewRedesign, economics: viewEconomics, workforce: viewWorkforce, recommend: viewRecommend, review: viewReview }[step];
    host.innerHTML = fn();
    bindStep(host);
  }

  /* ---- 01 Case ---- */
  function viewCase() {
    const c = S.case; const jd = c.jd;
    return '<div class="card"><div class="section-label">Case brief</div><h1>' + esc(c.title) + '</h1>' + c.brief.map(p => '<p style="margin-top:10px">' + esc(p) + '</p>').join('') +
      '<p class="note" style="margin-top:10px">All figures are fictional teaching assumptions. Base every decision on the evidence cards (E1–E6) and cite them in your rationale.</p></div>' +
      '<div class="grid cols-2" style="margin-top:14px"><div class="card"><div class="section-label">Current job description</div><h2>' + esc(jd.title) + '</h2>' +
      '<p class="small muted" style="margin-top:4px">Reports to ' + esc(jd.reportsTo) + ' · ' + esc(jd.location) + ' · ' + esc(jd.pay) + '</p><p style="margin-top:8px">' + esc(jd.purpose) + '</p>' +
      '<div class="section-label" style="margin-top:12px">Key responsibilities</div><ul class="clean small">' + jd.responsibilities.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' +
      '<div class="section-label" style="margin-top:12px">Competencies</div><ul class="clean small">' + jd.competencies.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' +
      '<p class="small" style="margin-top:10px"><b>KPIs:</b> ' + jd.kpis.map(esc).join(' · ') + '</p></div>' +
      '<div class="card"><div class="section-label">Decision framework</div><h2>Three ways to allocate a task</h2>' + c.framework.map(f => '<div class="kv" style="display:block"><b>' + esc(f.mode) + '</b><div class="small muted">' + esc(f.when) + '</div></div>').join('') +
      '<div class="section-label" style="margin-top:14px">Job-design lens (Hackman & Oldham)</div><p class="small">Good redesign protects <b>autonomy</b>, <b>skill variety</b>, <b>task identity</b>, <b>task significance</b> and <b>feedback</b>. Ask whether AI enriches the job or hollows it out.</p>' +
      '<div class="section-label" style="margin-top:14px">Capacity is not cash</div><p class="small" style="margin:0">Hours released by AI only create value if they avoid hiring or overtime or raise throughput. You will choose how much of the released capacity you expect to turn into real value.</p></div></div>' +
      '<h2 style="margin:22px 0 10px">Evidence cards</h2><div class="grid cols-2">' + c.evidence.map(ev => '<div class="evidence"><h3><span class="eid">' + ev.id + '</span>' + esc(ev.title) + '</h3><ul>' + ev.points.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul></div>').join('') + '</div>' + nextBtn();
  }

  /* ---- 02 Documents ---- */
  function viewDocs() {
    return '<div class="card"><div class="card-head"><div><h2>Case documents</h2><p>Shared by your faculty. Documents open in a protected viewer: view only, no download.</p></div></div>' +
      (S.documents.length ? '<div class="grid">' + S.documents.map(d => '<div class="task"><div class="task-top"><div><div class="task-title">' + esc(d.title) + '</div><div class="task-meta">' + esc(d.kind.toUpperCase()) + (d.size ? ' · ' + Math.max(1, Math.round(d.size / 1024)) + ' KB' : '') + '</div></div><button class="btn btn-ghost btn-sm" data-doc="' + d.id + '" data-title="' + esc(d.title) + '">View</button></div></div>').join('') + '</div>' : '<p class="muted">No documents have been shared.</p>') + '</div>' + nextBtn();
  }

  /* ---- 03 Redesign ---- */
  function viewRedesign() {
    const tasks = M.TASKS.map(t => {
      const m = draft.modes[t.id];
      const riskCls = t.risk >= 4 ? 'high' : t.risk === 2 ? 'med' : 'low'; const riskTxt = t.risk >= 4 ? 'High risk' : t.risk === 2 ? 'Medium risk' : 'Low risk';
      return '<div class="task"><div class="task-top"><div><div class="task-title">' + esc(t.name) + '</div><div class="task-meta"><span class="pill ' + riskCls + '">' + riskTxt + '</span></div></div><span class="share">' + t.share + '% of workload</span></div>' +
        '<p>' + esc(t.desc) + '</p><div class="task-foot"><div class="seg" role="group" aria-label="Mode for ' + esc(t.short) + '">' +
        ['human', 'assist', 'auto'].map(v => '<button type="button" data-task="' + t.id + '" data-v="' + v + '" aria-pressed="' + (m === v) + '">' + M.MODES[v] + '</button>').join('') +
        '</div><span class="small">Modeled time release: augmented ' + t.assist + '% · automated ' + t.auto + '%</span></div></div>';
    }).join('');
    const skills = M.SKILLS.map(s => '<label class="check ' + (draft.skills.includes(s) ? 'on' : '') + '"><input type="checkbox" data-skill="' + esc(s) + '" ' + (draft.skills.includes(s) ? 'checked' : '') + '><span>' + esc(s) + '</span></label>').join('');
    return '<div class="main-side"><div><div class="card"><div class="card-head"><div><h2>Choose the human–AI split for each task</h2><p>Automating more is not automatically better. Weigh volume, data readiness, risk and the need for judgment (E1–E5).</p></div></div>' + tasks + '</div>' +
      '<div class="card"><div class="card-head"><div><h2>Future skill priorities</h2><p>Choose the capabilities the redesigned team must build. A focused portfolio is better than ticking everything.</p></div><span class="chip" id="skillCount">' + draft.skills.length + ' selected</span></div><div class="checks">' + skills + '</div></div>' + nextBtn() + '</div>' +
      '<aside class="sticky" id="side">' + sideHtml() + '</aside></div>';
  }

  function sideHtml() {
    const res = M.compute(S.caseFacts, draft); const decided = M.TASK_IDS.filter(t => draft.modes[t]).length;
    const cap = S.caseFacts.monthlyCap;
    return '<div class="card"><h3>Live design summary</h3><div class="kv"><span>Tasks decided</span><b>' + decided + ' / 6</b></div>' +
      '<div class="kv"><span>Hours released / month</span><b>' + Math.round(res.savedActual).toLocaleString('en-IN') + '</b></div>' +
      '<div class="kv"><span>AI + oversight cost / month</span><b style="color:' + (res.monthlySpend > cap ? 'var(--red)' : 'inherit') + '">' + money(res.monthlySpend) + '</b></div>' +
      '<div class="kv"><span>Monthly cap (E6)</span><b>' + money(cap) + '</b></div>' +
      '<div style="margin-top:10px"><div class="kv" style="border:0;padding-bottom:4px"><span>Workload using AI</span><b>' + res.aiShare + '%</b></div><div class="bar"><i style="width:' + res.aiShare + '%"></i></div></div>' +
      '<p class="hint" style="margin-top:12px">Run the full business case on the Economics step. Released hours are capacity, not cash.</p></div>' +
      '<div class="card"><h3>Think like an HR strategist</h3><ul class="clean small"><li>Is the technology and data ready (E3)?</li><li>Is the volume high enough to pay back (E1, E6)?</li><li>What happens when AI is wrong (E5)?</li><li>What will people do with the time released (E4)?</li></ul></div>';
  }
  function refreshSide() { const s = $('#side'); if (s) s.innerHTML = sideHtml(); const sc = $('#skillCount'); if (sc) sc.textContent = draft.skills.length + ' selected'; }

  /* ---- 04 Economics ---- */
  function viewEconomics() {
    const c = S.caseFacts;
    const sel = (id, opts, val) => '<select id="' + id + '">' + opts.map(o => '<option value="' + o.v + '" ' + (Number(val) === o.v ? 'selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>';
    const training = M.TRAINING_OPTIONS.map(v => ({ v, label: v ? M.rupees(v) : '₹0 — no reskilling budget' }));
    const stale = lastRun && lastRun.hash !== econHash();
    return '<div class="main-side"><div><div class="card"><div class="card-head"><div><h2>Test the business case</h2><p>Case facts are fixed for everyone by your faculty. You decide the investment and how realistic your assumptions are.</p></div></div>' +
      '<div class="grid cols-3">' + [['Team size', c.headcount + ' executives'], ['Average salary', money(c.salary) + ' / month'], ['Monthly payroll', money(c.headcount * c.salary)],
        ['Workload', c.hours.toLocaleString('en-IN') + ' h / month'], ['One-time budget', money(c.setupBudget)], ['AI running-cost cap', money(c.monthlyCap) + ' / month'],
        ['Oversight cost (if AI used)', money(c.overhead) + ' / month'], ['Planning horizon', (c.horizon / 12) + ' year(s)'], ['Volume growth', c.growth + '% per year']]
        .map(([k, v]) => '<div class="stat"><div class="k">' + k + '</div><div class="v" style="font-size:16px">' + v + '</div></div>').join('') + '</div>' +
      '<div class="grid cols-3" style="margin-top:16px"><div><label class="lbl" for="eTraining">Reskilling investment</label>' + sel('eTraining', training, draft.training) + '</div>' +
      '<div><label class="lbl" for="eAdoption">Adoption maturity</label>' + sel('eAdoption', M.ADOPTION_OPTIONS, draft.adoption) + '</div>' +
      '<div><label class="lbl" for="eReal">Value realized from released capacity</label>' + sel('eReal', M.REALIZATION_OPTIONS, draft.realization) + '</div></div>' +
      '<p class="note" style="margin-top:14px"><b>Capacity vs cash.</b> Time released by AI is not automatically a saving. The realization share is how much of it you expect to convert into avoided hiring, avoided overtime or extra throughput.</p>' +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-primary" id="runBtn">Run simulation</button>' +
      (stale ? '<span class="chip warn">Your decisions changed since the last run — run again</span>' : lastRun ? '<span class="chip ok">Results reflect your current decisions</span>' : '<span class="small muted">Results appear after you run the simulation.</span>') + '</div></div>' +
      '<div id="runOut">' + (lastRun ? runHtml(lastRun.res) : '') + '</div>' +
      '<div class="card"><h3>How the model works</h3><div class="table-wrap" style="margin-top:8px"><table><tbody>' +
      '<tr><td>Labour cost per workload-hour</td><td class="small">Payroll ÷ monthly workload hours</td></tr><tr><td>Hours released</td><td class="small">Task workload × mode efficiency × adoption maturity</td></tr>' +
      '<tr><td>Value realized</td><td class="small">Hours released × labour cost per hour × realization share</td></tr><tr><td>Recurring cost</td><td class="small">AI running cost of chosen modes + oversight (only if AI is used)</td></tr>' +
      '<tr><td>One-time cost</td><td class="small">Setup cost of chosen modes + reskilling investment</td></tr><tr><td>Payback</td><td class="small">One-time cost ÷ net monthly benefit (if positive)</td></tr></tbody></table></div></div>' + nextBtn() + '</div>' +
      '<aside class="sticky" id="side">' + sideHtml() + '</aside></div>';
  }
  function runHtml(res) {
    const st = (k, v, s, cls) => '<div class="stat"><div class="k">' + k + '</div><div class="v ' + (cls || '') + '">' + v + '</div><div class="s">' + (s || '') + '</div></div>';
    return '<div class="card"><div class="card-head"><div><h2>Simulation results</h2><p>' + esc(res.systemRecommendation) + '</p></div></div><div class="grid cols-4">' +
      st('Hours released', Math.round(res.savedActual).toLocaleString('en-IN'), 'per month') + st('Value realized', money(res.realized), 'per month') +
      st('AI + oversight', money(res.monthlySpend), res.overrun ? 'over the monthly cap' : 'within the monthly cap', res.overrun ? 'neg' : '') +
      st('Net monthly benefit', money(res.monthlyNet), '', res.monthlyNet >= 0 ? 'pos' : 'neg') +
      st('One-time cost', money(res.capex), res.capexOver ? 'over budget' : 'within budget', res.capexOver ? 'neg' : '') +
      st('Payback', Number.isFinite(res.payback) ? (res.payback < 1 ? '< 1 month' : res.payback.toFixed(1) + ' months') : 'Not reached', 'simple estimate') +
      st(res.case.horizon + '-month net', money(res.horizonNet), 'after one-time cost', res.horizonNet >= 0 ? 'pos' : 'neg') +
      st('Capacity released', res.fteReleased.toFixed(1) + ' FTE', 'growth needs ≈ ' + res.growthFte.toFixed(1) + ' FTE') + '</div>' +
      '<div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Task</th><th>Mode</th><th class="num">Hours released</th><th class="num">Value / mo</th><th class="num">AI cost / mo</th><th class="num">Task net / mo</th></tr></thead><tbody>' +
      res.rows.map(r => '<tr><td>' + esc(r.short) + '</td><td>' + M.MODES[r.mode] + '</td><td class="num">' + Math.round(r.released) + '</td><td class="num">' + money(r.value) + '</td><td class="num">' + money(r.run) + '</td><td class="num" style="color:' + (r.mode === 'human' ? 'var(--muted)' : r.taskNet >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (r.mode === 'human' ? '—' : money(r.taskNet)) + '</td></tr>').join('') +
      '</tbody></table></div><p class="hint">Oversight (' + money(res.oversight) + '/month) is charged once for the whole design whenever any AI is used.</p>' +
      '<div class="grid cols-3" style="margin-top:12px">' + [['Business case', res.profile.business], ['Employee & job quality', res.profile.people], ['Risk management', res.profile.risk]].map(([k, v]) =>
        '<div><div class="kv" style="border:0;padding-bottom:4px"><span class="small">' + k + '</span><b class="small">' + Math.round(v) + '</b></div><div class="bar ' + (v < 50 ? 'red' : v < 70 ? 'amber' : '') + '"><i style="width:' + v + '%"></i></div></div>').join('') +
      '</div><p class="hint">Balance profile is diagnostic only. Your official score is calculated when you submit.</p></div>';
  }

  /* ---- 05 Workforce ---- */
  function viewWorkforce() {
    const res = M.compute(S.caseFacts, draft);
    const radio = (name, obj, val) => '<div class="radio-list">' + Object.entries(obj).map(([k, v]) => '<label class="check ' + (val === k ? 'on' : '') + '"><input type="radio" name="' + name + '" value="' + k + '" ' + (val === k ? 'checked' : '') + '><span>' + esc(v.label || v) + '</span></label>').join('') + '</div>';
    return '<div class="main-side"><div><div class="card"><div class="card-head"><div><h2>Workforce strategy</h2><p>How will the organization absorb the change? Consider the mandate (E6) and employee concerns (E4).</p></div></div>' + radio('wfStrategy', M.WORKFORCE, draft.workforce.strategy) + '</div>' +
      '<div class="card"><div class="card-head"><div><h2>New or redesigned roles</h2><p>Optional. Select roles your redesign creates; internal candidates are considered first.</p></div></div><div class="checks">' +
      M.NEW_ROLES.map(r => '<label class="check ' + (draft.workforce.roles.includes(r) ? 'on' : '') + '"><input type="checkbox" data-role="' + esc(r) + '" ' + (draft.workforce.roles.includes(r) ? 'checked' : '') + '><span>' + esc(r) + '</span></label>').join('') + '</div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Hiring trigger</h2><p>When would you recruit externally?</p></div></div>' + radio('wfTrigger', M.HIRING_TRIGGERS, draft.workforce.trigger) + '</div>' + nextBtn() + '</div>' +
      '<aside class="sticky"><div class="card"><h3>Capacity check</h3><div class="kv"><span>Capacity released</span><b>' + res.fteReleased.toFixed(1) + ' FTE</b></div><div class="kv"><span>Extra capacity needed for ' + S.caseFacts.growth + '% growth</span><b>' + res.growthFte.toFixed(1) + ' FTE</b></div><div class="kv"><span>Natural attrition (E4)</span><b>≈ ' + Math.round(S.caseFacts.headcount * 0.28) + ' exits / year</b></div><p class="hint" style="margin-top:10px">Released capacity can absorb growth instead of new hiring. That is often a stronger people strategy than reducing headcount.</p></div></aside></div>';
  }

  /* ---- 06 Recommendation ---- */
  function viewRecommend() {
    const recs = Object.entries(M.RECOMMENDATIONS).map(([k, v]) => '<label class="check ' + (draft.recommendation === k ? 'on' : '') + '"><input type="radio" name="rec" value="' + k + '" ' + (draft.recommendation === k ? 'checked' : '') + '><span>' + esc(v) + '</span></label>').join('');
    const len = draft.rationale.trim().length; const ev = new Set((draft.rationale.match(/\bE[1-6]\b/gi) || []).map(x => x.toUpperCase()));
    return '<div class="card"><div class="card-head"><div><h2>Your recommended action</h2><p>It should be consistent with your own simulation results.</p></div></div><div class="radio-list">' + recs + '</div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Human accountability</h2><p>Which task must keep strong human accountability in the redesigned role?</p></div></div><select id="critTask"><option value="">Choose a task…</option>' +
      M.TASKS.map(t => '<option value="' + t.id + '" ' + (draft.criticalTask === t.id ? 'selected' : '') + '>' + esc(t.name) + '</option>').join('') + '</select></div>' +
      '<div class="card"><div class="card-head"><div><h2>Job-design safeguards (Hackman & Oldham)</h2><p>Choose the safeguards you will actually build into the future role.</p></div></div><div class="checks">' +
      M.SAFEGUARDS.map(g => '<label class="check ' + (draft.safeguards.includes(g.id) ? 'on' : '') + '"><input type="checkbox" data-sg="' + esc(g.id) + '" ' + (draft.safeguards.includes(g.id) ? 'checked' : '') + '><span>' + esc(g.id) + '<small>' + esc(g.hint) + '</small></span></label>').join('') + '</div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Decision rationale</h2><p>Explain the main trade-off between business value, customer quality, risk and people. Cite evidence cards, e.g. "(E3)".</p></div></div>' +
      '<div class="btn-row" style="margin-bottom:8px"><span class="small muted">Insert evidence:</span>' + ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'].map(x => '<button type="button" class="btn btn-ghost btn-sm" data-ev="' + x + '">' + x + '</button>').join('') + '</div>' +
      '<textarea id="rationale" maxlength="4000" placeholder="Our redesign automates … because (E1, E3). We keep … human-led because (E5). The business case …">' + esc(draft.rationale) + '</textarea>' +
      '<div class="hint" id="ratMeta">' + len + ' characters · evidence cited: ' + (ev.size ? [...ev].sort().join(', ') : 'none') + ' · minimum 40 characters</div></div>' + nextBtn();
  }

  /* ---- 07 Review ---- */
  function viewReview() {
    const missing = M.validate(draft); const runOk = isDone('economics');
    const ready = !missing.length && runOk;
    return '<div class="main-side"><div><div class="card"><div class="card-head"><div><h2>Review your decisions</h2><p>Your official score is calculated on the server when you submit. You cannot edit after submitting.</p></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Task</th><th>Your decision</th></tr></thead><tbody>' + M.TASKS.map(t => '<tr><td>' + esc(t.name) + '</td><td>' + (draft.modes[t.id] ? M.MODES[draft.modes[t.id]] : '<span style="color:var(--red)">Not chosen</span>') + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="grid cols-2" style="margin-top:12px"><div class="kv"><span>Skills</span><b>' + draft.skills.length + '</b></div><div class="kv"><span>Safeguards</span><b>' + draft.safeguards.length + '</b></div>' +
      '<div class="kv"><span>Reskilling</span><b>' + M.rupees(draft.training) + '</b></div><div class="kv"><span>Adoption / realization</span><b>' + Math.round(draft.adoption * 100) + '% / ' + Math.round(draft.realization * 100) + '%</b></div>' +
      '</div><div class="kv"><span>Workforce strategy</span><b style="text-align:right">' + (draft.workforce.strategy ? esc(M.WORKFORCE[draft.workforce.strategy].label) : '—') + '</b></div><div class="kv"><span>Recommendation</span><b style="text-align:right">' + (draft.recommendation ? esc(M.RECOMMENDATIONS[draft.recommendation]) : '—') + '</b></div></div></div>' +
      '<aside class="sticky"><div class="card"><h3>Ready to submit?</h3>' +
      (missing.length ? '<div class="note warn" style="margin-top:10px"><b>Still to do</b><ul class="clean">' + missing.map(m => '<li>' + esc(m) + '</li>').join('') + '</ul></div>' : '<div class="note ok" style="margin-top:10px">All decisions are complete.</div>') +
      (runOk ? '' : '<div class="note warn" style="margin-top:10px">Run the simulation on the Economics step with your final decisions.</div>') +
      '<button class="btn btn-primary" id="submitBtn" style="width:100%;margin-top:14px" ' + (ready ? '' : 'disabled') + '>Submit final decisions</button>' +
      '<p class="hint">' + (S.me.deadline ? 'If time runs out, your last saved work is submitted automatically.' : '') + '</p></div></aside></div>';
  }

  /* ---------------- events ---------------- */
  function bindStep(host) {
    host.onclick = async e => {
      const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
      const tb = e.target.closest('[data-task]');
      if (tb) { draft.modes[tb.dataset.task] = tb.dataset.v; $$('[data-task="' + tb.dataset.task + '"]', host).forEach(b => b.setAttribute('aria-pressed', String(b === tb))); return changed(); }
      const doc = e.target.closest('[data-doc]'); if (doc) return window.TTViewer.open(doc.dataset.doc, token, S.me.name + ' · ' + S.me.code, doc.dataset.title);
      const evb = e.target.closest('[data-ev]');
      if (evb) { const ta = $('#rationale'); const ins = ' (' + evb.dataset.ev + ')'; const p = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, p) + ins + ta.value.slice(p); ta.focus(); ta.selectionStart = ta.selectionEnd = p + ins.length; ta.dispatchEvent(new Event('input', { bubbles: true })); return; }
      if (e.target.id === 'runBtn') { lastRun = { hash: econHash(), res: M.compute(S.caseFacts, draft) }; renderStep(); renderSteps(); setTimeout(() => { const o = $('#runOut'); o && o.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); return; }
      if (e.target.id === 'submitBtn') return submit();
    };
    host.onchange = e => {
      const t = e.target;
      if (t.dataset.skill) { toggle(draft.skills, t.dataset.skill, t.checked); t.closest('.check').classList.toggle('on', t.checked); return changed(); }
      if (t.dataset.role) { toggle(draft.workforce.roles, t.dataset.role, t.checked); t.closest('.check').classList.toggle('on', t.checked); return changed(); }
      if (t.dataset.sg) { toggle(draft.safeguards, t.dataset.sg, t.checked); t.closest('.check').classList.toggle('on', t.checked); return changed(); }
      if (t.name === 'wfStrategy') { draft.workforce.strategy = t.value; radioOn(t); return changed(); }
      if (t.name === 'wfTrigger') { draft.workforce.trigger = t.value; radioOn(t); return changed(); }
      if (t.name === 'rec') { draft.recommendation = t.value; radioOn(t); return changed(); }
      if (t.id === 'critTask') { draft.criticalTask = t.value; return changed(); }
      if (t.id === 'eTraining') { draft.training = Number(t.value); changed(); return renderStep(); }
      if (t.id === 'eAdoption') { draft.adoption = Number(t.value); changed(); return renderStep(); }
      if (t.id === 'eReal') { draft.realization = Number(t.value); changed(); return renderStep(); }
    };
    host.oninput = e => {
      if (e.target.id === 'rationale') {
        draft.rationale = e.target.value; const len = draft.rationale.trim().length; const ev = new Set((draft.rationale.match(/\bE[1-6]\b/gi) || []).map(x => x.toUpperCase()));
        $('#ratMeta').textContent = len + ' characters · evidence cited: ' + (ev.size ? [...ev].sort().join(', ') : 'none') + ' · minimum 40 characters';
        changed();
      }
    };
  }
  const toggle = (arr, v, on) => { const i = arr.indexOf(v); if (on && i < 0) arr.push(v); if (!on && i >= 0) arr.splice(i, 1); };
  const radioOn = t => $$('input[name="' + t.name + '"]').forEach(r => r.closest('.check').classList.toggle('on', r.checked));

  async function submit() {
    const ok = await U.confirmBox('Submit your final decisions?', 'Your score will be calculated from these decisions. You will not be able to change them afterwards.', 'Submit');
    if (!ok) return;
    submitting = true; clearTimeout(saveTimer);
    const b = $('#submitBtn'); if (b) { b.disabled = true; b.textContent = 'Submitting…'; }
    try { await api('POST', '/submit', { draft }, token); dirty = false; toast('Submitted. Here is your report.'); await loadMe(); }
    catch (e) { submitting = false; toast(e.message, 6000); if (b) { b.disabled = false; b.textContent = 'Submit final decisions'; } }
  }

  /* ---------------- report ---------------- */
  function showReport() {
    clearInterval(pollTimer); clearInterval(tickTimer); clearTimeout(saveTimer);
    $('#timerChip').classList.add('hide'); $('#saveChip').classList.add('hide');
    show('reportView');
    const host = $('#reportHost');
    if (!S.report) { host.innerHTML = '<div class="card"><h2>Submitted</h2><p class="muted">Your report is being prepared.</p></div>'; return; }
    const wantAi = S.report.scoreVisible && !S.report.aiSuggestions && S.settings.aiReport && !aiGaveUp;
    window.TTReport.mount(host, S.report, { refresh: refreshReport, aiPending: wantAi });
    if (wantAi && !aiLoading) loadAiSuggestions();
    if (S.documents && S.documents.length) {
      const d = document.createElement('div'); d.className = 'card no-print'; d.style.marginTop = '14px';
      d.innerHTML = '<h3>Case documents</h3><div class="btn-row" style="margin-top:8px">' + S.documents.map(x => '<button class="btn btn-ghost btn-sm" data-doc="' + x.id + '" data-title="' + esc(x.title) + '">' + esc(x.title) + '</button>').join('') + '</div>';
      d.addEventListener('click', e => { const b = e.target.closest('[data-doc]'); if (b) window.TTViewer.open(b.dataset.doc, token, S.me.name + ' · ' + S.me.code, b.dataset.title); });
      host.appendChild(d);
    }
    coachSetup();
    clearInterval(reportPoll); reportPoll = setInterval(refreshReport, 60000);
  }
  let aiLoading = false, aiGaveUp = false, aiRetried = false;
  async function loadAiSuggestions() {
    aiLoading = true;
    try {
      const r = await api('POST', '/ai-report', null, token);
      if (r.available) { S.report.aiSuggestions = r.suggestions; const y = window.scrollY; showReport(); window.scrollTo(0, y); }
      else {
        const slot = $('#aiSlot');
        if (r.retry && !aiRetried) { aiRetried = true; setTimeout(() => { aiLoading = false; loadAiSuggestions(); }, 30000); if (slot) slot.querySelector('p').textContent = 'AI suggestions are taking longer than usual — retrying shortly…'; return; }
        aiGaveUp = true; if (slot) slot.remove();
      }
    } catch { aiGaveUp = true; const slot = $('#aiSlot'); if (slot) slot.remove(); }
    aiLoading = false;
  }

  /* ---------------- AI coach ---------------- */
  const STARTERS = ['What does "capacity is not cash" mean?', 'How should I think about refunds?', 'Check my payback maths', 'How do I write a strong rationale?'];
  let coachEl = null, fabEl = null, coachBusy = false;
  function coachSetup() {
    if (!S || !S.coach || !S.coach.enabled) { if (fabEl) fabEl.remove(); if (coachEl) coachEl.remove(); fabEl = coachEl = null; return; }
    if (fabEl) { renderCoach(); return; }
    fabEl = document.createElement('button'); fabEl.className = 'coach-fab no-print'; fabEl.innerHTML = '<span class="dot"></span>Ask the AI coach';
    fabEl.addEventListener('click', () => { coachEl.classList.remove('hide'); fabEl.classList.add('hide'); renderCoach(); setTimeout(() => $('#coachIn').focus(), 50); });
    coachEl = document.createElement('section'); coachEl.className = 'coach hide no-print'; coachEl.setAttribute('aria-label', 'AI coach');
    coachEl.innerHTML = '<div class="coach-head"><b>TALENT TWIN Coach</b><span class="chip" id="coachLeft"></span><button class="btn btn-ghost btn-sm" id="coachX" aria-label="Close coach">✕</button></div>' +
      '<div class="coach-log" id="coachLog" aria-live="polite"></div><div class="coach-starters" id="coachStarters"></div>' +
      '<form class="coach-form" id="coachForm"><input type="text" id="coachIn" maxlength="500" placeholder="Ask about the case or a concept…" autocomplete="off"><button class="btn btn-primary btn-sm" type="submit">Send</button></form>' +
      '<div class="coach-foot">The coach explains concepts and case facts. It will not tell you which option scores best. AI can make mistakes.</div>';
    document.body.appendChild(fabEl); document.body.appendChild(coachEl);
    $('#coachX').addEventListener('click', () => { coachEl.classList.add('hide'); fabEl.classList.remove('hide'); });
    $('#coachForm').addEventListener('submit', e => { e.preventDefault(); const q = $('#coachIn').value.trim(); if (q) ask(q); });
    $('#coachStarters').addEventListener('click', e => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
  }
  function renderCoach() {
    if (!coachEl) return;
    const c = S.coach; const log = $('#coachLog');
    $('#coachLeft').textContent = c.remaining + ' AI repl' + (c.remaining === 1 ? 'y' : 'ies') + ' left';
    const msgs = c.history.length ? c.history : [{ role: 'assistant', content: 'Hi! I can explain the case, the evidence cards and concepts like capacity vs cash, payback or Hackman & Oldham. What would you like to think through?', source: 'intro' }];
    log.innerHTML = msgs.map(m => '<div class="msg ' + (m.role === 'user' ? 'user' : 'assistant') + '">' + esc(m.content) + (m.role !== 'user' && m.source !== 'intro' ? '<span class="src">' + (m.source === 'ai' ? 'AI coach' : 'Built-in coach') + '</span>' : '') + '</div>').join('') +
      (coachBusy ? '<div class="msg assistant"><span class="typing"><i></i><i></i><i></i></span></div>' : '');
    $('#coachStarters').innerHTML = c.history.length ? '' : STARTERS.map(q => '<button type="button">' + esc(q) + '</button>').join('');
    log.scrollTop = log.scrollHeight;
  }
  async function ask(q) {
    if (coachBusy) return; coachBusy = true; $('#coachIn').value = '';
    S.coach.history = S.coach.history.concat([{ role: 'user', content: q }]); renderCoach();
    try {
      if (dirty && S.me.status === 'in_progress') { clearTimeout(saveTimer); await save(); }   // coach sees your latest choices
      const r = await api('POST', '/coach', { question: q }, token);
      S.coach = r.coach; if (r.note) toast(r.note, 5000);
    } catch (e) { S.coach.history = S.coach.history.concat([{ role: 'assistant', content: 'Sorry — ' + e.message, source: 'error' }]); }
    coachBusy = false; renderCoach();
  }

  async function refreshReport() {
    try { const r = await api('GET', '/me', null, token); S = r; if (r.me.status === 'in_progress') { clearInterval(reportPoll); draft = null; return loadMe(); } const y = window.scrollY; showReport(); window.scrollTo(0, y); }
    catch (e) { if (e.status === 401) { clearInterval(reportPoll); store.del(TOKEN_KEY); location.reload(); } }
  }

  boot();
})();
