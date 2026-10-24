/*
 * TALENT TWIN — Job Redesign Lab: shared simulation model and scoring rubric.
 * Runs unchanged in the browser (window.TTModel) and in the Netlify function (require).
 * Public part only: economics and case content. The rubric, reference answers and debrief
 * live server-side (netlify/functions/api/scoring.mjs) so they never reach the browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TTModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RUBRIC_VERSION = 'talent-twin-rubric-v2';

  /* ---------- Task catalogue (assumptions retained from the original lab) ---------- */
  const TASKS = [
    { id: 'faq', name: 'Routine FAQs and repetitive queries', short: 'Routine FAQs', share: 30,
      desc: 'Answer common questions (order status, returns, COD, delivery windows) using approved knowledge and policy content.',
      risk: 1, assist: 45, auto: 75, assistRun: 30000, autoRun: 50000, assistSetup: 200000, autoSetup: 400000 },
    { id: 'routing', name: 'Ticket classification and routing', short: 'Ticket routing', share: 15,
      desc: 'Categorize incoming requests, identify intent and route tickets to the right queue or specialist.',
      risk: 2, assist: 45, auto: 80, assistRun: 25000, autoRun: 40000, assistSetup: 150000, autoSetup: 300000 },
    { id: 'followup', name: 'Order-status updates and follow-ups', short: 'Order follow-ups', share: 15,
      desc: 'Provide order updates, confirm resolution and send standard follow-up messages.',
      risk: 1, assist: 35, auto: 70, assistRun: 25000, autoRun: 40000, assistSetup: 150000, autoSetup: 300000 },
    { id: 'refund', name: 'Refunds and policy exceptions', short: 'Refunds & exceptions', share: 15,
      desc: 'Review refund requests that involve exceptions, missing information or conflicting policies.',
      risk: 5, assist: 25, auto: 15, assistRun: 45000, autoRun: 65000, assistSetup: 250000, autoSetup: 500000 },
    { id: 'complaint', name: 'Complex complaints and empathetic resolution', short: 'Complex complaints', share: 15,
      desc: 'Resolve sensitive complaints, de-escalate frustration and make judgment calls.',
      risk: 5, assist: 20, auto: 5, assistRun: 30000, autoRun: 50000, assistSetup: 250000, autoSetup: 400000 },
    { id: 'qa', name: 'Quality review and operational reporting', short: 'Quality & reporting', share: 10,
      desc: 'Review interaction quality, identify recurring issues and prepare management summaries.',
      risk: 2, assist: 40, auto: 65, assistRun: 25000, autoRun: 35000, assistSetup: 150000, autoSetup: 300000 }
  ];
  const TASK_IDS = TASKS.map(t => t.id);
  const MODES = { human: 'Human-led', assist: 'AI-augmented', auto: 'Automate' };

  const SKILLS = ['AI-assisted service operations', 'AI workflow monitoring', 'Data literacy', 'Knowledge-base maintenance',
    'Quality assurance', 'Exception handling', 'Empathetic communication', 'Risk judgment', 'AI output review',
    'Change management', 'Process improvement', 'Critical thinking'];

  const SAFEGUARDS = [
    { id: 'Autonomy & human judgment', hint: 'Employees retain discretion for exceptions.' },
    { id: 'Skill variety', hint: 'The redesigned role builds different capabilities.' },
    { id: 'Task significance & identity', hint: 'People can see how their work helps customers.' },
    { id: 'Performance feedback', hint: 'Quality measures help employees improve.' },
    { id: 'Protected reskilling time', hint: 'Training is planned as part of the transition.' }
  ];

  const RECOMMENDATIONS = {
    pilot: 'Run a controlled pilot with human oversight',
    scale: 'Scale AI across the role now',
    pause: 'Pause adoption and collect more evidence',
    reject: 'Reject AI adoption for this role'
  };

  const WORKFORCE = {
    redeploy: { label: 'Redeploy and reskill current staff into the redesigned role; freeze backfills' },
    attrition: { label: 'Absorb volume growth through natural attrition — no forced exits' },
    specialists: { label: 'Hire external AI specialists; keep the current team unchanged' },
    reduce: { label: 'Reduce headcount immediately to capture savings' }
  };
  const NEW_ROLES = ['AI Quality & Knowledge Analyst', 'Escalation & Resolution Specialist',
    'Conversation Designer / Bot Trainer', 'CX Workforce Analytics Analyst'];
  const HIRING_TRIGGERS = {
    afterPilot: 'Hire only after pilot results confirm the capacity gap',
    backlog: 'Hire when backlog or response-time targets are missed for 2 consecutive months',
    immediate: 'Hire new roles immediately, before the pilot',
    none: 'No external hiring in the next 12 months'
  };

  const TRAINING_OPTIONS = [0, 25000, 75000, 150000, 300000];
  const ADOPTION_OPTIONS = [
    { v: 0.65, label: 'Cautious — 65% of modeled efficiency' },
    { v: 0.8, label: 'Expected — 80% of modeled efficiency' },
    { v: 1, label: 'Optimistic — 100% of modeled efficiency' }];
  const REALIZATION_OPTIONS = [
    { v: 0.25, label: '25% — most capacity not monetized' },
    { v: 0.5, label: '50% — some overtime / hiring avoided' },
    { v: 0.7, label: '70% — capacity substantially redeployed' },
    { v: 1, label: '100% — all released capacity has economic value' }];

  /* Case facts are set by the faculty (admin) and are the same for every participant. */
  const DEFAULT_CASE = {
    company: 'Sahaay Commerce', industry: 'E-commerce', headcount: 40, salary: 30000, hours: 5600,
    horizon: 36, setupBudget: 1500000, monthlyCap: 250000, overhead: 15000, growth: 32
  };

  const CATEGORIES = [
    { key: 'business', label: 'Business impact & economics', max: 25 },
    { key: 'course', label: 'Course concepts & task fit', max: 25 },
    { key: 'job', label: 'Job design & reskilling', max: 20 },
    { key: 'ethics', label: 'Responsible AI & people impact', max: 20 },
    { key: 'complete', label: 'Completeness & case evidence', max: 10 }];

  /* ---------- helpers ---------- */
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const r1 = n => Math.round((Number(n) || 0) * 10) / 10;
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

  function money(n, dec) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    const d = dec === undefined ? 1 : dec; const s = n < 0 ? '−' : ''; const a = Math.abs(n);
    if (a >= 1e7) return s + '₹' + (a / 1e7).toLocaleString('en-IN', { maximumFractionDigits: d }) + ' Cr';
    if (a >= 1e5) return s + '₹' + (a / 1e5).toLocaleString('en-IN', { maximumFractionDigits: d }) + ' L';
    if (a >= 1e3) return s + '₹' + Math.round(a / 1e3).toLocaleString('en-IN') + 'K';
    return s + '₹' + Math.round(a).toLocaleString('en-IN');
  }
  const rupees = n => (n < 0 ? '−' : '') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

  function sanitizeCase(c) {
    const x = Object.assign({}, DEFAULT_CASE, c || {});
    return {
      company: String(x.company || DEFAULT_CASE.company).slice(0, 80),
      industry: String(x.industry || DEFAULT_CASE.industry).slice(0, 60),
      headcount: clamp(Math.round(num(x.headcount, 40)), 1, 5000),
      salary: clamp(num(x.salary, 30000), 5000, 1000000),
      hours: clamp(num(x.hours, 5600), 100, 1000000),
      horizon: [12, 36, 60].includes(Number(x.horizon)) ? Number(x.horizon) : 36,
      setupBudget: clamp(num(x.setupBudget, 1500000), 0, 1e9),
      monthlyCap: clamp(num(x.monthlyCap, 250000), 0, 1e9),
      overhead: clamp(num(x.overhead, 15000), 0, 1e8),
      growth: clamp(num(x.growth, 32), 0, 300)
    };
  }

  function emptyDecisions() {
    return {
      modes: { faq: '', routing: '', followup: '', refund: '', complaint: '', qa: '' },
      skills: [], training: 75000, adoption: 0.8, realization: 0.7,
      workforce: { strategy: '', roles: [], trigger: '' },
      recommendation: '', criticalTask: '', safeguards: [], rationale: ''
    };
  }

  /* Strip anything unexpected from a decisions object (server-side safety). */
  function sanitizeDecisions(d) {
    const e = emptyDecisions(); d = d || {};
    const modes = d.modes || {};
    TASK_IDS.forEach(id => { e.modes[id] = MODES[modes[id]] ? modes[id] : ''; });
    e.skills = Array.isArray(d.skills) ? [...new Set(d.skills.filter(s => SKILLS.includes(s)))] : [];
    e.training = TRAINING_OPTIONS.includes(Number(d.training)) ? Number(d.training) : 75000;
    e.adoption = ADOPTION_OPTIONS.some(o => o.v === Number(d.adoption)) ? Number(d.adoption) : 0.8;
    e.realization = REALIZATION_OPTIONS.some(o => o.v === Number(d.realization)) ? Number(d.realization) : 0.7;
    const w = d.workforce || {};
    e.workforce.strategy = WORKFORCE[w.strategy] ? w.strategy : '';
    e.workforce.roles = Array.isArray(w.roles) ? [...new Set(w.roles.filter(r => NEW_ROLES.includes(r)))] : [];
    e.workforce.trigger = HIRING_TRIGGERS[w.trigger] ? w.trigger : '';
    e.recommendation = RECOMMENDATIONS[d.recommendation] ? d.recommendation : '';
    e.criticalTask = TASK_IDS.includes(d.criticalTask) ? d.criticalTask : '';
    e.safeguards = Array.isArray(d.safeguards) ? [...new Set(d.safeguards.filter(s => SAFEGUARDS.some(g => g.id === s)))] : [];
    e.rationale = String(d.rationale || '').slice(0, 4000);
    return e;
  }

  /* What is still missing before a participant can submit. */
  function validate(d) {
    const miss = [];
    const undecided = TASKS.filter(t => !d.modes[t.id]);
    if (undecided.length) miss.push('Choose a mode for: ' + undecided.map(t => t.short).join(', '));
    if (d.skills.length < 1) miss.push('Select at least one future skill');
    if (!d.workforce.strategy) miss.push('Choose a workforce strategy');
    if (!d.workforce.trigger) miss.push('Choose a hiring trigger');
    if (!d.recommendation) miss.push('Choose your recommended action');
    if (!d.criticalTask) miss.push('Choose the task that must keep human accountability');
    if (d.rationale.trim().length < 40) miss.push('Write a rationale of at least 40 characters');
    return miss;
  }

  /* ---------- Economics ---------- */
  function compute(caseIn, dIn) {
    const c = sanitizeCase(caseIn); const d = sanitizeDecisions(dIn);
    const labourPerHour = (c.headcount * c.salary) / (c.hours || 1);
    let saved = 0, rec = 0, setup = 0, aiShare = 0, risk = 0, highRiskAuto = 0;
    const rows = TASKS.map(t => {
      const mode = d.modes[t.id] || 'human';
      const h = c.hours * t.share / 100;
      const red = mode === 'assist' ? t.assist : mode === 'auto' ? t.auto : 0;
      const hrs = h * red / 100;
      const run = mode === 'assist' ? t.assistRun : mode === 'auto' ? t.autoRun : 0;
      const cap = mode === 'assist' ? t.assistSetup : mode === 'auto' ? t.autoSetup : 0;
      saved += hrs; rec += run; setup += cap;
      if (mode !== 'human') aiShare += t.share;
      if (mode === 'auto') risk += t.risk * (t.share / 100) * (t.risk >= 4 ? 2 : 1);
      if (mode === 'auto' && t.risk >= 4) highRiskAuto += t.share;
      const valueTask = hrs * d.adoption * labourPerHour * d.realization;
      return { id: t.id, name: t.name, short: t.short, share: t.share, risk: t.risk, mode, hoursBefore: h,
        released: hrs * d.adoption, hoursAfter: h - hrs * d.adoption, run, setup: cap, value: valueTask,
        taskNet: valueTask - run, red };
    });
    const usesAI = aiShare > 0;
    const oversight = usesAI ? c.overhead : 0;            // v2: oversight only when AI is deployed
    const savedActual = saved * d.adoption;
    const realized = savedActual * labourPerHour * d.realization;
    const monthlySpend = rec + oversight;
    const monthlyNet = realized - monthlySpend;
    const capex = setup + d.training;
    const payback = monthlyNet > 0 ? capex / monthlyNet : Infinity;
    const horizonNet = monthlyNet * c.horizon - capex;
    const riskScore = Math.min(100, risk * 30 + highRiskAuto * 3);
    const overrun = monthlySpend > c.monthlyCap;
    const capexOver = capex > c.setupBudget;
    const hoursPerFte = c.hours / c.headcount;
    const fteReleased = savedActual / hoursPerFte;
    const growthFte = c.headcount * c.growth / 100;   // extra FTE needed next year at current productivity

    /* Diagnostic balance profile (was the separate 40/30/30 "simulation score"; now indices only). */
    const business = clamp(45 + Math.min(25, savedActual / Math.max(1, c.hours) * 80) + (monthlyNet >= 0 ? 15 : -15) +
      (horizonNet >= 0 ? 10 : -10) - (overrun ? 15 : 0) - (capexOver ? 10 : 0), 0, 100);
    let people = 55 + (d.skills.length >= 5 ? 20 : d.skills.length * 4) - highRiskAuto * 1.2 -
      (d.skills.includes('Change management') ? 0 : 10) - (d.skills.includes('Empathetic communication') ? 0 : 8);
    people = clamp(people, 0, 100);
    const riskMgmt = clamp(100 - riskScore + (d.skills.includes('Quality assurance') ? 5 : 0) + (d.skills.includes('Risk judgment') ? 5 : 0), 0, 100);

    let system;
    if (!usesAI) system = 'No AI adoption selected. Maintain the current process, gather task-level data and revisit when evidence or costs change.';
    else if (highRiskAuto >= 10) system = 'Revise before proceeding: high-risk tasks are fully automated. Keep human accountability for complex complaints and policy exceptions.';
    else if (overrun || capexOver || monthlyNet < 0) system = 'Run a limited pilot rather than scale. The assumptions do not support a clean business case or exceed the approved budget; validate benefits, reduce cost or redesign the task split.';
    else system = 'Proceed to a controlled pilot. Validate task-level time savings and quality, train employees, and scale only after the business case and employee impact are measured.';

    return { case: c, decisions: d, rows, labourPerHour, payroll: c.headcount * c.salary, saved, savedActual, rec, oversight,
      setup, aiShare, usesAI, riskScore, highRiskAuto, realized, monthlySpend, monthlyNet, capex, payback, horizonNet,
      overrun, capexOver, hoursPerFte, fteReleased, growthFte,
      profile: { business: r1(business), people: r1(people), risk: r1(riskMgmt) }, systemRecommendation: system };
  }

  /* ---------- Case content (student-facing) ---------- */
  function caseContent(caseIn) {
    const c = sanitizeCase(caseIn);
    const L = n => money(n);
    return {
      title: c.company + ': redesigning the Customer Support Executive role for AI',
      brief: [
        c.company + ' is a fictional mid-sized Indian ' + c.industry.toLowerCase() + ' marketplace selling home and lifestyle products; about 60% of orders come from Tier-2 and Tier-3 cities. Its customer-support hub in Indore has ' + c.headcount + ' Customer Support Executives who handle chat, email and phone in English, Hindi and two regional languages.',
        'Order volumes grew ' + c.growth + '% last year and peak at 2.5× during festive sales. The COO wants faster service before the next festive season. The CHRO wants no forced exits and a credible reskilling plan. The CFO has approved a fixed budget.',
        'You are the HR transformation lead. Decide how the Customer Support Executive role should be redesigned for AI. For each task, choose human-led, AI-augmented or automated. Then set the investment assumptions, plan the workforce and reskilling, and defend your recommendation with evidence from the case.'
      ],
      jd: {
        title: 'Customer Support Executive', reportsTo: 'Team Lead, Customer Experience', location: 'Indore (hybrid)',
        purpose: 'Resolve customer queries efficiently across chat, email and phone while maintaining customer satisfaction, service quality and compliance with company policies.',
        responsibilities: TASKS.map(t => t.name + ' — ' + t.desc + ' (' + t.share + '% of workload)'),
        competencies: ['Written and verbal communication (English, Hindi + one regional language)', 'Problem-solving and customer empathy', 'Knowledge of order, refund and return processes', 'CRM and ticketing-system proficiency', 'Data-privacy awareness and sound judgment'],
        kpis: ['First response time', 'Resolution time', 'CSAT', 'QA score'],
        pay: 'Average ' + L(c.salary) + ' per month; team payroll ' + L(c.headcount * c.salary) + ' per month'
      },
      evidence: [
        { id: 'E1', title: 'Workload and volume', points: [
          c.hours.toLocaleString('en-IN') + ' task-hours per month across ' + c.headcount + ' executives (' + (c.hours / c.headcount).toFixed(0) + ' hours each).',
          'Workload mix: FAQs 30%, ticket routing 15%, order follow-ups 15%, refunds and exceptions 15%, complex complaints 15%, quality review and reporting 10%.',
          '68% of FAQ contacts are "Where is my order?", return status or cash-on-delivery questions.',
          'Volume grew ' + c.growth + '% year on year; festive peaks reach 2.5× normal load.'] },
        { id: 'E2', title: 'Service quality', points: [
          'CSAT (customer satisfaction) is 78% against a target of 85%.',
          '12% of tickets are misrouted, adding an average of 9 hours to resolution.',
          'Complaint escalations take 4.2 days on average; 31% involve customers who had already contacted support twice.',
          'Refund disputes generate 22% of all repeat contacts.'] },
        { id: 'E3', title: 'Systems and data readiness', points: [
          'The approved knowledge base covers about 85% of FAQ intents and is updated weekly.',
          'The order-management system exposes real-time order status through an API.',
          'The refund policy has 14 exception types; 5 are documented only in team-lead emails.',
          'CRM ticket tags are inconsistent in about 20% of tickets.'] },
        { id: 'E4', title: 'People', points: [
          'Average tenure is 2.1 years; annual attrition is 28% (about one exit a month).',
          'Pulse survey: 61% are worried about job security because of AI; 72% want to learn AI tools.',
          'Nine executives already maintain FAQ content informally.',
          'Team leads spend about 30% of their time on manual QA sampling, covering only 2% of tickets.'] },
        { id: 'E5', title: 'Risk and compliance', points: [
          'A refund promise made to a customer is binding under company policy.',
          'Chats contain personal data governed by India\'s Digital Personal Data Protection (DPDP) Act, 2023.',
          'Two complaint escalations went viral on social media last year.',
          'A peer marketplace (fictional) withdrew a fully automated refund bot after disputes spiked.'] },
        { id: 'E6', title: 'Finance and mandate', points: [
          'The CFO approved a one-time budget of ' + L(c.setupBudget) + ' and an AI running-cost cap of ' + L(c.monthlyCap) + ' per month.',
          'Payback is expected within 18 months; the planning horizon is ' + (c.horizon / 12) + ' year(s).',
          'Management: "There is no mandate to reduce headcount; we would prefer to absorb growth without new hires."',
          'Human oversight of AI tools is estimated at ' + L(c.overhead) + ' per month whenever any AI is deployed.'] }
      ],
      framework: [
        { mode: 'AI-first (automate)', when: 'High volume, rule-bound, low risk; reliable data and systems; errors are cheap to reverse.' },
        { mode: 'Human–AI collaboration (augment)', when: 'AI prepares, drafts or analyses; a person decides. Useful when judgment matters but much of the effort is information work.' },
        { mode: 'Human-first (human-led)', when: 'Empathy, accountability, ambiguity or high cost of error; AI only as optional support.' }]
    };
  }

  return { RUBRIC_VERSION, TASKS, TASK_IDS, MODES, SKILLS, SAFEGUARDS, RECOMMENDATIONS, WORKFORCE, NEW_ROLES, HIRING_TRIGGERS,
    TRAINING_OPTIONS, ADOPTION_OPTIONS, REALIZATION_OPTIONS, DEFAULT_CASE, CATEGORIES,
    money, rupees, clamp, r1, sanitizeCase, sanitizeDecisions, emptyDecisions, validate, compute, caseContent };
});
