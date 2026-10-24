// SERVER-ONLY scoring for TALENT TWIN: official rubric, faculty reference pattern and debrief.
// Kept out of /public so participants cannot read reference answers or scoring tables.
import TT from '../../public/js/model.js';
const { TASKS, MODES, RECOMMENDATIONS, NEW_ROLES, HIRING_TRIGGERS, CATEGORIES, money, rupees, clamp, r1, compute } = TT;
export const RUBRIC_VERSION = TT.RUBRIC_VERSION;
const WORKFORCE_POINTS = { redeploy: 2, attrition: 2, specialists: 1, reduce: 0 };
const WORKFORCE = Object.fromEntries(Object.entries(TT.WORKFORCE).map(([k, v]) => [k, { label: v.label, pts: WORKFORCE_POINTS[k] }]));
export const TASK_REASONS = {
  "faq": "High-volume, standardized content with an approved knowledge base makes this a strong AI candidate; knowledge quality and exception routing still matter.",
  "routing": "Structured classification can be AI-assisted or automated, with monitoring for misrouting and bias.",
  "followup": "Routine, rule-bound actions can be automated where approved system access exists.",
  "refund": "AI can summarize evidence and recommend next actions, but exceptions need accountable human review.",
  "complaint": "Empathy, context and exception handling remain central; use AI for preparation, not autonomous closure.",
  "qa": "AI can assist analysis and draft reports, while managers validate samples and interpret implications."
};

  /* Faculty reference pattern (also drives course-fit points). Visible to faculty only. */
export const REFERENCE = {
  faq: { best: 'auto', ok: ['assist'], evidence: ['E1', 'E3'], why: 'Highest volume (30% of workload) and an approved knowledge base covering ~85% of intents make automation the strongest value case; augmentation is a defensible lower-risk start.' },
  routing: { best: 'auto', ok: ['assist'], evidence: ['E1', 'E2'], why: '12% misrouting adds delay; classification is structured and repeatable, so automation with misrouting monitoring fits.' },
  followup: { best: 'auto', ok: ['assist'], evidence: ['E3'], why: 'A real-time order-status API exists, so rule-bound updates can be automated safely.' },
  refund: { best: 'assist', ok: ['human'], evidence: ['E3', 'E5'], why: '14 exception types (5 undocumented) and binding refund promises mean AI should prepare evidence while a human decides. Full automation is the classic trap.' },
  complaint: { best: 'human', ok: ['assist'], evidence: ['E2', 'E5'], why: 'Escalations drive repeat contacts and social-media risk; empathy and judgment stay human, with AI preparing case summaries.' },
  qa: { best: 'assist', ok: ['human'], evidence: ['E2', 'E4'], why: 'Team leads sample only 2% of tickets; AI can review far more while leads validate and interpret.' }
};

export const COURSE_POINTS = {
  faq: { human: 1.5, assist: 3.5, auto: 4 }, routing: { human: 1.5, assist: 3.5, auto: 4 },
  followup: { human: 1.5, assist: 3.5, auto: 4 }, refund: { human: 4.5, assist: 5, auto: 0 },
  complaint: { human: 5, assist: 4, auto: 0 }, qa: { human: 2.5, assist: 4.5, auto: 3.5 }
};
const AI_SKILLS = ['AI-assisted service operations', 'AI workflow monitoring', 'Data literacy', 'Knowledge-base maintenance', 'AI output review'];
const PEOPLE_SKILLS = ['Empathetic communication', 'Risk judgment', 'Exception handling', 'Critical thinking'];
const QUALITY_SKILLS = ['Quality assurance', 'AI output review'];


  /* ---------- Official rubric (100 points) ---------- */
export function rubric(res) {
  const d = res.decisions; const items = [];
  const add = (cat, label, pts, max, note) => { items.push({ cat, label, pts: r1(pts), max, note }); return pts; };

  /* 1. Business impact & economics (25) */
  const bRec = res.monthlyNet <= 0 ? 2 : Math.min(10, 6 + Math.min(4, (res.monthlyNet / Math.max(1000, res.monthlySpend)) * 2));
  const bHor = res.horizonNet > 0 ? 5 : (res.horizonNet >= -Math.max(1, res.capex) * 0.5 ? 2 : 0);
  const bMon = res.overrun ? 0 : 4; const bSet = res.capexOver ? 0 : 3;
  const bPay = res.payback <= 12 ? 3 : res.payback <= 24 ? 2 : res.payback <= 36 ? 1 : 0;
  add('business', 'Recurring monthly economics', bRec, 10, res.monthlyNet > 0 ? 'Net monthly benefit ' + rupees(res.monthlyNet) : 'Net monthly benefit is not positive (' + rupees(res.monthlyNet) + ')');
  add('business', 'Planning-horizon value', bHor, 5, 'Net over ' + res.case.horizon + ' months after one-time cost: ' + rupees(res.horizonNet));
  add('business', 'Within monthly AI budget', bMon, 4, rupees(res.monthlySpend) + ' vs cap ' + rupees(res.case.monthlyCap));
  add('business', 'Within one-time budget', bSet, 3, rupees(res.capex) + ' vs budget ' + rupees(res.case.setupBudget));
  add('business', 'Payback period', bPay, 3, Number.isFinite(res.payback) ? res.payback.toFixed(1) + ' months' : 'Payback not reached');
  const business = r1(clamp(bRec + bHor + bMon + bSet + bPay, 0, 25));

  /* 2. Course concepts & task fit (25) */
  const maxCourse = Object.values(COURSE_POINTS).reduce((s, o) => s + Math.max(o.human, o.assist, o.auto), 0);
  let courseRaw = 0;
  TASKS.forEach(t => {
    const m = d.modes[t.id] || 'human'; const p = COURSE_POINTS[t.id][m]; const best = Math.max(...Object.values(COURSE_POINTS[t.id]));
    courseRaw += p;
    add('course', t.short + ' → ' + MODES[m], p / maxCourse * 25, r1(best / maxCourse * 25),
      p === best ? 'Strong fit for repeatability, risk and need for judgment' : p >= best * 0.7 ? 'Defensible, but not the strongest fit' : 'Weak fit for this task\'s risk / repeatability profile');
  });
  const course = r1(clamp(courseRaw / maxCourse * 25, 0, 25));

  /* 3. Job design & reskilling (20) */
  const n = d.skills.length;
  const breadth = n >= 3 && n <= 7 ? 7 : n < 3 ? n / 3 * 7 : Math.max(3, 7 - (n - 7));
  add('job', 'Focused skill portfolio (3–7 skills)', breadth, 7, n + ' skill(s) selected');
  add('job', 'AI-collaboration skill included', d.skills.some(s => AI_SKILLS.includes(s)) ? 1.5 : 0, 1.5, '');
  add('job', 'Human-judgment skill included', d.skills.some(s => PEOPLE_SKILLS.includes(s)) ? 1.5 : 0, 1.5, '');
  const sg = 10 * Math.min(1, d.safeguards.length / 3);
  add('job', 'Job-characteristic safeguards (Hackman & Oldham)', sg, 10, d.safeguards.length + ' safeguard(s) built into the role');
  const job = r1(clamp(items.filter(i => i.cat === 'job').reduce((s, i) => s + i.pts, 0), 0, 20));

  /* 4. Responsible AI & people impact (20) */
  const refundSafe = d.modes.refund === 'assist' ? 5 : d.modes.refund === 'human' ? 4 : 0;
  const complaintSafe = d.modes.complaint === 'human' ? 5 : d.modes.complaint === 'assist' ? 4 : 0;
  const qaSafe = d.modes.qa === 'assist' ? 3 : d.modes.qa === 'human' ? 2.5 : 1;
  add('ethics', 'Human accountability on sensitive tasks', (refundSafe + complaintSafe + qaSafe) / 13 * 8, 8, 'Refunds, complaints and quality review');
  add('ethics', 'Change-management capability', d.skills.includes('Change management') ? 2 : 0, 2, '');
  add('ethics', 'Judgment / empathy capability', d.skills.some(s => ['Empathetic communication', 'Risk judgment', 'Exception handling'].includes(s)) ? 2 : 0, 2, '');
  add('ethics', 'Quality safeguard capability', d.skills.some(s => QUALITY_SKILLS.includes(s)) ? 2 : 0, 2, '');
  add('ethics', 'Reskilling investment', d.training >= 75000 ? 2 : d.training > 0 ? 1 : 0, 2, rupees(d.training));
  add('ethics', 'Cautious assumptions', (d.adoption < 1 ? 1 : 0) + (d.realization <= 0.7 ? 1 : 0), 2,
    'Adoption ' + Math.round(d.adoption * 100) + '%, value realization ' + Math.round(d.realization * 100) + '%');
  const wf = WORKFORCE[d.workforce.strategy];
  add('ethics', 'People-first workforce approach', wf ? wf.pts : 0, 2, wf ? wf.label : 'Not chosen');
  const ethics = r1(clamp(items.filter(i => i.cat === 'ethics').reduce((s, i) => s + i.pts, 0), 0, 20));

  /* 5. Submission completeness & evidence (10) */
  const needsPilot = res.highRiskAuto >= 10 || res.overrun || res.capexOver || res.monthlyNet < 0;
  const aligned = !res.usesAI ? ['pause', 'reject'] : needsPilot ? ['pilot', 'pause'] : ['pilot', 'scale'];
  add('complete', 'All six task decisions made', TASKS.every(t => d.modes[t.id]) ? 1 : 0, 1, '');
  add('complete', 'Recommendation consistent with the modeled result', d.recommendation ? (aligned.includes(d.recommendation) ? 2 : 0.5) : 0, 2,
    d.recommendation ? RECOMMENDATIONS[d.recommendation] : 'Not chosen');
  add('complete', 'Critical task kept under human accountability', d.criticalTask ? (['complaint', 'refund'].includes(d.criticalTask) ? 2 : 0.5) : 0, 2,
    d.criticalTask ? TASKS.find(t => t.id === d.criticalTask).short : 'Not chosen');
  const len = d.rationale.trim().length;
  const ev = new Set((d.rationale.match(/\bE[1-6]\b/gi) || []).map(x => x.toUpperCase()));
  const ratPts = (len >= 100 ? 2 : len >= 40 ? 1 : len > 0 ? 0.5 : 0) + (ev.size >= 2 ? 1 : ev.size === 1 ? 0.5 : 0);
  add('complete', 'Rationale length and case evidence cited', ratPts, 3, len + ' characters; evidence cited: ' + (ev.size ? [...ev].sort().join(', ') : 'none'));
  add('complete', 'Safeguards selected (3+)', d.safeguards.length >= 3 ? 1 : 0, 1, '');
  add('complete', 'Workforce plan completed', d.workforce.strategy && d.workforce.trigger ? 1 : 0, 1, '');
  const complete = r1(clamp(items.filter(i => i.cat === 'complete').reduce((s, i) => s + i.pts, 0), 0, 10));

  const total = r1(clamp(business + course + job + ethics + complete, 0, 100));
  return { version: RUBRIC_VERSION, business, course, job, ethics, complete, total, items, alignedRecommendations: aligned, evidenceCited: [...ev].sort() };
}

export function band(total) {
  if (total >= 85) return 'Outstanding';
  if (total >= 75) return 'Strong';
  if (total >= 65) return 'Developing';
  if (total >= 50) return 'Needs improvement';
  return 'Weak';
}

/* ---------- Rule-based debrief (always available; LEAH output is added on top) ---------- */
export function debrief(res, rb) {
  const d = res.decisions; const out = { taskFeedback: [], strengths: [], improvements: [] };
  TASKS.forEach(t => {
    const m = d.modes[t.id] || 'human'; const ref = REFERENCE[t.id];
    const verdict = m === ref.best ? 'best' : ref.ok.includes(m) ? 'acceptable' : 'risky';
    out.taskFeedback.push({ id: t.id, task: t.short, chosen: MODES[m], reference: MODES[ref.best],
      alternatives: ref.ok.map(x => MODES[x]), verdict, evidence: ref.evidence, why: ref.why,
      taskNet: res.rows.find(r => r.id === t.id).taskNet });
  });
  const best = out.taskFeedback.filter(f => f.verdict === 'best').length;
  if (best >= 4) out.strengths.push('Your task split matches the evidence for ' + best + ' of 6 tasks.');
  if (!['auto'].includes(d.modes.refund) && !['auto'].includes(d.modes.complaint)) out.strengths.push('You kept human decision rights on refunds and complaints — the two highest-risk task groups (E5).');
  if (res.monthlyNet > 0 && !res.overrun && !res.capexOver) out.strengths.push('Your redesign pays back within the approved budget (' + (Number.isFinite(res.payback) ? res.payback.toFixed(1) + ' months' : '—') + ').');
  if (rb.evidenceCited.length >= 2) out.strengths.push('Your rationale cites case evidence (' + rb.evidenceCited.join(', ') + ').');
  if (['redeploy', 'attrition'].includes(d.workforce.strategy)) out.strengths.push('Your workforce plan absorbs change without forced exits, consistent with the mandate in E6 and employee concerns in E4.');

  if (d.modes.refund === 'auto') out.improvements.push('Automating refund exceptions is the classic trap: 14 exception types and binding promises (E3, E5). Use AI to prepare evidence; let a person decide.');
  if (d.modes.complaint === 'auto') out.improvements.push('Complex complaints need empathy and judgment (E2, E5); automation saves few hours (5%) at high risk.');
  if (res.monthlyNet <= 0 && res.usesAI) out.improvements.push('Your design costs more each month than the value it realizes. Check which tasks have a negative task-level net in the economics table.');
  if (res.overrun) out.improvements.push('Monthly AI spend exceeds the CFO cap in E6.');
  if (res.capexOver) out.improvements.push('One-time cost exceeds the approved budget in E6.');
  if (d.realization >= 1) out.improvements.push('Assuming 100% value realization treats every released hour as cash. Released capacity only has value if it avoids hires or overtime, or creates measurable throughput.');
  if (rb.evidenceCited.length < 2) out.improvements.push('Cite at least two evidence cards (E1–E6) in your rationale to show the decision is grounded in the case.');
  if (!d.skills.includes('Change management')) out.improvements.push('61% of staff are worried about AI (E4); a change-management capability is missing.');
  if (d.workforce.strategy === 'reduce') out.improvements.push('Immediate headcount reduction contradicts the "no reduction mandate" in E6 and ignores 28% natural attrition (E4).');
  if (!rb.alignedRecommendations.includes(d.recommendation)) out.improvements.push('Your recommendation does not match what your own model shows. Choose ' + rb.alignedRecommendations.map(k => '"' + RECOMMENDATIONS[k] + '"').join(' or ') + '.');
  if (!out.strengths.length) out.strengths.push('You completed a full redesign with economics, skills and a workforce plan.');
  if (!out.improvements.length) out.improvements.push('Stress-test your design at cautious adoption (65%) to check that the business case survives.');
  return out;
}

/* ---------- Workforce, recruitment and reskilling plan (generated) ---------- */
export function workforcePlan(res) {
  const d = res.decisions; const c = res.case;
  const absorb = Math.min(res.fteReleased, res.growthFte);
  const roles = d.workforce.roles.length ? d.workforce.roles : ['Customer Support Specialist — AI-assisted & exceptions'];
  const assess = {
    'AI Quality & Knowledge Analyst': 'Work sample: audit 20 AI answers against the knowledge base; data-literacy test',
    'Escalation & Resolution Specialist': 'Situational judgment test on 3 escalations; structured behavioural interview on empathy',
    'Conversation Designer / Bot Trainer': 'Design exercise: rewrite 5 failed bot intents; writing assessment',
    'CX Workforce Analytics Analyst': 'Excel/SQL exercise on ticket data; insight presentation',
    'Customer Support Specialist — AI-assisted & exceptions': 'Simulation: review AI drafts and decide 10 refund exceptions; empathy role-play'
  };
  const phases = [
    { when: 'Months 0–3', what: 'Pilot the AI-enabled tasks with one shift; publish the redesigned JD; begin reskilling cohort 1; internal job posting for new roles (internal candidates first).' },
    { when: 'Months 4–6', what: 'Measure quality, CSAT and released capacity; select internal candidates using the assessments below; ' + (d.workforce.trigger === 'immediate' ? 'onboard external hires.' : 'decide on external hiring against the trigger.') },
    { when: 'Months 7–12', what: 'Scale pilots that met thresholds; complete reskilling cohort 2; update competency profiles, KPIs and career paths.' }];
  return {
    strategy: WORKFORCE[d.workforce.strategy] ? WORKFORCE[d.workforce.strategy].label : 'Not chosen',
    trigger: HIRING_TRIGGERS[d.workforce.trigger] || 'Not chosen',
    fteReleased: res.fteReleased, growthFte: res.growthFte, absorb,
    narrative: 'Your design releases about ' + res.fteReleased.toFixed(1) + ' FTE (full-time-equivalent) of capacity. With ' + c.growth + '% volume growth, next year needs about ' +
      res.growthFte.toFixed(1) + ' additional FTE at today\'s productivity, so released capacity can absorb ' + absorb.toFixed(1) + ' FTE of growth instead of new hires.',
    roles: roles.map(r => ({ role: r, assessment: assess[r] || 'Structured interview and work sample' })),
    phases
  };
}

export function reskillingPlan(res) {
  const skills = res.decisions.skills.length ? res.decisions.skills : ['AI output review', 'Data literacy', 'Change management'];
  return skills.slice(0, 7).map((s, i) => ({ skill: s,
    weeks: i < 2 ? 'Weeks 1–2' : i < 4 ? 'Weeks 3–6' : 'Weeks 7–10',
    activity: i < 2 ? 'Awareness sessions, guided demonstrations, baseline skill check' : i < 4 ? 'Supervised practice on real support cases; review errors and escalation decisions' : 'Applied project, manager observation and proficiency sign-off',
    measure: 'Pre/post skill check; QA score; correct-escalation rate' }));
}

export function futureJD(res) {
  const d = res.decisions; const ai = res.rows.filter(r => r.mode !== 'human'); const hu = res.rows.filter(r => r.mode === 'human');
  const title = !res.usesAI ? 'Customer Support Executive (unchanged scope; AI pilot deferred)'
    : 'Customer Support Specialist — AI-Assisted Service & Exception Resolution';
  const resp = [];
  if (ai.length) resp.push('Supervise AI handling of ' + ai.map(r => r.short.toLowerCase()).join(', ') + '; validate outputs and correct errors');
  if (hu.length) resp.push('Own ' + hu.map(r => r.short.toLowerCase()).join(', ') + ' end-to-end with full decision rights');
  if (d.modes.refund !== 'auto') resp.push('Approve refunds and policy exceptions; remain accountable for the final decision');
  resp.push('Escalate sensitive, ambiguous or high-value cases; flag recurring issues for root-cause analysis');
  resp.push('Maintain accurate case records and comply with DPDP Act 2023 data-handling rules');
  if (d.skills.includes('Knowledge-base maintenance')) resp.push('Maintain and improve the approved knowledge base used by AI tools');
  return { title, purpose: 'Resolve customer needs quickly and fairly by combining AI tools with human judgment, empathy and accountability.',
    responsibilities: resp, competencies: d.skills, kpis: ['CSAT ≥ 85%', 'First-contact resolution', 'AI output error rate', 'Correct escalation rate', 'QA score'] };
}


export { CATEGORIES };
export function score(caseSnapshot, decisions) {
  const res = compute(caseSnapshot, decisions);
  const rb = rubric(res);
  return { res, rb };
}
