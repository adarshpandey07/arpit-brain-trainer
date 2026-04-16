# Arpit Brain Trainer — Docs

This repo is **documentation only**. It tracks how Arpit Brain (v2 of the Moneymaker autonomous agent) is being trained, what design decisions were made, and what has been learned.

The actual brain **code** lives at:
👉 [`adarshpandey07/adarsh-pandey-money-maker-brain` → `arpit/`](https://github.com/adarshpandey07/adarsh-pandey-money-maker-brain/tree/main/arpit)

The runtime **state** (cycle history, learnings, weekly goals) is also persisted there under `arpit/memory/` and auto-committed by the running brain.

## Why this split?

The original brain (`adarsh-pandey-money-maker-brain`) is the canonical home for autonomous-agent code. Arpit Brain is a v2 variant of it, so its code belongs in the same repo as a sibling sub-project rather than as a separate codebase that drifts.

This trainer repo exists to capture the **why** and **what we learned** — things that don't belong inline in the source tree.

## What's in v2 (Arpit Brain)

Enhancements over the original moneymaker brain:

| Module | What it does |
|---|---|
| `priority-engine.js` | Smart action selection — scores candidate actions based on pipeline state and returns the highest-priority one |
| `escalation.js` | Failure handler — retries, tracks blockers, switches to fallback actions, sends owner alerts on persistent failures |
| `weekly-tracker.js` | Tracks build/list/revenue targets per week; powers `/weekly-report` Telegram command |
| `template-loader.js` | Auto-loads all 20 planned templates into the moneymaker catalog on startup |
| `a2a/` | Agent-to-Agent parallel execution — multiple sub-agents collaborate on a single cycle via a message bus |
| 3-hour cycle interval | Down from 5min/6h — aggressive growth-phase cadence with deeper per-cycle thinking |

## Deployment

Both services run on the same EC2 host (`13.203.99.103`):
- `moneymaker-brain.service` → `~/adarsh-pandey-money-maker-brain/src/brain.js` (port 3001)
- `arpit-brain.service` → `~/adarsh-pandey-money-maker-brain/arpit/src/brain.js` (port 3000)

Each has its own `.env` (separate Telegram bot tokens, separate memory dirs) so they coexist without stepping on each other.

## Training journal

Use this repo to document:
- Design decisions and the reasoning behind them
- Experiments tried (what worked, what didn't)
- Failure modes observed in production and how they were handled
- Prompt-engineering iterations for Claude
- Future ideas worth trying

Add entries as dated markdown files (e.g. `journal/2026-04-17-priority-engine-tuning.md`).
