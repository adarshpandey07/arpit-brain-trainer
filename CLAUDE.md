# Arpit Brain Trainer

Enhanced autonomous AI brain for the Adarsh Moneymaker Etsy template business.

## What This Is
An upgraded version of the moneymaker brain with:
- **Priority Engine**: Smart action selection based on pipeline state
- **Escalation System**: Handles failures intelligently, notifies owner, auto-switches to fallback actions
- **Weekly Goal Tracking**: Tracks build/list/revenue targets per week
- **Template Auto-Loader**: Loads all 20 planned templates from config
- **3-hour cycle interval** (down from 6h) for aggressive growth phase

## Architecture
```
brain.js          → Main orchestrator, cron scheduler, telegram bot
cycle-runner.js   → Enhanced cycle with priority engine + escalation
priority-engine.js → Decides best next action based on full state
escalation.js     → Handles failures, tracks blockers, sends alerts
weekly-tracker.js → Weekly goal tracking and reporting
template-loader.js → Auto-loads templates into moneymaker catalog
memory.js         → Persistent state (JSON files committed to git)
claude-interface.js → Talks to Claude Code CLI
telegram-bot.js   → Telegram command interface
api-server.js     → REST API for dashboard
git-sync.js       → Auto-commit cycle results
logger.js         → Logging utility
```

## Key Commands
```bash
npm start              # Start the brain
npm run cycle          # Trigger a single cycle
npm run status         # Show current state
npm run add-templates  # Add all 20 templates to catalog
npm run weekly-report  # Show weekly progress
```

## Deployment
- Runs on AWS EC2 (ap-south-1) as a systemd service
- Uses Claude Code CLI (Max auth) as the AI decision engine
- Telegram bot @Adarsh_money_maker_bot for control
