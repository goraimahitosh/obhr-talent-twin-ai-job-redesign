// Free AI for TALENT TWIN via Netlify AI Gateway.
// On Netlify's credit-based plans (incl. Free) the gateway injects OPENAI_API_KEY / OPENAI_BASE_URL into
// functions automatically, so no key is needed. Usage is metered against a monthly credit cap set by faculty,
// because on the Free plan the whole site pauses if the account's 300 monthly credits run out.
// When AI is off, capped, or unavailable, a built-in rule-based coach answers instead.
import OpenAI from 'openai';
import TT from '../../public/js/model.js';
import * as S from './store.mjs';

const PRICES = {                       // USD per 1M tokens [input, output]; $1 = 180 Netlify credits
  'gpt-4.1-nano': [0.10, 0.40], 'gpt-4o-mini': [0.15, 0.60], 'gpt-4.1-mini': [0.40, 1.60],
  'gpt-5-nano': [0.05, 0.40], 'gpt-5.4-nano': [0.20, 1.25], 'gpt-5-mini': [0.25, 2.00]
};
export const DEFAULT_AI = { enabled: true, bot: true, report: true, botMessages: 10, monthlyCreditCap: 100, model: 'gpt-4.1-nano' };

export function aiConfigured() { return !!process.env.OPENAI_API_KEY; }
const monthKey = () => 'ai-usage-' + new Date().toISOString().slice(0, 7);
export async function usage() { return (await S.getKV(monthKey())) || { month: new Date().toISOString().slice(0, 7), calls: 0, inTok: 0, outTok: 0, credits: 0, fallbacks: 0 }; }

// Create the client per call: Netlify injects gateway credentials per invocation, so never reuse a stale client.
function openai() { return new OpenAI({ timeout: 25000, maxRetries: 1 }); }   // reads OPENAI_API_KEY / OPENAI_BASE_URL

/* Can we spend on AI right now? Returns null if yes, or a reason string. */
export async function blockedReason(ai) {
  if (!ai.enabled) return 'AI is switched off by faculty.';
  if (!aiConfigured()) return 'Netlify AI Gateway is not available on this site.';
  const u = await usage();
  if (u.credits >= ai.monthlyCreditCap) return 'This month\'s AI budget set by faculty has been used.';
  return null;
}

async function record(model, inTok, outTok) {
  const p = PRICES[model] || PRICES['gpt-4o-mini'];
  const credits = ((inTok * p[0] + outTok * p[1]) / 1e6) * 180;
  await S.updateKV(monthKey(), cur => {
    const u = cur || { month: new Date().toISOString().slice(0, 7), calls: 0, inTok: 0, outTok: 0, credits: 0, fallbacks: 0 };
    return Object.assign({}, u, { calls: u.calls + 1, inTok: u.inTok + inTok, outTok: u.outTok + outTok, credits: Math.round((u.credits + credits) * 1000) / 1000 });
  });
}
export async function recordFallback() {
  await S.updateKV(monthKey(), cur => { const u = cur || { month: new Date().toISOString().slice(0, 7), calls: 0, inTok: 0, outTok: 0, credits: 0, fallbacks: 0 }; return Object.assign({}, u, { fallbacks: (u.fallbacks || 0) + 1 }); });
}

async function complete(ai, messages, { json, maxTokens }) {
  const model = ai.model || DEFAULT_AI.model;
  const req = { model, messages, max_tokens: maxTokens, temperature: 0.4 };
  if (json) req.response_format = { type: 'json_object' };
  const r = await openai().chat.completions.create(req);
  const u = r.usage || {};
  await record(model, u.prompt_tokens || 0, u.completion_tokens || 0);
  return (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content || '').trim();
}

/* ---------- shared case context (no scoring rules, no reference answers) ---------- */
function caseContext(caseFacts) {
  const c = TT.sanitizeCase(caseFacts); const cc = TT.caseContent(c);
  return ['CASE: ' + cc.brief.join(' '),
    'CURRENT JOB: ' + cc.jd.title + ' — ' + cc.jd.purpose,
    'TASKS (share of workload; time released if AI-augmented / automated; monthly AI cost augmented / automated; risk):',
    ...TT.TASKS.map(t => '- ' + t.name + ': ' + t.share + '%; ' + t.assist + '% / ' + t.auto + '%; ' + TT.rupees(t.assistRun) + ' / ' + TT.rupees(t.autoRun) + '; ' + (t.risk >= 4 ? 'high' : t.risk === 2 ? 'medium' : 'low') + ' risk'),
    'EVIDENCE: ' + cc.evidence.map(e => e.id + ' ' + e.title + ': ' + e.points.join(' ')).join(' | '),
    'MODEL RULES: hours released = task hours × time-release % × adoption; value = hours released × labour cost per hour (' + TT.rupees(c.headcount * c.salary / c.hours) + ') × realization share; monthly spend = AI running costs + oversight ' + TT.rupees(c.overhead) + ' if any AI is used; net = value − spend; one-time = setup + reskilling; payback = one-time ÷ net.'].join('\n');
}
function draftContext(caseFacts, d) {
  const res = TT.compute(caseFacts, d);
  return ['STUDENT\'S CURRENT CHOICES: ' + TT.TASKS.map(t => t.short + '=' + (d.modes[t.id] ? TT.MODES[d.modes[t.id]] : 'not chosen')).join('; '),
    'Skills: ' + (d.skills.join(', ') || 'none') + '. Reskilling ' + TT.rupees(d.training) + ', adoption ' + Math.round(d.adoption * 100) + '%, realization ' + Math.round(d.realization * 100) + '%.',
    'Workforce: ' + (TT.WORKFORCE[d.workforce.strategy] ? TT.WORKFORCE[d.workforce.strategy].label : 'not chosen') + '; trigger: ' + (TT.HIRING_TRIGGERS[d.workforce.trigger] || 'not chosen') + '. Recommendation: ' + (TT.RECOMMENDATIONS[d.recommendation] || 'not chosen') + '.',
    'LIVE ECONOMICS: hours released ' + Math.round(res.savedActual) + '/month; value ' + TT.rupees(res.realized) + '; AI+oversight ' + TT.rupees(res.monthlySpend) + ' (cap ' + TT.rupees(res.case.monthlyCap) + '); net ' + TT.rupees(res.monthlyNet) + '/month; one-time ' + TT.rupees(res.capex) + ' (budget ' + TT.rupees(res.case.setupBudget) + '); payback ' + (Number.isFinite(res.payback) ? res.payback.toFixed(1) + ' months' : 'not reached') + '.'].join('\n');
}

const COACH_SYSTEM = `You are "TALENT TWIN Coach", an AI tutor inside an MBA classroom simulation on AI-era job redesign (Strategic HRM) at an Indian business school.
Rules:
1. Coach, don't decide. Never tell the student which mode to choose for a task, which option is "correct", or what scores well. Ask one guiding question and point to the relevant evidence cards (E1–E6) and trade-offs instead.
2. Never discuss scoring, points, rubrics or reference answers.
3. You may explain concepts (job analysis, AI-first / collaboration / human-first allocation, Hackman & Oldham job characteristics, capacity released vs cash savings, payback, adoption maturity, reskilling, India's DPDP Act 2023), clarify case facts, and check the student's arithmetic using the model rules given.
4. Do not write the student's rationale for them. You may give brief feedback on a draft they paste.
5. Keep answers under 120 words, in plain language, using ₹ and lakh/crore where useful.
6. Stay on this simulation; politely decline anything unrelated. Use only the facts provided; all company data is fictional. Never invent figures.`;

export async function coachReply(ai, caseFacts, draft, history, question) {
  const msgs = [{ role: 'system', content: COACH_SYSTEM + '\n\n' + caseContext(caseFacts) + '\n\n' + draftContext(caseFacts, draft) }];
  history.slice(-6).forEach(h => msgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 800) }));
  msgs.push({ role: 'user', content: question });
  return complete(ai, msgs, { maxTokens: 300 });
}

export async function reportSuggestions(ai, report, withReference, reference) {
  const d = report.decisions; const r = report.rubric; const e = report.economics;
  const lines = [caseContext(report.case), draftContext(report.case, d),
    'SUBMITTED RATIONALE: "' + (d.rationale || '').slice(0, 1500) + '"',
    'RESULTS: score ' + report.score + '/100; ' + report.categories.map(c => c.label + ' ' + r[c.key] + '/' + c.max).join('; ') + '.',
    'WEAKEST RUBRIC ITEMS: ' + r.items.filter(i => i.pts < i.max).sort((a, b) => (a.pts / a.max) - (b.pts / b.max)).slice(0, 6).map(i => i.label + ' ' + i.pts + '/' + i.max + (i.note ? ' (' + i.note + ')' : '')).join('; '),
    'TASK-LEVEL NET (value − AI cost per month): ' + e.rows.filter(x => x.mode !== 'human').map(x => x.short + ' ' + TT.rupees(x.taskNet)).join('; ')];
  if (withReference && reference) lines.push('FACULTY REFERENCE (debrief released, you may mention it): ' + TT.TASKS.map(t => t.short + ': ' + TT.MODES[reference[t.id].best] + ' (' + reference[t.id].evidence.join(', ') + ')').join('; '));
  const sys = `You are an experienced HR-strategy professor giving a student personal, specific feedback after they submitted a job-redesign simulation.
Write in second person, warm but candid. Use the student's actual numbers and decisions, cite evidence cards (E1–E6), and keep the total under 230 words.
${withReference ? 'The debrief has been released, so you may compare their choices with the faculty reference.' : 'Do not reveal which option is "correct" for any task; frame suggestions as questions and trade-offs to reconsider.'}
Do not restate or change the score. Return ONLY JSON: {"headline": string (one sentence), "suggestions": [{"title": string (max 8 words), "detail": string (1-2 sentences)}] (3 to 4 items), "replay": string (one sentence: what to try if they replayed), "reflection": string (one question to reflect on)}.`;
  const raw = await complete(ai, [{ role: 'system', content: sys }, { role: 'user', content: lines.join('\n') }], { json: true, maxTokens: 650 });
  const j = JSON.parse(raw.replace(/^```(json)?|```$/g, ''));
  const clean = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  return { headline: clean(j.headline, 300), suggestions: (Array.isArray(j.suggestions) ? j.suggestions : []).slice(0, 5).map(s => ({ title: clean(s.title, 80), detail: clean(s.detail, 500) })).filter(s => s.title && s.detail),
    replay: clean(j.replay, 400), reflection: clean(j.reflection, 300) };
}

/* ---------- built-in coach (no AI) ---------- */
const KB = [
  { k: ['capacity', 'cash', 'saving', 'realiz', 'realis'], a: 'Hours released by AI are capacity, not cash. They only create value if they avoid new hires or overtime, or let the team handle more volume. The realization share is your estimate of how much becomes real value. With 32% volume growth (E1) and 28% attrition (E4), ask yourself: will released hours absorb growth, or will they simply sit idle?' },
  { k: ['payback', 'roi', 'return', 'break'], a: 'Payback = one-time cost (setup + reskilling) ÷ net monthly benefit. If net benefit is zero or negative, payback is never reached. Check the task-level net column on the Economics step: which AI choices cost more per month than the value they release?' },
  { k: ['adoption', 'maturity'], a: 'Adoption maturity scales the modeled time savings: 65% cautious, 80% expected, 100% optimistic. Real deployments rarely hit 100% early. Pick the level you could defend to the CFO (E6), and test whether your business case survives at 65%.' },
  { k: ['hackman', 'oldham', 'safeguard', 'autonomy', 'variety', 'identity', 'significance', 'feedback', 'job characteristic'], a: 'Hackman & Oldham: jobs motivate when they offer skill variety, task identity, task significance, autonomy and feedback. When AI takes routine work, does the remaining role keep these, or become monitoring only? Choose the safeguards you would genuinely build into the new role.' },
  { k: ['augment', 'automate', 'human-led', 'human led', 'framework', 'allocate'], a: 'Automate when work is high-volume, rule-bound and low-risk, with reliable data. Augment when AI can prepare or draft but a person should decide. Keep it human-led when empathy, accountability or a high cost of error dominates. For each task, which evidence card tips the balance?' },
  { k: ['refund', 'exception', 'policy'], a: 'For refunds and policy exceptions, look at E3 (14 exception types, 5 undocumented) and E5 (refund promises are binding). Ask: what happens when the AI is wrong, and who is accountable? Then compare the time released with the monthly AI cost.' },
  { k: ['complaint', 'escalat', 'empath'], a: 'Complex complaints drive repeat contacts (E2) and reputational risk (E5). Consider how much time AI really saves here (a small share) and what it could do to support, rather than replace, human judgment.' },
  { k: ['faq', 'routine', 'repetitive', 'chatbot'], a: 'Routine FAQs are 30% of the workload (E1), and the knowledge base covers about 85% of intents (E3). Weigh the volume and data readiness against how exceptions get routed to a person.' },
  { k: ['routing', 'classif', 'misrout'], a: 'Ticket routing is structured and repeatable, and 12% of tickets are misrouted today (E2). What monitoring would you need if AI took this over, and how would you spot bias or errors?' },
  { k: ['follow', 'order status', 'order-status', 'tracking'], a: 'Order follow-ups depend on system access. E3 notes a real-time order-status API. Does that make the task rule-bound enough for AI, and what is the fallback when data is missing?' },
  { k: ['quality', 'qa', 'report'], a: 'Team leads sample only 2% of tickets for quality (E4). Think about how AI could widen coverage while leads still validate and interpret the findings (E2).' },
  { k: ['workforce', 'layoff', 'headcount', 'attrition', 'hire', 'hiring', 'recruit', 'redeploy'], a: 'E6 says there is no mandate to reduce headcount, and E4 shows 28% annual attrition and anxious staff. Compare the FTE your design releases with the extra FTE that 32% growth requires (Workforce step). Can redeployment or attrition absorb the change before you hire?' },
  { k: ['recommend', 'pilot', 'scale', 'pause', 'reject'], a: 'Your recommendation should match your own results. If the design overruns budget, has negative monthly economics or automates high-risk work, scaling now is hard to defend. If there is no AI in your design, recommending a pilot would not be consistent.' },
  { k: ['rationale', 'write', 'justify', 'evidence', 'cite'], a: 'A strong rationale states the trade-off (value vs customer risk vs people), explains your two or three most important task choices, and cites evidence cards in brackets, e.g. (E3), (E5). Aim for 4 to 6 sentences.' },
  { k: ['dpdp', 'privacy', 'data protection', 'personal data'], a: 'India\'s Digital Personal Data Protection (DPDP) Act 2023 governs the personal data in support chats (E5). Think about consent, purpose limitation and access controls when AI tools process customer conversations.' },
  { k: ['skill', 'reskill', 'training', 'competenc'], a: 'Choose a focused set of future skills that matches your task split: AI-collaboration skills where AI does the work, and judgment and empathy skills where people stay in charge. Then size the reskilling budget so the transition is credible (E4).' }
];
export function builtinCoach(question) {
  const q = String(question || '').toLowerCase();
  let best = null, hits = 0;
  for (const item of KB) { const h = item.k.filter(k => q.includes(k)).length; if (h > hits) { hits = h; best = item; } }
  if (best) return best.a;
  return 'I can help with concepts and the case: the human–AI allocation framework, capacity vs cash, payback, adoption, Hackman & Oldham safeguards, the workforce plan, writing your rationale, or what a specific task or evidence card means. Try asking about one of those.';
}
