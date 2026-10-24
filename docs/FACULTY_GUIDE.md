# TALENT TWIN — Job Redesign Lab · Faculty Guide (v2)

**Keep this guide private.** It contains the reference pattern and the scoring rules. Participants see only the student app.

## Course fit
- **Primary:** Strategic HRM in a Digital World, Sessions 3–4 (job analysis, competency mapping, AI-era job redesign).
- **Supporting:** Session 5 (HR planning) and Session 8 (training & development).
- **Theory hooks:** AI-first / human–AI collaboration / human-first allocation; Hackman & Oldham job characteristics (autonomy, skill variety, task identity, task significance, feedback); capacity released vs cash savings; responsible AI under India's DPDP Act 2023.

## Suggested 45-minute session (individual play, everyone at once on their own device)
| Time | Activity |
|---|---|
| 0–5 min | Console: open the session, set a 35-minute limit, share the student link. Introduce Sahaay Commerce. |
| 5–40 min | Participants read the case and evidence cards (E1–E6), open the documents, redesign six tasks, choose skills, run the economics, plan the workforce, write a recommendation citing evidence, and submit. The leaderboard updates live. |
| 40–45 min | Click **End session now** (auto-submits the rest). Show the leaderboard and class-decisions chart. |
| Debrief (next 15–20 min) | Turn on **Release the debrief**. Participants see the reference pattern and LEAH's recommendation in their reports. Use the questions below. |

## What participants decide
1. **Task allocation** for six task groups (human-led / AI-augmented / automated).
2. **Future skills** (12 options; 3–7 is a focused portfolio).
3. **Investment & assumptions:** reskilling budget (₹0–₹3L), adoption maturity (65/80/100%), value realization (25/50/70/100%).
4. **Workforce plan:** strategy (redeploy / attrition / hire specialists / reduce), new roles, hiring trigger.
5. **Recommendation:** pilot / scale / pause / reject; the task needing human accountability; job-design safeguards; a written rationale citing evidence IDs.

Case facts (team size, salary, workload, budgets, oversight cost, horizon, growth) are **fixed by faculty**, so nobody can raise their score by editing the scenario. Each participant is scored on the facts in force when they started.

## The economic model (deterministic)
- Labour cost per workload-hour = (team size × salary) ÷ monthly workload hours.
- Hours released = Σ task hours × mode time-release % × adoption maturity.
- Value realized = hours released × labour cost per hour × realization share. *Released capacity is not cash.*
- Monthly spend = AI running cost of the chosen modes + human oversight (**only if any AI is used**).
- Net monthly benefit = value realized − monthly spend. One-time cost = setup costs + reskilling. Payback = one-time ÷ net (if positive).
- FTE released = hours released ÷ (workload ÷ headcount); compared with the FTE needed for annual volume growth.

Default case (calibrated): 40 executives, ₹30,000 salary, 5,600 h/month, ₹15L one-time budget, ₹2.5L/month AI cap, ₹15K oversight, 36-month horizon, 32% growth.

| Strategy | Net / month | Payback | Score |
|---|---:|---:|---:|
| Reference pattern (automate FAQs, routing, follow-ups; augment refunds & QA; complaints human) | +₹1.39L | 10.6 mo | ≈97 |
| Augment routine work, refunds & complaints human | +₹78K | 9.3 mo | ≈95 |
| Automate FAQs only | +₹86K | 5.5 mo | ≈91 |
| No AI at all | ₹0 | — | ≈72 |
| Automate everything | +₹71K, over budget | 31.9 mo | ≈66–70 |

## Official score (100 points, computed on the server)
| Category | Pts | Rules |
|---|---:|---|
| Business impact & economics | 25 | Net monthly benefit (2 if ≤0, else 6–10 by net ÷ spend); horizon net >0 → 5, ≥ −50% of one-time → 2; within monthly cap 4; within one-time budget 3; payback ≤12/≤24/≤36 mo → 3/2/1 |
| Course concepts & task fit | 25 | Points per task, scaled to 25: FAQs/routing/follow-ups human 1.5 · augment 3.5 · automate 4; refunds human 4.5 · augment 5 · automate 0; complaints human 5 · augment 4 · automate 0; QA human 2.5 · augment 4.5 · automate 3.5 |
| Job design & reskilling | 20 | 3–7 skills → 7 (fewer pro-rata; more loses 1 per extra skill, min 3); AI-collaboration skill 1.5; human-judgment skill 1.5; safeguards 10 × min(1, n/3) |
| Responsible AI & people impact | 20 | Sensitive-task accountability 8 (refunds augment 5 / human 4; complaints human 5 / augment 4; QA augment 3 / human 2.5 / automate 1; ÷13×8); change management 2; judgment/empathy skill 2; quality skill 2; reskilling ≥₹75K → 2, >0 → 1; adoption <100% → 1 and realization ≤70% → 1; workforce: redeploy/attrition 2, specialists 1, reduce 0 |
| Completeness & case evidence | 10 | All six tasks decided 1; recommendation consistent with own results 2 (else 0.5); human-accountability task = complaints or refunds 2 (else 0.5); rationale ≥100 chars 2 / ≥40 → 1 / any 0.5, plus 2+ evidence IDs → 1 (one → 0.5); 3+ safeguards 1; workforce plan complete 1 |

"Consistent recommendation": no AI → pause/reject; high-risk automation, budget overrun or negative net → pilot/pause; otherwise pilot/scale.
**Faculty adjustment:** ±10 per participant with a reason (e.g. oral defence). The rationale is checked for length and citations only; use the LEAH debrief and discussion to judge its quality.

### Changes from the v1 scoreboard (and why)
| v1 | v2 | Why |
|---|---|---|
| Scenario and budgets editable by teams | Fixed by faculty | Editing salary/budgets gave 100/100 |
| Oversight charged even with no AI | Only when AI is used | "Reject AI" was penalised for costs it never incurred |
| "Reject" never counted as aligned | Aligned when no AI is used | The UI promised "do not automate" was valid |
| Two scores (40/30/30 and 100-point) | One official score; 40/30/30 shown as a diagnostic profile | Conflicting numbers confused students |
| Safeguards: full credit only for ticking all 5 | Full credit at 3 | The hint said "don't tick everything" |
| Critical-task choice counted twice | Counted once; workforce strategy added to Responsible AI | Double counting |
| Training: any amount > ₹0 earned points | Fixed options; ≥ ₹75K for full credit | ₹1 earned full points |
| JSON import trusted the file's score | Server recomputes every score | Scores could be forged |
| Defaults made the evidence-backed design lose money | Calibrated case (40 staff, ₹15L/₹2.5L budgets) | The "right" answer was the least profitable |
| Teams on one computer | Individuals on their own devices, live | Requested multi-user play |

## Reference pattern (released to participants only when you choose)
| Task | Strongest fit | Also defensible | Evidence |
|---|---|---|---|
| Routine FAQs (30%) | Automate | Augment | E1 volume, E3 knowledge base 85% coverage |
| Ticket routing (15%) | Automate | Augment | E2 12% misrouting, E1 |
| Order follow-ups (15%) | Automate | Augment | E3 order-status API |
| Refunds & exceptions (15%) | AI-augmented | Human-led | E3 14 exception types, E5 binding promises |
| Complex complaints (15%) | Human-led | Augment | E2 escalations, E5 social-media risk |
| Quality & reporting (10%) | AI-augmented | Human-led | E2, E4 leads sample only 2% |

## Free AI (Netlify AI Gateway)
- **AI coach**: Socratic tutor; explains concepts, case facts and arithmetic; never gives "the answer" or discusses scoring. Replies per participant are capped (default 10). You can read every conversation in the participant drawer, and the leaderboard shows a "Coach Qs" count.
- **AI suggestions**: generated once per participant after submission. Grounded in their decisions, weakest rubric items and rationale. Mentions the reference pattern only after you release the debrief. It does not affect the score.
- **Budget**: about 0.07 credits per coach reply and 0.1 per report (gpt-4.1-nano), roughly 45 credits per 60-student class. Netlify Free gives 300 credits a month shared with hosting, and the site pauses if they run out, so keep the monthly AI cap at 100 or below. When AI is off, capped or unavailable, the built-in coach answers automatically.
- **Debrief use**: ask the class which coach questions were most useful, and whether the AI's suggestions agreed with the evidence. This is a good discussion of AI-augmented (not automated) learning.

## LEAH workflow
1. **Before class:** Console → LEAH tab → Step A. Copy the case prompt into the orchestrator (Preview), paste the full answer back, and import it.
2. **After submissions:** Step B, in batches of 12. Copy, run in LEAH, paste back, import. Personal feedback appears in each report. Codes only; names never leave the app.
3. **Debrief:** release the debrief so reports show the reference pattern, LEAH's recommendation and LEAH's class insights.

## Debrief questions
1. Which tasks did you keep human-critical, and which evidence card drove that choice?
2. Where was AI technically feasible but economically unattractive? (See negative task-level values.)
3. What is the difference between hours released and cash savings? What did you assume?
4. Does your redesign enrich or hollow out the job (autonomy, skill variety, identity, significance, feedback)?
5. How does your plan use 28% attrition and 32% growth instead of layoffs?
6. What would you validate before doing this in a real Indian company (data quality, DPDP Act, pilot metrics)?

## Limits
All figures are fictional teaching assumptions. The rubric is transparent and deterministic, not a validated assessment.
Do not use the tool for real hiring, firing or performance decisions.
