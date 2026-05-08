# Arpit Brain Trainer — V2 Observer/Trainer

V2 of the Moneymaker autonomous agent. **Observer-only** — V2 watches V1, writes structured suggestions for V1 to act on. V2 does NOT build, list, or publish anything itself.

## Architecture

```
┌─────────────────┐                          ┌──────────────────┐
│ V1 (Moneymaker) │  reads suggestions ───►  │ V2 (Arpit)       │
│ WORKER          │                          │ OBSERVER/TRAINER │
│ — builds        │                          │ — observes V1    │
│ — lists         │                          │ — reads sales    │
│ — publishes     │                          │ — writes hints   │
└─────────────────┘                          └──────────────────┘
        ▲                                             │
        │ /memory/trainer-suggestions.json (V2 writes,│
        │ /memory/strategy-rules.json     (V1 reads)  │
        └─────────────────────────────────────────────┘
```

## What V2 produces each cycle (every 3h)

**Spawned agents (read-only):**
- `SalesDataAgent` — fetches per-listing Etsy stats (views, favorites)
- `ResearcherAgent` — surfaces trending niches as new template candidates
- `OptimizerAgent` — suggests SEO improvements per live listing (no edits)
- `AnalystAgent` — observes V1 cycle history, identifies patterns + bottlenecks

**Output files (written to V1's memory dir):**
- `<V1_BRAIN_PATH>/memory/trainer-suggestions.json` — top-5 actionable suggestions, JSON. V1 appends these into Claude's prompt as "trainer's advice".
- `<V1_BRAIN_PATH>/memory/strategy-rules.json` — structured rule edits (preferred listing days, low-impression threshold, etc.). V1's priority-engine reads + applies.

**V2's own memory (this repo):**
- `memory/etsy-stats-history/<date>.json` — daily Etsy snapshots for trend detection
- `memory/suggestion-history/v<n>-<iso>.json` — append-only audit log of suggestions written

## Telegram

V2 sends a daily digest at 8am IST (configurable via `DIGEST_HOUR_IST`) summarizing top suggestions + strategy rule changes for the day.

Slash commands:
- `/status`, `/pause`, `/resume`, `/cycle`
- `/insights` — show latest suggestions
- `/digest` — force send today's digest
- `/weekly`, `/trend`, `/learnings`, `/blockers`, `/report`, `/history`

Worker actions (build/list/publish) → use V1's bot, NOT V2.

## Deployment

V2 runs on AWS EC2 as `arpit-trainer.service` (systemd). See `BLOCKERS.md` in V1 brain repo for the active EC2 path. Worker dir: `/home/ec2-user/arpit-brain-trainer/`.

## Cycle interval

Default 3h (`CYCLE_INTERVAL_MINUTES=180`). V1 runs at 3h too, so V1 always reads V2's most recent suggestions on its next decision.

## Why "trainer"?

V2's job is to TRAIN V1's behavior over time — by writing structured suggestions and rule deltas, not by modifying V1's code. V1 reads, considers, and adapts.
