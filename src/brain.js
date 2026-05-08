#!/usr/bin/env node

/**
 * ARPIT BRAIN TRAINER v2.0 — GOD MODE
 *
 * The autonomous, self-evolving AI agent that runs 24/7 on AWS EC2.
 * This is NOT a cron script. This is an INTELLIGENCE.
 *
 * What makes this different from v1:
 *   - Priority Engine decides actions (not random Claude prompts)
 *   - Escalation system handles failures intelligently
 *   - Self-reflection after every cycle
 *   - Strategy evolution — brain modifies its own config
 *   - Weekly goal tracking with progress bars
 *   - Dead-brain watchdog with RED ALERT on Telegram
 *   - 3-hour cycles for aggressive growth
 *   - All 20 templates loaded from day 1
 *
 * Revenue target: ₹50,000/month. This is not optional.
 */

import 'dotenv/config';
import cron from 'node-cron';
import { runCycle, executeAction } from './cycle-runner.js';
import { TelegramBot } from './telegram-bot.js';
import { BrainMemory } from './memory.js';
import { WeeklyTracker } from './weekly-tracker.js';
import { EscalationEngine } from './escalation.js';
import { log, logError } from './logger.js';
import { pushBrainRepo } from './git-sync.js';
import { startApiServer } from './api-server.js';
import { syncTemplates } from './template-loader.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CYCLE_INTERVAL = parseInt(process.env.CYCLE_INTERVAL_HOURS || '3', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL_HOURS || '6', 10);

let isRunning = false;
let isPaused = false;
let cycleCount = 0;
let lastCycleResult = null;
let lastCycleTime = null;

// ─── Initialize ──────────────────────────────────────────────────────

const memory = new BrainMemory();
const bot = new TelegramBot();
const weeklyTracker = new WeeklyTracker();

// ─── Task Queue ─────────────────────────────────────────────────────

const taskQueue = [];
let taskIdCounter = 0;

// ─── Register Telegram Commands ──────────────────────────────────────

bot.onCommand('status', async () => {
  const state = memory.getState();
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const pendingTasks = taskQueue.filter(t => t.status === 'pending');

  return [
    `🧠 *ARPIT BRAIN v2.0 — GOD MODE*`,
    '',
    `State: ${isPaused ? '⏸ PAUSED' : '🟢 RUNNING'}`,
    `Uptime: ${hours}h ${mins}m`,
    `Cycles completed: ${state.totalCycles}`,
    `Success rate: ${state.totalCycles > 0 ? Math.round((state.totalSuccesses / state.totalCycles) * 100) : 0}%`,
    `Last cycle: ${lastCycleResult?.timestamp || 'none'}`,
    `Last action: ${lastCycleResult?.action || 'none'}`,
    `Urgency: ${lastCycleResult?.urgencyLevel || 'unknown'}`,
    '',
    `📦 *Catalog:*`,
    `  Built: ${state.catalog?.built || 0}`,
    `  LIVE: ${state.catalog?.live || 0}`,
    `  Planned: ${state.catalog?.planned || 0}`,
    '',
    `📋 Tasks: ${pendingTasks.length} pending`,
    `Next cycle: ~${CYCLE_INTERVAL}h`,
    `Version: ${state.brainVersion || '2.0.0'}`,
  ].join('\n');
});

bot.onCommand('pause', async () => {
  isPaused = true;
  log('Brain PAUSED via Telegram');
  return '⏸ Brain paused. Send /resume to continue.';
});

bot.onCommand('resume', async () => {
  isPaused = false;
  log('Brain RESUMED via Telegram');
  return '▶️ Brain resumed. Next cycle on schedule.';
});

bot.onCommand('cycle', async () => {
  if (isRunning) return '⚠️ Cycle already running.';
  log('Manual cycle triggered via Telegram');
  executeCycleWrapper();
  return '🔄 Manual cycle triggered!';
});

bot.onCommand('report', async () => memory.getDailyReport());

bot.onCommand('weekly', async () => weeklyTracker.getWeeklyReport());

bot.onCommand('history', async () => {
  const recent = memory.getRecentCycles(5);
  if (recent.length === 0) return 'No cycle history yet.';
  const lines = recent.map((c, i) =>
    `${i + 1}. [${c.timestamp?.slice(11, 19)}] ${c.action} — ${c.status} ${c.urgencyLevel ? `(${c.urgencyLevel})` : ''}`
  );
  return `📜 *Recent Cycles:*\n\n${lines.join('\n')}`;
});

bot.onCommand('blockers', async () => {
  const escalation = new EscalationEngine(memory, bot);
  const blockers = escalation.getActiveBlockers();
  if (blockers.length === 0) return '✅ No active blockers!';
  return `🚧 *Active Blockers:*\n\n${blockers.map(b => `  🔴 ${b}`).join('\n')}`;
});

bot.onCommand('learnings', async () => {
  const learnings = memory.getLearnings().slice(-10);
  if (learnings.length === 0) return 'No learnings yet.';
  return `🧠 *Recent Learnings:*\n\n${learnings.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
});

bot.onCommand('trend', async () => {
  const trend = weeklyTracker.getTrend();
  if (trend.length === 0) return 'No trend data yet.';
  const lines = trend.map(w =>
    `${w.week}: ${w.builds} built, ${w.listed} listed, ${w.successRate}% success, ${w.evolutions} evolutions`
  );
  return `📈 *Performance Trend:*\n\n${lines.join('\n')}`;
});

// ─── V2 OBSERVER COMMANDS ────────────────────────────────────────────
// Worker actions (build/list/publish) belong to V1. V2 observes + suggests.

bot.onCommand('insights', async () => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const v1Path = process.env.V1_BRAIN_PATH || '/home/ec2-user/adarsh-pandey-money-maker-brain';
    const data = JSON.parse(fs.readFileSync(path.join(v1Path, 'memory/trainer-suggestions.json'), 'utf-8'));
    const lines = [`🧠 *Latest trainer suggestions* (v${data.version}, ${new Date(data.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })})`, ''];
    for (const s of data.suggestions || []) {
      const emoji = s.priority === 'high' ? '🔴' : s.priority === 'medium' ? '🟡' : '🟢';
      lines.push(`${emoji} ${s.text}`);
      if (s.actionableFor) lines.push(`   → ${s.actionableFor}`);
    }
    if (!data.suggestions?.length) lines.push('_No suggestions in latest cycle._');
    return lines.join('\n');
  } catch (err) {
    return `❌ Could not read suggestions: ${err.message}`;
  }
});

bot.onCommand('digest', async () => {
  if (isRunning) return '⚠️ Cycle running. Wait until current cycle completes.';
  return '📨 Triggering observation cycle now (will Telegram digest you when done)...';
});

// ─── Task Management ─────────────────────────────────────────────────

bot.onCommand('task', async (msg, args) => {
  if (!args) return '❌ Usage: /task <description>';
  const task = { id: ++taskIdCounter, description: args, action: null, assignedAt: new Date().toISOString(), status: 'pending' };
  taskQueue.push(task);
  memory.addTask(task);
  return `📋 Task #${task.id} queued: "${args}"`;
});

bot.onCommand('tasks', async () => {
  const pending = taskQueue.filter(t => t.status === 'pending');
  const completed = taskQueue.filter(t => t.status === 'completed').slice(-5);
  if (pending.length === 0 && completed.length === 0) return '📋 No tasks.';
  const lines = [];
  if (pending.length > 0) {
    lines.push('*Pending:*');
    pending.forEach(t => lines.push(`  ⏳ #${t.id}: ${t.description}`));
  }
  if (completed.length > 0) {
    lines.push('', '*Done:*');
    completed.forEach(t => lines.push(`  ✅ #${t.id}: ${t.description}`));
  }
  return `📋 *Tasks*\n\n${lines.join('\n')}`;
});

bot.onCommand('cancel', async (msg, args) => {
  const id = parseInt(args);
  if (!id) return '❌ Usage: /cancel <task-id>';
  const task = taskQueue.find(t => t.id === id && t.status === 'pending');
  if (!task) return `❌ Task #${id} not found.`;
  task.status = 'cancelled';
  return `🗑 Task #${id} cancelled.`;
});

// ─── Free-text Chat ──────────────────────────────────────────────────

bot.onFreeText(async (text) => {
  log(`Free-text: "${text}"`);
  const { askClaude } = await import('./claude-interface.js');
  const state = memory.getState();
  const pendingTasks = taskQueue.filter(t => t.status === 'pending');
  const recentCycles = memory.getRecentCycles(3);

  const prompt = `You are ARPIT — V2 OBSERVER brain for Adarsh's Etsy template business. You watch V1 work and write suggestions for V1. You DO NOT execute build/list/publish actions yourself anymore — those are V1's job.

Adarsh says: "${text}"

STATE:
- Catalog: ${state.catalog?.total || 0} templates (${state.catalog?.built || 0} built, ${state.catalog?.live || 0} live)
- Pending observations: ${pendingTasks.map(t => t.description).join(', ') || 'none'}
- Recent cycles: ${recentCycles.map(c => c.action).join(', ') || 'none'}

If Adarsh asks a worker action (build/list/publish/mockups), TELL him to use V1's bot (@Adarsh_money_maker_bot) — don't suggest a JSON task here.

If he wants insights/observations/strategy thoughts, respond as ARPIT — analytical, terse, with emojis. Reference latest trainer-suggestions when relevant.`;

  const response = await askClaude(prompt);
  return response;
});

// ─── Help ────────────────────────────────────────────────────────────

bot.onCommand('help', async () => {
  return [
    '🧠 *V2 ARPIT BRAIN — Trainer/Observer Mode*',
    '',
    'V2 watches V1 + Etsy stats, writes suggestions to V1.',
    'Worker actions (build/list/publish) → use V1 (@Adarsh_money_maker_bot /list etc).',
    '',
    '*V2 commands:*',
    '/status — V2 status',
    '/pause, /resume',
    '/cycle — Trigger observation cycle now',
    '/insights — Show latest trainer suggestions',
    '/digest — Force daily digest send',
    '',
    '*Reports:*',
    '/weekly, /trend, /learnings, /blockers',
    '/report, /history',
    '',
    '💬 Free-text chat also works.',
  ].join('\n');
});

// ─── Execute Action (Telegram triggered) ─────────────────────────────

async function queueAndExecuteAction(action, description) {
  isRunning = true;
  cycleCount++;
  const cycleId = `telegram-${Date.now()}`;
  log(`Telegram action: ${action}`);

  try {
    const result = await executeAction(action);
    const cycleResult = {
      cycleId, cycleCount,
      timestamp: new Date().toISOString(),
      action,
      reasoning: `Manual: ${description}`,
      status: result.success ? 'success' : 'failed',
      summary: result.output?.slice(0, 500) || '',
    };

    lastCycleResult = cycleResult;
    lastCycleTime = Date.now();
    memory.saveCycleResult(cycleResult);
    memory.updateWeeklyProgress(action, result.success);
    await pushBrainRepo(cycleId, action);

    const emoji = result.success ? '✅' : '❌';
    await bot.send(`${emoji} *${action}*\n\n${result.output?.slice(0, 300) || 'done'}`);

    const task = taskQueue.find(t => t.action === action && t.status === 'pending');
    if (task) task.status = 'completed';
  } catch (err) {
    logError(`Telegram action failed: ${err.message}`);
    await bot.send(`❌ Failed: ${action}\n${err.message}`);
  } finally {
    isRunning = false;
  }
}

// ─── Cycle Execution ─────────────────────────────────────────────────

async function executeCycleWrapper() {
  if (isRunning) { log('Cycle skipped — already running'); return; }
  if (isPaused) { log('Cycle skipped — paused'); return; }

  isRunning = true;
  cycleCount++;
  const cycleId = `cycle-${Date.now()}`;

  log(`\n${'═'.repeat(60)}`);
  log(`🧠 CYCLE #${cycleCount} — ${cycleId}`);
  log(`${'═'.repeat(60)}\n`);

  try {
    const result = await runCycle({ cycleId, cycleCount, memory, bot });
    lastCycleResult = result;
    lastCycleTime = Date.now();

    memory.saveCycleResult(result);

    // ─── V2 OBSERVER OUTPUT ───────────────────────────────────────────
    // Synthesize suggestions for V1 + structured strategy rule edits.
    let suggestionsPayload = null;
    let rulesPayload = null;
    try {
      const { writeSuggestions } = await import('./suggestion-writer.js');
      const { writeStrategyRules } = await import('./strategy-rule-writer.js');
      const a2aResult = result.a2aResult || { agents: [], cycleId };
      suggestionsPayload = writeSuggestions({ ...a2aResult, cycleId });
      rulesPayload = writeStrategyRules({ ...a2aResult, cycleId });
    } catch (err) {
      logError(`[V2 observer-output] failed: ${err.message}`);
    }

    // Daily digest at 8am IST (first cycle of the day)
    try {
      await maybeSendDailyDigest(suggestionsPayload, rulesPayload);
    } catch (err) {
      logError(`[V2 daily-digest] failed: ${err.message}`);
    }

    await pushBrainRepo(cycleId, result.action);

    // Build rich Telegram message
    const emoji = result.status === 'success' ? '✅' : '❌';
    const overrideNote = result.priorityEngineAgreed === false ? '\n🔀 _Claude overrode Priority Engine_' : '';
    const evolutionNote = result.strategyEvolution ? `\n🧬 _Evolution: ${result.strategyEvolution}_` : '';

    const msg = [
      `${emoji} *Cycle #${cycleCount}*`,
      '',
      `Action: ${result.action}`,
      `Status: ${result.status}`,
      `Urgency: ${result.urgencyLevel || 'medium'}`,
      `Duration: ${result.durationMs ? Math.round(result.durationMs / 1000) + 's' : '?'}`,
      overrideNote,
      evolutionNote,
      '',
      result.learning ? `💡 _${result.learning}_` : '',
    ].filter(Boolean).join('\n');

    await bot.send(msg);
    log(`Cycle #${cycleCount} done: ${result.action} — ${result.status}`);
  } catch (err) {
    logError(`Cycle #${cycleCount} FAILED: ${err.message}`);
    await bot.send(`❌ *Cycle #${cycleCount} CRASHED*\n\n${err.message}\n\nBrain continues.`);
    memory.saveCycleResult({
      cycleId, cycleCount, action: 'error', status: 'failed',
      summary: err.message, timestamp: new Date().toISOString(),
    });
  } finally {
    isRunning = false;
  }
}

// ─── DAILY DIGEST (V2 sends summary to Adarsh at 8am IST) ────────────

let lastDigestDate = null;

async function maybeSendDailyDigest(suggestionsPayload, rulesPayload) {
  const digestHour = parseInt(process.env.DIGEST_HOUR_IST || '8', 10);
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // UTC + 5:30
  const istHour = nowIST.getUTCHours();
  const istDate = nowIST.toISOString().slice(0, 10);

  // Send only first cycle on/after digestHour each IST day
  if (istHour < digestHour || lastDigestDate === istDate) return;
  lastDigestDate = istDate;

  const lines = [
    `🧠 *V2 Trainer — Daily Insights* (${nowIST.toUTCString().slice(0, 16)} IST)`,
    '',
  ];

  const sugs = suggestionsPayload?.suggestions || [];
  if (sugs.length) {
    lines.push('*Top suggestions for V1 today:*');
    sugs.slice(0, 3).forEach((s, i) => {
      const tag = s.priority === 'high' ? 'HIGH' : s.priority === 'medium' ? 'MED' : 'LOW';
      lines.push(`${i + 1}. [${tag}] ${s.text}`);
    });
  } else {
    lines.push('_No actionable suggestions this cycle._');
  }

  const deltas = rulesPayload?.lastDeltas || [];
  if (deltas.length) {
    lines.push('', '*Strategy rules updated:*');
    deltas.forEach(d => lines.push(`• ${d.rule}: ${JSON.stringify(d.old)} → ${JSON.stringify(d.new)} (${d.reason})`));
  }

  lines.push('', '_V1 will pick these up next cycle._');
  await bot.send(lines.join('\n'));
  log('[DailyDigest] sent for ' + istDate);
}

// ─── WATCHDOG — Dead Brain Detection ─────────────────────────────────

function startWatchdog() {
  // Check every 30 minutes if brain is alive
  const WATCHDOG_INTERVAL = 30 * 60 * 1000; // 30 min
  const MAX_SILENCE = CYCLE_INTERVAL * 60 * 60 * 1000 * 2; // 2x cycle interval = dead

  setInterval(async () => {
    const now = Date.now();
    const timeSinceLastCycle = lastCycleTime ? now - lastCycleTime : now - startupTime;

    if (timeSinceLastCycle > MAX_SILENCE && !isPaused) {
      log('🚨 WATCHDOG: Brain appears DEAD — no cycle completed in expected time!');

      await bot.send([
        '🚨🚨🚨 *RED ALERT — BRAIN DEAD DETECTED* 🚨🚨🚨',
        '',
        `No cycle completed in ${Math.round(timeSinceLastCycle / 3600000)}h!`,
        `Expected interval: ${CYCLE_INTERVAL}h`,
        `Last cycle: ${lastCycleResult?.timestamp || 'never'}`,
        `Last action: ${lastCycleResult?.action || 'none'}`,
        `Is running: ${isRunning}`,
        `Is paused: ${isPaused}`,
        '',
        '⚡ *Attempting auto-recovery...*',
      ].join('\n'));

      // Attempt recovery — force a cycle
      if (!isRunning) {
        log('🔄 WATCHDOG: Attempting recovery cycle...');
        isRunning = false; // Reset just in case
        executeCycleWrapper();
      } else {
        // isRunning stuck true = cycle hung
        await bot.send([
          '⚠️ *Cycle appears HUNG*',
          '',
          `isRunning has been true for ${Math.round(timeSinceLastCycle / 60000)}min.`,
          'Manual restart may be needed:',
          '`sudo systemctl restart arpit-brain`',
        ].join('\n'));
      }
    }
  }, WATCHDOG_INTERVAL);

  log('🐕 Watchdog started — checking every 30min');
}

// ─── Heartbeat ───────────────────────────────────────────────────────

let startupTime = Date.now();

async function sendHeartbeat() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const state = memory.getState();
  const progress = weeklyTracker.getProgress();

  const msg = [
    `💓 *Heartbeat*`,
    '',
    `${isPaused ? '⏸ PAUSED' : '🟢 ALIVE'}`,
    `Uptime: ${hours}h ${mins}m`,
    `Cycles: ${state.totalCycles} (${state.totalSuccesses} ok / ${state.totalFailures} fail)`,
    `Catalog: ${state.catalog?.live || 0} live / ${state.catalog?.built || 0} built / ${state.catalog?.planned || 0} planned`,
    `Weekly: ${progress.templatesBuild} built, ${progress.templatesListed} listed (${progress.successRate}% success)`,
    `Next cycle: ~${CYCLE_INTERVAL}h`,
  ].join('\n');

  await bot.send(msg);
}

// ─── MAIN ────────────────────────────────────────────────────────────

async function main() {
  startupTime = Date.now();

  log('🧠 ARPIT BRAIN TRAINER v2.0 — GOD MODE — Starting up...');
  log(`   Cycle interval: every ${CYCLE_INTERVAL}h`);
  log(`   Heartbeat: every ${HEARTBEAT_INTERVAL}h`);
  log(`   Strategy: AGGRESSIVE`);

  // Sync all 20 templates to moneymaker catalog
  try {
    syncTemplates();
    log('📦 All 20 templates synced to moneymaker catalog');
  } catch (err) {
    logError(`Template sync failed: ${err.message}`);
  }

  // Start API server (non-blocking — brain runs even if API fails)
  try {
    await startApiServer();
    log('🌐 API server started');
  } catch (err) {
    logError(`API server failed: ${err.message} — brain continues without API`);
  }

  // Start Telegram bot
  await bot.start();
  log('📱 Telegram bot started');

  // Start watchdog
  startWatchdog();

  // Startup message
  await bot.send([
    '🧠 *ARPIT BRAIN v2.0 — GOD MODE ONLINE!*',
    '',
    '🚀 Upgraded with:',
    '  • Priority Engine (smart action selection)',
    '  • Escalation System (auto-failure handling)',
    '  • Self-Evolution (brain modifies its own strategy)',
    '  • Weekly Goal Tracking',
    '  • Dead-Brain Watchdog (RED ALERT)',
    '  • 20 templates loaded',
    '',
    `Server: EC2 ap-south-1`,
    `Cycle: every ${CYCLE_INTERVAL}h`,
    `Target: ₹50,000/month`,
    '',
    `Send /help for commands.`,
  ].join('\n'));

  // Schedule cycles
  const cycleCron = `0 */${CYCLE_INTERVAL} * * *`;
  cron.schedule(cycleCron, () => executeCycleWrapper());
  log(`⏰ Cycle cron: ${cycleCron}`);

  // Schedule heartbeat
  const heartbeatCron = `30 */${HEARTBEAT_INTERVAL} * * *`;
  cron.schedule(heartbeatCron, () => sendHeartbeat());
  log(`💓 Heartbeat cron: ${heartbeatCron}`);

  // Weekly report every Sunday at 9 PM
  cron.schedule('0 21 * * 0', async () => {
    const report = weeklyTracker.getWeeklyReport();
    await bot.send(report);
    log('📊 Weekly report sent');
  });
  log('📊 Weekly report cron: Sunday 9 PM');

  // Run first cycle immediately
  log('🚀 Running initial cycle...');
  await executeCycleWrapper();

  log('\n🧠 Brain is ALIVE. Watching. Learning. Evolving.\n');
}

// ─── Graceful Shutdown ───────────────────────────────────────────────

process.on('SIGTERM', async () => {
  log('SIGTERM — shutting down');
  await bot.send('🔴 *Brain shutting down* (SIGTERM)\n\n⚠️ Watchdog cron should detect this and alert.');
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('SIGINT — shutting down');
  await bot.send('🔴 *Brain shutting down* (SIGINT)');
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  logError(`UNCAUGHT: ${err.message}\n${err.stack}`);
  try {
    await bot.send(`🚨 *UNCAUGHT EXCEPTION*\n\n${err.message}\n\nBrain attempting to continue...`);
  } catch {}
  // Don't exit — let the brain survive non-fatal errors
});

process.on('unhandledRejection', async (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logError(`UNHANDLED REJECTION: ${msg}`);
  try {
    await bot.send(`⚠️ *Unhandled Rejection*\n\n${msg}\n\nBrain continues.`);
  } catch {}
});

main().catch(async (err) => {
  logError(`STARTUP FAILED: ${err.message}`);
  console.error(err);
  process.exit(1);
});
