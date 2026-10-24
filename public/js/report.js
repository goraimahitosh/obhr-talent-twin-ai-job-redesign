/* Participant performance report — shared by the student app and the faculty console. */
(function () {
  'use strict';
  const M = window.TTModel; const { esc, pct, fmtTime } = window.TTUI;
  const money = n => M.money(n); const rupees = n => M.rupees(n);
  const modeLabel = m => M.MODES[m] || '—';

  function stat(k, v, s, cls) { return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v ' + (cls || '') + '">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>'; }

  function render(r, opts) {
    opts = opts || {};
    const e = r.economics; const cc = M.caseContent(r.case); const d = r.decisions;
    const h = [];
    /* Header */
    h.push('<div class="card"><div class="report-head">');
    if (r.scoreVisible) {
      h.push('<div><div class="ring" style="--p:' + Math.round(r.score) + '"><div><b>' + r.score + '</b><span>out of 100</span></div></div></div>');
    } else {
      h.push('<div><div class="ring" style="--p:0"><div><b style="font-size:16px">Recorded</b><span>results pending</span></div></div></div>');
    }
    h.push('<div><div class="section-label">' + (opts.admin ? 'Participant report' : 'Your performance report') + '</div><h1>' + esc(r.name) + '</h1>');
    h.push('<p class="muted" style="margin-top:4px">Code <b class="mono">' + esc(r.code) + '</b>' + (r.roll ? ' · Roll ' + esc(r.roll) : '') + ' · ' + esc(r.round) + ' · Submitted ' + fmtTime(r.submittedAt) + '</p>');
    const chips = [];
    if (r.scoreVisible) chips.push('<span class="chip ' + (r.score >= 75 ? 'ok' : r.score >= 60 ? 'warn' : 'bad') + '">' + esc(r.band) + '</span>');
    if (r.rank) chips.push('<span class="chip">Rank ' + r.rank + ' of ' + r.ofTotal + '</span>');
    if (r.status === 'auto_submitted') chips.push('<span class="chip warn">Auto-submitted when time ran out</span>');
    if (r.adjustment) chips.push('<span class="chip">Faculty adjustment ' + (r.adjustment > 0 ? '+' : '') + r.adjustment + (r.adjustmentNote ? ' — ' + esc(r.adjustmentNote) : '') + '</span>');
    h.push('<div class="btn-row" style="margin-top:6px">' + chips.join('') + '</div>');
    if (!r.scoreVisible) h.push('<p class="note" style="margin-top:12px">Your submission is recorded. Your faculty will release scores; this page updates automatically.</p>');
    h.push('<div class="btn-row no-print" style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-print>Print / save as PDF</button>' + (opts.refresh ? '<button class="btn btn-ghost btn-sm" data-refresh>Refresh</button>' : '') + '</div>');
    h.push('</div></div></div>');

    /* Rubric */
    if (r.scoreVisible && r.rubric) {
      h.push('<div class="grid cols-2" style="margin-top:14px"><div class="card"><div class="card-head"><div><h2>Score breakdown</h2><p>Automatic rubric from your decisions (100 points)' + (r.adjustment ? '; faculty adjustment shown above' : '') + '.</p></div></div>');
      r.categories.forEach(c => {
        const v = r.rubric[c.key];
        h.push('<div class="cat-row"><span>' + esc(c.label) + '</span><b class="num" style="text-align:right">' + v + ' / ' + c.max + '</b><div class="bar"><i style="width:' + pct(v, c.max) + '%"></i></div></div>');
      });
      h.push('<details style="margin-top:12px"><summary class="small" style="cursor:pointer;font-weight:650">See every rubric item</summary><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Item</th><th class="num">Points</th><th>Basis</th></tr></thead><tbody>');
      r.rubric.items.forEach(it => h.push('<tr><td>' + esc(it.label) + '</td><td class="num">' + it.pts + ' / ' + it.max + '</td><td class="small muted">' + esc(it.note || '') + '</td></tr>'));
      h.push('</tbody></table></div></details></div>');
      h.push('<div class="card"><h2>Feedback</h2><div class="section-label" style="margin-top:12px">Strengths</div><ul class="clean">' + (r.strengths || []).map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>');
      h.push('<div class="section-label" style="margin-top:14px">To improve</div><ul class="clean">' + (r.improvements || []).map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>');
      h.push('<div class="section-label" style="margin-top:14px">Strategy balance profile <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">(diagnostic only, not part of the score)</span></div>');
      [['Business case', e.profile.business], ['Employee & job quality', e.profile.people], ['Risk management', e.profile.risk]].forEach(([k, v]) => {
        h.push('<div class="cat-row"><span class="small">' + k + '</span><b class="small" style="text-align:right">' + Math.round(v) + '</b><div class="bar ' + (v < 50 ? 'red' : v < 70 ? 'amber' : '') + '"><i style="width:' + v + '%"></i></div></div>');
      });
      h.push('</div></div>');
    }

    /* AI suggestions (Netlify AI Gateway) */
    if (r.aiSuggestions) {
      const a = r.aiSuggestions;
      h.push('<div class="ai-card" style="margin-top:14px"><span class="tag">AI suggestions for you</span>' + (a.headline ? '<p style="font-weight:600">' + esc(a.headline) + '</p>' : '') +
        '<ol class="clean" style="padding-left:20px">' + a.suggestions.map(x => '<li style="margin:7px 0"><b>' + esc(x.title) + '.</b> ' + esc(x.detail) + '</li>').join('') + '</ol>' +
        (a.replay ? '<p class="small" style="margin-top:8px"><b>If you replayed:</b> ' + esc(a.replay) + '</p>' : '') + (a.reflection ? '<p class="small" style="margin:0"><b>Reflect:</b> ' + esc(a.reflection) + '</p>' : '') +
        '<p class="hint" style="margin-top:8px">Generated by AI (' + esc(a.model || 'AI') + ') from your decisions and results. It can be wrong; your score is not affected.</p></div>');
    } else if (opts.aiPending) {
      h.push('<div class="ai-card" id="aiSlot" style="margin-top:14px"><span class="tag">AI suggestions for you</span><p class="small muted" style="margin:0"><span class="typing"><i></i><i></i><i></i></span> Preparing personalised suggestions…</p></div>');
    }

    /* LEAH personal feedback */
    if (r.leahFeedback) {
      h.push('<div class="leah" style="margin-top:14px"><span class="tag">LEAH · TALENT TWIN orchestrator feedback</span><p class="prose">' + esc(r.leahFeedback.feedback) + '</p>' +
        (r.leahFeedback.strength ? '<p><b>Strength:</b> ' + esc(r.leahFeedback.strength) + '</p>' : '') + (r.leahFeedback.improve ? '<p style="margin:0"><b>Improve:</b> ' + esc(r.leahFeedback.improve) + '</p>' : '') + '</div>');
    }

    /* Economics */
    h.push('<div class="card" style="margin-top:14px"><div class="card-head"><div><h2>Business case</h2><p>' + esc(e.systemRecommendation) + '</p></div></div><div class="grid cols-4">');
    h.push(stat('Hours released', Math.round(e.savedActual).toLocaleString('en-IN'), 'per month, after adoption'));
    h.push(stat('Value realized', money(e.realized), 'per month'));
    h.push(stat('AI + oversight cost', money(e.monthlySpend), 'per month · cap ' + money(r.case.monthlyCap), e.overrun ? 'neg' : ''));
    h.push(stat('Net monthly benefit', money(e.monthlyNet), 'value − recurring cost', e.monthlyNet >= 0 ? 'pos' : 'neg'));
    h.push(stat('One-time cost', money(e.capex), 'setup + reskilling · budget ' + money(r.case.setupBudget), e.capexOver ? 'neg' : ''));
    h.push(stat('Payback', e.payback == null ? 'Not reached' : e.payback < 1 ? '< 1 month' : e.payback.toFixed(1) + ' mo', 'simple, undiscounted'));
    h.push(stat(r.case.horizon + '-month net', money(e.horizonNet), 'after one-time cost', e.horizonNet >= 0 ? 'pos' : 'neg'));
    h.push(stat('Capacity released', e.fteReleased.toFixed(1) + ' FTE', 'growth needs ≈ ' + e.growthFte.toFixed(1) + ' FTE'));
    h.push('</div>');

    /* Before vs after */
    h.push('<h3 style="margin:18px 0 8px">Before AI vs after AI — task by task</h3><div class="table-wrap"><table><thead><tr><th>Task</th><th>Before</th><th>After (your decision)</th><th class="num">Hours before</th><th class="num">Hours after</th><th class="num">Value − AI cost / mo</th></tr></thead><tbody>');
    e.rows.forEach(row => {
      h.push('<tr><td><b>' + esc(row.short) + '</b><div class="small muted">' + row.share + '% of workload</div></td><td>Human-led</td><td>' + modeLabel(row.mode) + (row.reason && row.mode !== 'human' ? '<div class="small muted">' + esc(row.reason) + '</div>' : '') + '</td>' +
        '<td class="num">' + Math.round(row.hoursBefore).toLocaleString('en-IN') + '</td><td class="num">' + Math.round(row.hoursAfter).toLocaleString('en-IN') + '</td><td class="num" style="color:' + (row.mode === 'human' ? 'var(--muted)' : row.taskNet >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (row.mode === 'human' ? '—' : rupees(row.taskNet)) + '</td></tr>');
    });
    h.push('</tbody></table></div><p class="hint">Released hours are capacity, not cash. Value counts only the share you assumed will avoid hiring or overtime (' + Math.round(d.realization * 100) + '%). Oversight cost of ' + money(e.oversight) + '/month applies whenever any AI is used.</p></div>');

    /* Debrief: reference vs choice */
    if (r.taskFeedback) {
      h.push('<div class="card"><div class="card-head"><div><h2>Debrief — your choices against the case evidence</h2><p>There is no single correct answer. "Strongest fit" is the choice best supported by the evidence cards; "defensible" choices can score well with a good rationale.</p></div></div><div class="table-wrap"><table><thead><tr><th>Task</th><th>Your choice</th><th>Strongest fit</th><th>Evidence</th><th>Why</th></tr></thead><tbody>');
      r.taskFeedback.forEach(f => {
        const v = { best: 'Strongest fit', acceptable: 'Defensible', risky: 'Risky' }[f.verdict];
        h.push('<tr><td><b>' + esc(f.task) + '</b></td><td>' + esc(f.chosen) + '<div><span class="verdict ' + f.verdict + '">' + v + '</span></div></td><td>' + esc(f.reference) + (f.alternatives.length ? '<div class="small muted">Also defensible: ' + esc(f.alternatives.join(', ')) + '</div>' : '') + '</td><td class="mono">' + esc(f.evidence.join(', ')) + '</td><td class="small">' + esc(f.why) + '</td></tr>');
      });
      h.push('</tbody></table></div></div>');
    }

    /* LEAH agent comparison */
    if (r.leahAgent) {
      const a = r.leahAgent;
      h.push('<div class="leah" style="margin-top:14px"><span class="tag">LEAH · TALENT TWIN orchestrator recommendation for this case</span>');
      if (a.summary) h.push('<p class="prose">' + esc(a.summary) + '</p>');
      if (a.tasks) {
        h.push('<div class="table-wrap" style="margin:10px 0"><table><thead><tr><th>Task</th><th>Your choice</th><th>LEAH agent</th><th>Match</th></tr></thead><tbody>');
        M.TASKS.forEach(t => { const mine = d.modes[t.id] || 'human'; const theirs = a.tasks[t.id]; h.push('<tr><td>' + esc(t.short) + '</td><td>' + modeLabel(mine) + '</td><td>' + modeLabel(theirs) + '</td><td>' + (theirs ? (mine === theirs ? '<span class="verdict best">Same</span>' : '<span class="verdict acceptable">Different</span>') : '—') + '</td></tr>'); });
        h.push('</tbody></table></div>');
      }
      if (a.recommendation) h.push('<p class="small"><b>LEAH recommended action:</b> ' + esc(M.RECOMMENDATIONS[a.recommendation]) + ' · <b>You:</b> ' + esc(M.RECOMMENDATIONS[d.recommendation] || '—') + '</p>');
      if (a.narrative) h.push('<details><summary class="small" style="cursor:pointer;font-weight:650">Read LEAH\'s full analysis</summary><div class="prose" style="margin-top:8px">' + esc(a.narrative) + '</div></details>');
      h.push('</div>');
    }
    if (r.leahClassInsights) h.push('<div class="leah" style="margin-top:14px"><span class="tag">LEAH · class insights</span><p class="prose" style="margin:0">' + esc(r.leahClassInsights.text) + '</p></div>');

    /* JD before / after */
    const fj = r.futureJD;
    h.push('<div class="grid cols-2" style="margin-top:14px"><div class="card"><div class="section-label">Before</div><h2>' + esc(cc.jd.title) + '</h2><p class="small muted" style="margin-top:6px">' + esc(cc.jd.purpose) + '</p><ul class="clean small">' + cc.jd.responsibilities.map(x => '<li>' + esc(x.split(' — ')[0]) + '</li>').join('') + '</ul><div class="section-label" style="margin-top:12px">Competencies</div><ul class="clean small">' + cc.jd.competencies.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>');
    h.push('<div class="card"><div class="section-label">After — your redesigned role</div><h2>' + esc(fj.title) + '</h2><p class="small muted" style="margin-top:6px">' + esc(fj.purpose) + '</p><ul class="clean small">' + fj.responsibilities.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul><div class="section-label" style="margin-top:12px">Future competencies</div><p class="small">' + (fj.competencies.length ? fj.competencies.map(esc).join(' · ') : '—') + '</p><div class="section-label" style="margin-top:12px">KPIs</div><p class="small" style="margin:0">' + fj.kpis.map(esc).join(' · ') + '</p></div></div>');

    /* Workforce + recruitment */
    const w = r.workforce;
    h.push('<div class="card" style="margin-top:14px"><h2>Workforce & recruitment plan (12 months)</h2><p class="small" style="margin-top:8px"><b>Strategy:</b> ' + esc(w.strategy) + '<br><b>Hiring trigger:</b> ' + esc(w.trigger) + '</p><p class="note" style="margin:10px 0">' + esc(w.narrative) + '</p>');
    h.push('<div class="grid cols-2"><div><div class="section-label">Roles and selection assessments</div><div class="table-wrap"><table><thead><tr><th>Role</th><th>Selection assessment</th></tr></thead><tbody>' + w.roles.map(x => '<tr><td>' + esc(x.role) + '</td><td class="small">' + esc(x.assessment) + '</td></tr>').join('') + '</tbody></table></div></div>');
    h.push('<div><div class="section-label">Timeline</div><div class="table-wrap"><table><tbody>' + w.phases.map(p => '<tr><td style="white-space:nowrap"><b>' + esc(p.when) + '</b></td><td class="small">' + esc(p.what) + '</td></tr>').join('') + '</tbody></table></div></div></div></div>');

    /* Reskilling */
    h.push('<div class="card"><h2>Reskilling plan</h2><p class="small muted" style="margin-top:4px">Investment: ' + rupees(d.training) + ' · Adoption assumption ' + Math.round(d.adoption * 100) + '%</p><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Skill</th><th>When</th><th>Learning activity</th><th>Proficiency measure</th></tr></thead><tbody>' +
      r.reskilling.map(x => '<tr><td><b>' + esc(x.skill) + '</b></td><td style="white-space:nowrap">' + esc(x.weeks) + '</td><td class="small">' + esc(x.activity) + '</td><td class="small">' + esc(x.measure) + '</td></tr>').join('') + '</tbody></table></div></div>');

    /* Decisions + rationale */
    h.push('<div class="card"><h2>Your recommendation</h2><p style="margin-top:8px"><b>' + esc(M.RECOMMENDATIONS[d.recommendation] || 'Not chosen') + '</b> · Human accountability kept for: ' + esc((M.TASKS.find(t => t.id === d.criticalTask) || {}).short || '—') + '</p><p class="small"><b>Safeguards:</b> ' + (d.safeguards.length ? d.safeguards.map(esc).join(' · ') : '—') + '</p><div class="section-label">Rationale</div><p class="prose" style="margin:0">' + esc(d.rationale || '—') + '</p></div>');
    h.push('<p class="hint" style="margin-top:14px">All company figures are fictional teaching assumptions. Scores are a transparent classroom rubric, not a prediction of business performance.</p>');
    return h.join('');
  }

  function mount(host, report, opts) {
    host.innerHTML = render(report, opts);
    const p = host.querySelector('[data-print]'); if (p) p.addEventListener('click', () => window.print());
    const rf = host.querySelector('[data-refresh]'); if (rf && opts && opts.refresh) rf.addEventListener('click', opts.refresh);
  }
  window.TTReport = { render, mount };
})();
