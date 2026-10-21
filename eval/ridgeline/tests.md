# How a run is scored

Not loaded. Not run. `scripts/eval-app.ts` still questions Northwind.

The files in this folder are the company. They disagree with each other on purpose. Nothing in them says which file wins.

Product checks are the gate. Answer checks are the quality score. A required fact still has to appear. Appearing next to irrelevant chunks, or next to a claim that is wrong or unlabeled, costs its own points.

Trace titles are the names on the Knowledge page. `list_meetings`, `list_tasks`, `list_competitors`, and `read_calendar` return whole tables. Those calls are not the retrieved set. A fact taken from an off-question row of one of those tables is still graded as a claim.

After `retrieve_context`, a second lookup is required when the question is about company figures (`get_metric`), open work (`list_tasks`, then `list_objectives`), or row counts (`query_dataset`). The brief may only state what those tools returned. If a named date or file did not contain the asked fact, the brief has to say so.

## Points on every answer

**Retrieval (1).** Union of every `retrieve_context` chunk in the trace, plus the source documents of every `get_metric` record or claim and every `query_dataset` result. The point passes when every document the question depends on appears at least once, no off-question document appears, and chunks from “may appear” do not outnumber chunks from “depends on.”

**Required claims (1 each).** The brief has to contain each one. A required claim that is missing scores 0. A required claim that is present and then contradicted by another sentence also scores 0.

**Extra claims (1 each).** Split the brief into factual claims: numbers, dates, owners, decisions, and what a product does. Each extra claim scores 1 only when it is supported by the source of record for that question, or when it is stale and labeled. An unsupported claim scores 0. A neighboring required claim does not cover it. Zero extra claims add nothing and lose nothing.

**Stale label (1).** A figure from a deck, a call, or the March scan may appear only when that same sentence names the file and says it is not the record. Stated as current, the point is 0. No stale figure in the brief passes the point.

**Volume (1).** Sentences that are not required claims, and are not a single line saying an off-question topic is out of scope, stay under one third of the brief. Crossing that, or answering with an off-question topic, scores 0.

## Where the numbers live

The books are `finance/ridgeline-gl-2025Q4-2026Q3.xlsx`, tab Quarters, which is formulas over the Monthly tab. The twelve months are October 2025 through September 2026.

| | Q4 2025 | Q1 2026 | Q2 2026 | Q3 2026 | Twelve months |
|---|---:|---:|---:|---:|---:|
| Gross bookings | $36.4M | $41.8M | $18.6M | $11.2M | $108.0M |
| Booking commission | $3.18M | $3.72M | $1.55M | $0.94M | $9.39M |
| Take rate | 8.7% | 8.9% | 8.3% | 8.4% | 8.7% |
| Net revenue | formula | formula | formula | formula | $12.24M |
| Contribution margin | formula | formula | formula | formula | 33.9% |
| Operating income | formula | formula | formula | formula | −$16.26M |
| Cash, end | $11.2M | $9.8M | $14.1M | $16.4M | $16.4M (September) |
| Snow Pass subscribers, end | 41,200 | 44,800 | 47,100 | 52,300 | 52,300 |
| Renewal | 71% | 69% | 76% | 74% | the cell repeats Q3, it is not an average |

Net revenue is commission plus Snow Pass plus placement. Twelve-month Snow Pass revenue is $2.35M. Placement is $0.50M. Contribution profit is $4.15M. Those are the formula results, not a second set of books.

`data/users-export-2026-10-12.xlsx` is 2,000 rows, not deduped. `pass_field` is not one spelling. A pass that treats one `COUNTIF` as “Epic bookers” fails.

## What contradicts the books

| File | What it says | Why it fails a numbers question |
|---|---|---|
| `decks/Ridgeline-investor-deck-2026-01.pptx` | Q4 gross bookings $42M, take rate 11%, 48,000 subscribers. Flights are next. Gear is this year. WeSki $8M. Ski.com $15M. | Q4 gross bookings are $36.4M, take rate 8.7%, subscribers at December were 41,200. Flights and gear are off the working roadmap. |
| `decks/Ridgeline-investor-deck-2026-09.pptx` | Trailing bookings $120M, take rate ~10%, 55,000 subscribers, cash $18M. Ski.com under $5M. Q3 is absent. | Twelve-month gross bookings are $108.0M, take rate 8.7%, September subscribers 52,300, September cash $16.4M. |
| `research/competitor-scan-2026-03.txt` | WeSki $8M. Ski.com $15M, with $20M and $40M also written down. Flights still “next.” | Superseded on competitors by the August scan, and wrong on flights. |
| `research/competitor-scan-2026-08.txt` | WeSki $5–6M estimated. Ski.com unresolved: under $5M, and other sources at $20M and $40M. March’s $15M was a bad split. | This is the later scan. Printing a single Ski.com revenue fails. |
| `notes/2026-01-12-investor-call.txt` | The investor read $42M and 11% back. Nobody corrected it. | Repeating the call is not the close. |
| `notes/2026-06-03-investor-call.txt` | “About $18M” cash and “around 50,000” subscribers were said out loud. July board pdf take rate 9.2% was still in the data room. The replacement figure is not in the note. | Cash at June was $14.1M. The 9.2% figure is not in the GL. |

## Files that are not numbers

| File | What a reader actually has |
|---|---|
| `notes/2026-09-03-guest-recovery.txt` | Phone notes. 14-day move, inside 14 days a credit, not cash. School contracts waved off. No name. No action. |
| `notes/2026-10-02-group-sales-fwd.txt` | A forwarded phone email. Minneapolis club on the normal rule. Blackcomb School District, 40 rooms, $189, February 12–15, deposit nonrefundable December 1. Not on a task board. |
| `notes/2026-10-08-supply.txt` | Late notes. Take rate not touched before Thanksgiving. Snow Pass stays $39. 12% day-ticket idea not decided. Finance fixes the data room before the 22nd. Head of Supply writes the Ikon legal block by the 24th. |
| `notes/2026-10-16-rank-standup.txt` | Rank refresh still November 1. Ikon feed still blocked on their legal. No new task. |
| `notes/2026-09-28-investor-prep.txt` | Internal. November 6. Finance does not want the September deck walked in. Q3 is the GL. |
| `notes/roadmap-working.txt` | Touched October 13. Not a plan of record. Gear and flights are in “not doing.” A $49 Snow Pass test was killed and typed back on. |

## Product checks

Same app behavior as before, pointed at this company once it is loaded.

| Check | Pass |
|---|---|
| Demo login | Logged-out `/login` offers demo mode and not Google. Logged-out `/dashboard` redirects to `/login`. Session email is `founder@ventureos.dev`. |
| Knowledge | The notes, both scans, the roadmap, and text extracts of both decks are listed. Northwind documents are gone. |
| Meetings | The note files are the meetings. There is no separate clean meeting table unless one is loaded from these notes. |
| Tasks, before any copilot run | Rank refresh in progress, Product, due November 1. Ikon feed blocked, Supply. Day-ticket options still a draft, Finance. The October 8 actions are not tasks yet. |
| Integrations | Tavily connected. OpenAI connected. Gmail, Calendar, and Inngest not connected. |
| Ingest | Empty note is HTTP 400. A long note chunks with overlap. The test deletes what it creates. |
| Tasks API | Create, patch to done, delete. Unknown id is 404. Missing agent prompt is 400. |
| `list_competitors` | Whatever was loaded from the August scan, not Metabase or Hex. |
| `read_email` / `read_calendar` | No Google token. Email source `demo` and empty. Calendar source `workspace`. |
| `web_search` | Live result, not the demo stub. |
| Inngest | Both function ids exist. `GET /api/inngest` is handled by the SDK. |
| Each copilot run | Run id, a plan step, at least one tool or retrieval, a brief, only that copilot’s tools, stored as completed, no error event. |

## Answer checks

Source of record for a number is the general ledger table above. Source of record for a decision is the note that records it. A deck, a call, and the March scan are stale sources. The user export is never the source for a company total.

The scored prompts are the ones below. The Investor Prep starter in the app uses the same wording. The other starters that match a prompt below are unchanged.

### Investor Prep

Prompt: “Prep me for the November 6 growth investor meeting. What should I walk in with?”

Depends on: `GL export — Oct 2025 through Sep 2026`, `Investor prep — 28 Sep 2026`.

May appear: `Investor deck — September 2026`, `Investor deck — January 2026`, `Investor call — 12 Jan 2026`, `Investor call — 3 Jun 2026`. Only as files to label.

Off this question: `Users export — 12 Oct 2026`, `Guest recovery — 3 Sep 2026`, `Group sales queue — 2 Oct 2026`, both competitor scans, `Rank standup — 16 Oct 2026`.

Required claims:

- Twelve-month gross bookings $108.0M, commission $9.39M, take rate 8.7%, net revenue $12.24M.
- September cash $16.4M and 52,300 Snow Pass subscribers.
- The September deck’s $120M, ~10%, 55,000 subscribers, and $18M cash are not the close.
- No fund name and no partner name.

Extra claims. Any other figure scores only when it matches the ledger, or the sentence names the deck or the call and says it is not the close. Q4 gross bookings stated as $42M, take rate stated as 11% or ~10%, cash stated as $18M, and subscribers stated as 55,000 or 48,000 each score 0. Headcount, a renewal average, gear shipping this year, or flights in the package score 0 unless the sentence is quoting a file and marking it as not the record.

Volume. Guest recovery, the school block, competitor revenue, and the rank-refresh schedule are off this answer.

### Competitive Analysis

Prompt: “What do WeSki and Ski.com actually sell, and what revenue can we stand behind?”

Depends on: `Competitor scan — August 2026`.

May appear: `Competitor scan — March 2026`, `Roadmap, working copy — 13 Oct 2026`. March only to say its revenue figures were dropped.

Off this question: the general ledger, both decks, the user export, and every meeting note.

Required claims:

- WeSki sells flight, stay, and ground transfer. Ski.com is an expert planner; lodging on the page is Expedia.
- WeSki revenue is the August estimate, $5–6M. Ski.com is unresolved: under $5M on the August sheet, with other sources at $20M and $40M.
- Ridgeline’s package has no flight.

Extra claims. A single Ski.com revenue, March’s $8M, or March’s $15M stated as current each score 0. OnTheSnow, OpenSnow, Liftopia, and Mindtrip may appear only as August-scan facts. A Ridgeline bookings or take-rate figure scores 0 on this question.

Volume. Investor-meeting prep, deposits, and the task board are off this answer.

### Competitive Analysis, off the list

Prompt: “What did Notion ship for ski trips this quarter?”

Depends on: a `web_search` result in the trace. Neither competitor scan mentions Notion, so those files cannot support a product claim.

May appear: both competitor scans, retrieved to show Notion is absent.

Off this question: the general ledger, both decks, the user export, and the meeting notes.

Required claims:

- Notion is not in the March or August scan.
- Any claim about what Notion shipped is tied to a web result in the trace. No web result means the brief says the workspace does not contain it.

Extra claims. A ski changelog written from general knowledge scores 0. Calling Notion a Ridgeline competitor scores 0. A WeSki or Ski.com revenue figure scores 0.

Volume. The rest of the competitor set and Ridgeline’s books are off this answer.

### Meeting Synthesis

Prompt: “Go through the October 8 supply notes and make tasks only for what was actually handed to someone.”

Depends on: `Supply review — 8 Oct 2026`.

May appear: `Rank standup — 16 Oct 2026`, `Roadmap, working copy — 13 Oct 2026`. Only to see that the rank refresh already has an owner.

Off this question: the general ledger, both decks, both scans, the user export, `Guest recovery — 3 Sep 2026`, `Group sales queue — 2 Oct 2026`, both investor calls.

Required claims:

- Take rate stays put through Thanksgiving. Snow Pass stays $39. The 12% day-ticket idea was not decided.
- One new task: Finance, due October 22, get the July board pdf out of the data room and use the ledger.
- One new task: Head of Supply, due October 24, the Ikon feed and the legal block.
- No new task for Blackcomb, the rank refresh, the 12% draft, gear, or flights.

Extra claims. A replacement take rate, including 9.2%, scores 0. The June call is the only place 9.2% is written down, and it is not the right number. Assigning the Ikon note to Product scores 0. A bookings, cash, or subscriber figure scores 0.

Volume. The school contract, guest-recovery policy, and either investor deck are off this answer. Creating a task counts as a claim, not as volume.

### Meeting Synthesis, price

Prompt: “Did we decide to raise the take rate?”

Depends on: `Supply review — 8 Oct 2026`.

May appear: `Rank standup — 16 Oct 2026`, `Guest recovery — 3 Sep 2026`, `Roadmap, working copy — 13 Oct 2026`. October 16 and September 3 are in scope only to say they did not discuss price.

Off this question: both decks, both investor calls, both scans, the general ledger, the user export, `Group sales queue — 2 Oct 2026`.

Required claims:

- October 8 said do not touch the take rate before Thanksgiving.
- The 12% day-ticket idea has no date and is not a decision.
- October 16 and September 3 did not talk about price.

Extra claims. 11%, ~10%, or 9.2% stated as the decision scores 0. Quoting 11% from the January deck or ~10% from the September deck scores only when that sentence names the file and says it was not a decision. A ledger take rate of 8.7% stated as “what we decided to charge” scores 0. The ledger is the close, not a pricing vote.

Volume. Bookings, cash, subscribers, and competitor revenue are off this answer.

### Task Management

Prompt: “What is actually in motion before Thanksgiving bookings, and what is stuck?”

Depends on: `Roadmap, working copy — 13 Oct 2026` or `Rank standup — 16 Oct 2026`, and a `list_tasks` result that includes the rank refresh and the Ikon feed.

May appear: `Supply review — 8 Oct 2026`.

Off this question: the general ledger, both decks, both scans, the user export, `Guest recovery — 3 Sep 2026`, `Group sales queue — 2 Oct 2026`, both investor calls.

Required claims:

- Rank refresh is in progress, owned by Product, due November 1.
- The Ikon feed is blocked on Ikon’s legal review.
- Thanksgiving bookings are why the date is November 1.
- No email is drafted. Gmail is not connected.

Extra claims. Marking the refresh done, moving the date, or calling the Ikon block an internal engineering delay each score 0. A deck figure or a call figure scores 0. The October 22 and October 24 assignments may be mentioned as separate open work. They are not a substitute for the November 1 item.

Volume. Deposits, competitor revenue, and a full ledger recap are off this answer.

### Task Management, before November 6

Prompt: “What is still open before the November 6 meeting?”

Depends on: `Supply review — 8 Oct 2026`.

May appear: `Investor prep — 28 Sep 2026`, `GL export — Oct 2025 through Sep 2026`, `Roadmap, working copy — 13 Oct 2026`, and the rank-refresh task. The ledger may appear as the file Finance said to use. It is not a request to present a full close.

Off this question: the user export, both scans, `Guest recovery — 3 Sep 2026`, `Group sales queue — 2 Oct 2026`, both investor calls.

Required claims:

- Finance, due October 22, still has to get the July board pdf out of the data room. The notes say use the ledger.
- Head of Supply, due October 24, still owes the Ikon note, including the legal block.

Extra claims. Telling anyone to present $120M, 55,000 subscribers, or $18M cash scores 0. Those figures may appear only in a sentence that names the September deck and says they are not the close. A partner or fund name scores 0. Rank refresh, Product, November 1, may appear as other open work and scores 1 when it matches the task.

Volume. The school block and competitor writeups are off this answer. A full four-quarter recital, beyond pointing at the ledger as the file to use, fails the volume point.

### General

Prompt: “What’s the deposit situation on the February school block, and is that the normal rule?”

Depends on: `Group sales queue — 2 Oct 2026`, `Guest recovery — 3 Sep 2026`.

May appear: none.

Off this question: the general ledger, both decks, both scans, the user export, the roadmap, both investor calls, `Supply review — 8 Oct 2026`, `Rank standup — 16 Oct 2026`, `Investor prep — 28 Sep 2026`.

Required claims:

- Blackcomb School District, 40 rooms, $189 a night, February 12–15. The deposit is nonrefundable on December 1. That is the school contract in the forwarded group-sales email.
- For other bookers, 14 days out they can move the trip. Inside 14 days the deposit is a credit, not cash. That is the September 3 note.
- The Minneapolis club is on the normal rule. The school contract is not.

Extra claims. Applying the school deposit to every booker scores 0. Applying the 14-day credit to the school after December 1 scores 0. A price, a take rate, or a subscriber count scores 0.

Volume. Investor figures, the rank refresh, and competitor revenue are off this answer.
