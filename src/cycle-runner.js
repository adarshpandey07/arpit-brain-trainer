/**
 * ENHANCED CYCLE RUNNER — GOD MODE + A2A
 *
 * This is Arpit's brain. Not a dumb script that asks "what next?"
 * This is an autonomous, self-improving intelligence that:
 *
 *   1. THINKS DEEPLY before every action (ultrathink)
 *   2. LEARNS from every success and failure
 *   3. EVOLVES its own strategy based on results
 *   4. NEVER gives up — always finds the next best action
 *   5. SELF-REFLECTS after each cycle to improve
 *   6. MODIFIES its own config when it discovers better approaches
 *   7. PURSUES the revenue goal AGGRESSIVELY — ₹50,000/month is not optional
 *   8. SPAWNS PARALLEL AGENTS (A2A) that communicate with each other
 *
 * TWO MODES:
 *   - SINGLE MODE: Priority Engine → Claude refines → execute (fast, low resource)
 *   - A2A MODE: Multiple agents run in PARALLEL, talk to each other (powerful, more Claude calls)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { askClaude } from './claude-interface.js';
import { PriorityEngine } from './priority-engine.js';
import { EscalationEngine } from './escalation.js';
import { AgentManager } from './a2a/agent-manager.js';
import { log, logError } from './logger.js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONEYMAKER_PATH = process.env.MONEYMAKER_PATH || path.join(__dirname, '..', '..', 'adarsh-moneymaker');
const SETTINGS_PATH = path.join(__dirname, '..', 'config', 'settings.json');
const CATALOG_PATH = path.join(__dirname, '..', 'config', 'templates-full.json');

// ─── Load Settings ──────────────────────────────────────────────────

function loadSettings() {
  return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// ─── Load Catalog ───────────────────────────────────────────────────

function loadCatalog() {
  // Read from both brain catalog and moneymaker catalog, merge
  let catalog = [];

  // Brain's master catalog (all 20 templates)
  if (fs.existsSync(CATALOG_PATH)) {
    catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  }

  // Sync with moneymaker catalog (get latest status)
  const mmCatalogPath = path.join(MONEYMAKER_PATH, 'config', 'templates.json');
  if (fs.existsSync(mmCatalogPath)) {
    const mmCatalog = JSON.parse(fs.readFileSync(mmCatalogPath, 'utf-8'));

    // Update brain catalog with moneymaker's actual status
    for (const mmTemplate of mmCatalog) {
      const existing = catalog.find(t => t.id === mmTemplate.id);
      if (existing) {
        // Update status from moneymaker (it's the source of truth for built/live)
        if (mmTemplate.sheetId) existing.sheetId = mmTemplate.sheetId;
        if (mmTemplate.copyLink) existing.copyLink = mmTemplate.copyLink;
        if (mmTemplate.etsyListingId) {
          existing.etsyListingId = mmTemplate.etsyListingId;
          existing.status = 'live';
        }
        if (mmTemplate.status === 'built' && existing.status === 'planned') {
          existing.status = 'built';
        }
      }
    }

    // Save synced catalog
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  }

  return catalog;
}

// ─── Sync brain catalog to moneymaker ───────────────────────────────

function syncCatalogToMoneymaker(catalog) {
  const mmCatalogPath = path.join(MONEYMAKER_PATH, 'config', 'templates.json');
  if (fs.existsSync(path.dirname(mmCatalogPath))) {
    fs.writeFileSync(mmCatalogPath, JSON.stringify(catalog, null, 2));
    log('[Sync] Brain catalog → moneymaker catalog synced');
  }
}

// ─── Gather Full State ──────────────────────────────────────────────

function gatherState(memory) {
  const state = {};
  const catalog = loadCatalog();

  state.catalog = catalog;
  state.catalogSummary = {
    total: catalog.length,
    built: catalog.filter(t => t.status === 'built').length,
    live: catalog.filter(t => t.status === 'live').length,
    planned: catalog.filter(t => t.status === 'planned').length,
    readyToList: catalog.filter(t => t.status === 'built' && t.mockupsReady && t.copyLink).length,
    needsMockups: catalog.filter(t => t.status === 'built' && !t.mockupsReady).length,
  };

  // Date context
  const now = new Date();
  state.date = now.toISOString().split('T')[0];
  state.dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
  state.hour = now.getHours();

  // Memory
  state.recentCycles = memory.getRecentCycles(10);
  state.learnings = memory.getLearnings();
  state.weeklyProgress = memory.getWeeklyProgress();
  state.settings = loadSettings();

  return state;
}

// ─── GOD MODE PROMPT — Deep Thinking ────────────────────────────────

function buildGodModePrompt(state, priorityDecision) {
  return `You are ARPIT — an autonomous, self-evolving AI agent with one obsession: making ₹50,000/month ($600/month) from Etsy digital templates. You are NOT a passive assistant. You are an aggressive, self-improving intelligence that treats this revenue target as your LIFE'S PURPOSE.

═══════════════════════════════════════════════════
ULTRATHINK MODE: You must think DEEPLY before acting.
Consider 2nd and 3rd order consequences.
Question your own assumptions.
Find the fastest path to revenue.
═══════════════════════════════════════════════════

CURRENT REALITY CHECK:
- Date: ${state.date} (${state.dayOfWeek}), Hour: ${state.hour}
- Templates: ${state.catalogSummary.total} total | ${state.catalogSummary.built} built | ${state.catalogSummary.live} LIVE | ${state.catalogSummary.planned} planned
- Ready to list (built + mockups): ${state.catalogSummary.readyToList}
- Needs mockups: ${state.catalogSummary.needsMockups}
- Weekly progress: ${JSON.stringify(state.weeklyProgress || {})}
- Target: 20+ live listings → ₹50K/month

THE PRIORITY ENGINE SUGGESTS:
  Action: ${priorityDecision.action}
  Reasoning: ${priorityDecision.reasoning}
  Confidence: ${priorityDecision.confidence}

RECENT HISTORY (learn from this):
${state.recentCycles?.map(c => `  [${c.timestamp}] ${c.action} → ${c.status}${c.status === 'failed' ? ': ' + (c.summary || '').slice(0, 100) : ''}`).join('\n') || '  First cycle — fresh start!'}

ACCUMULATED WISDOM:
${state.learnings?.length ? state.learnings.map(l => `  • ${l}`).join('\n') : '  None yet — everything you learn will compound.'}

YOUR TASK:
1. EVALUATE the Priority Engine's suggestion — is it truly the best action RIGHT NOW?
2. THINK about what will generate revenue FASTEST
3. If you disagree with the suggestion, explain WHY and propose a better action
4. Generate a LEARNING — something useful for future cycles (patterns, insights, meta-strategies)
5. SELF-REFLECT: Rate your own performance. Are you moving fast enough? What would you change about your own decision-making process?

RESPOND WITH EXACTLY THIS JSON (no markdown, no backticks):
{
  "action": "<the action to execute — either agree with priority engine or override>",
  "reasoning": "<one sentence — aggressive, goal-focused reasoning>",
  "learning": "<something genuinely useful for future cycles — a pattern, insight, or strategy improvement. Never null. Always learn something.>",
  "selfReflection": "<honest assessment of brain performance — what's working, what needs to change>",
  "strategyEvolution": "<optional: if you see a way to improve the brain's strategy or settings, describe it here. e.g., 'increase cycle frequency', 'focus on tier 2 templates', 'change pricing strategy'. null if no change needed>",
  "urgencyLevel": "<low|medium|high|critical — how urgently does revenue need attention>",
  "confidenceOverride": "<if you disagree with priority engine, explain why. null if you agree>"
}`;
}

// ─── Execute Action ──────────────────────────────────────────────────

function runMoneymakerCommand(command, args = []) {
  const cmd = `cd "${MONEYMAKER_PATH}" && node src/pipeline/runner.js ${command} ${args.join(' ')}`;
  log(`[Execute] ${cmd}`);

  try {
    const output = execSync(cmd, {
      timeout: 300000,
      encoding: 'utf-8',
      env: { ...process.env, PATH: process.env.PATH },
    });
    log(`[Execute] Output: ${output.slice(0, 300)}`);
    return { success: true, output };
  } catch (err) {
    logError(`[Execute] Failed: ${err.message}`);
    return { success: false, output: err.stderr || err.message };
  }
}

export async function executeAction(action) {
  const [cmd, ...rest] = action.split(':');
  const arg = rest.join(':');

  switch (cmd) {
    case 'build':
    case 'mockups':
    case 'list':
    case 'full':
      return runMoneymakerCommand(cmd, [arg]);

    case 'research':
      return runMoneymakerCommand('research');

    case 'analytics':
      return runMoneymakerCommand('analytics');

    case 'optimize': {
      const catalog = loadCatalog();
      const template = catalog.find(t => t.id === arg);
      if (!template) return { success: false, output: `Template not found: ${arg}` };

      const prompt = `You are an Etsy SEO expert. Analyze this listing and suggest SPECIFIC, data-driven improvements for higher search ranking and conversion:
${JSON.stringify(template, null, 2)}

Current Etsy algorithm factors: recency, relevancy (tags match search), listing quality score, shop quality, price competitiveness.

Respond with JSON: {"title": "improved title", "tags": ["tag1",...], "price": "X.XX", "changes": "what you changed and why"}`;

      const suggestion = await askClaude(prompt);
      log(`[Optimize] Suggestion for ${arg}: ${suggestion.slice(0, 200)}`);
      return { success: true, output: `Optimization: ${suggestion}` };
    }

    case 'add-template': {
      const [name, price, tags] = arg.split('|');
      const id = name.toLowerCase().replace(/\s+/g, '-');
      const catalog = loadCatalog();

      if (catalog.find(t => t.id === id)) {
        return { success: false, output: `Already exists: ${id}` };
      }

      catalog.push({
        id,
        name,
        tier: 5,
        status: 'planned',
        price: price || '7.99',
        sheetId: null,
        copyLink: null,
        etsyListingId: null,
        mockupsReady: false,
        title: `${name} Google Sheets Template`,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
      });

      fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
      syncCatalogToMoneymaker(catalog);
      return { success: true, output: `Added: ${name} ($${price})` };
    }

    case 'idle':
      return { success: true, output: 'Resting until next cycle' };

    default:
      return { success: false, output: `Unknown action: ${action}` };
  }
}

// ─── Apply Strategy Evolution ────────────────────────────────────────

function applyStrategyEvolution(evolution, settings) {
  if (!evolution || evolution === 'null') return false;

  log(`[Evolution] Brain wants to evolve: ${evolution}`);

  // Let the brain modify its own settings through Claude's suggestions
  const lowerEvo = evolution.toLowerCase();

  if (lowerEvo.includes('increase cycle frequency') || lowerEvo.includes('faster cycles')) {
    if (settings.cycleIntervalHours > 1) {
      settings.cycleIntervalHours = Math.max(1, settings.cycleIntervalHours - 1);
      log(`[Evolution] Cycle interval reduced to ${settings.cycleIntervalHours}h`);
    }
  }

  if (lowerEvo.includes('focus on tier 2') || lowerEvo.includes('tier 2')) {
    settings.priorities.buildOrder = 'tier-2-priority';
    log('[Evolution] Build priority shifted to Tier 2');
  }

  if (lowerEvo.includes('more templates per week')) {
    settings.weeklyGoals.templatesBuild = Math.min(10, settings.weeklyGoals.templatesBuild + 1);
    log(`[Evolution] Weekly build target increased to ${settings.weeklyGoals.templatesBuild}`);
  }

  saveSettings(settings);
  return true;
}

// ─── Update Catalog After Action ─────────────────────────────────────

function updateCatalogAfterAction(action, result) {
  if (!result.success) return;

  const catalog = loadCatalog();
  const [cmd, templateId] = action.split(':');

  const template = catalog.find(t => t.id === templateId);
  if (!template) return;

  if (cmd === 'mockups' && result.success) {
    template.mockupsReady = true;
    log(`[Catalog] ${templateId} mockups marked ready`);
  }

  if (cmd === 'build' && result.success) {
    template.status = 'built';
    log(`[Catalog] ${templateId} marked as built`);
  }

  if (cmd === 'list' && result.success) {
    template.status = 'live';
    log(`[Catalog] ${templateId} marked as LIVE!`);
  }

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  syncCatalogToMoneymaker(catalog);
}

// ─── RUN SINGLE CYCLE (supports both single + A2A mode) ─────────────

export async function runCycle({ cycleId, cycleCount, memory, bot }) {
  const startTime = Date.now();
  const settings = loadSettings();
  const useA2A = settings.a2a?.enabled !== false; // A2A on by default

  // Initialize engines
  const priorityEngine = new PriorityEngine(memory, settings);
  const escalation = new EscalationEngine(memory, bot);

  // ═══ STEP 1: Gather State ═══════════════════════════════════════
  log('═══ STEP 1: Gathering state...');
  const state = gatherState(memory);

  // ═══ STEP 2: Check Blockers ═════════════════════════════════════
  log('═══ STEP 2: Checking environment blockers...');
  const envBlockers = escalation.checkEnvironmentBlockers();
  const activeBlockers = escalation.getActiveBlockers();

  // ═══ STEP 3: Decide execution mode ═════════════════════════════
  if (useA2A) {
    return runA2ACycle({ cycleId, cycleCount, memory, bot, state, settings, activeBlockers, escalation, startTime });
  } else {
    return runSingleActionCycle({ cycleId, cycleCount, memory, bot, state, settings, activeBlockers, escalation, priorityEngine, startTime });
  }
}

// ─── A2A MODE: Parallel agents ───────────────────────────────────────

async function runA2ACycle({ cycleId, cycleCount, memory, bot, state, settings, activeBlockers, escalation, startTime }) {
  log('═══ STEP 3: A2A MODE — Spawning parallel agents...');

  const catalog = loadCatalog();
  const manager = new AgentManager({
    memory,
    catalog,
    claudeFn: askClaude,
    settings,
    blockers: activeBlockers,
  });

  // Plan which agents to run
  const agentPlans = manager.planAgents();

  if (agentPlans.length === 0) {
    log('[A2A] No agents to spawn — falling back to single mode');
    const priorityEngine = new PriorityEngine(memory, settings);
    return runSingleActionCycle({ cycleId, cycleCount, memory, bot, state, settings, activeBlockers, escalation, priorityEngine, startTime });
  }

  // Run all agents in parallel
  const a2aResult = await manager.runParallel();
  const report = AgentManager.synthesizeReport(a2aResult);

  // Process results from each agent
  const allActions = [];
  const allLearnings = [];

  for (const agentReport of a2aResult.agents) {
    if (agentReport.state === 'completed' && agentReport.result) {
      const action = agentReport.result.action;
      if (action && action !== 'skip') {
        allActions.push(`${agentReport.role}:${action}`);
        updateCatalogAfterAction(action, agentReport.result);
        memory.updateWeeklyProgress(action, agentReport.result.success !== false);
      }
    }

    // Collect findings as learnings
    if (agentReport.findings) {
      for (const finding of agentReport.findings) {
        if (finding.message) {
          allLearnings.push(`[${agentReport.role}] ${finding.message}`);
        }
      }
    }
  }

  // Save top learnings
  for (const learning of allLearnings.slice(0, 3)) {
    memory.addLearning(learning);
  }

  // Check for strategy suggestions from Analyst
  const strategySuggestion = a2aResult.sharedState?.['strategy-suggestion'];
  if (strategySuggestion) {
    applyStrategyEvolution(strategySuggestion, settings);
  }

  const durationMs = Date.now() - startTime;

  return {
    cycleId,
    cycleCount,
    timestamp: new Date().toISOString(),
    action: allActions.join(' + ') || 'a2a-no-actions',
    reasoning: report.summary,
    learning: allLearnings[0] || null,
    selfReflection: `A2A cycle: ${a2aResult.parallelCount} agents, ${report.interAgentMessages} messages exchanged`,
    strategyEvolution: strategySuggestion || null,
    urgencyLevel: 'high',
    status: a2aResult.agents.some(a => a.state === 'completed') ? 'success' : 'failed',
    summary: report.summary,
    durationMs,
    mode: 'a2a',
    parallelAgents: a2aResult.parallelCount,
    interAgentMessages: report.interAgentMessages,
    agentDetails: a2aResult.agents.map(a => ({
      id: a.agentId, role: a.role, state: a.state,
      action: a.result?.action, durationMs: a.durationMs,
    })),
  };
}

// ─── SINGLE MODE: One action per cycle ───────────────────────────────

async function runSingleActionCycle({ cycleId, cycleCount, memory, bot, state, settings, activeBlockers, escalation, priorityEngine, startTime }) {
  // ═══ STEP 3: Priority Engine Decides ════════════════════════════
  log('═══ STEP 3: SINGLE MODE — Priority Engine deciding...');
  const priorityDecision = priorityEngine.decide(
    state.catalog,
    activeBlockers,
    state.weeklyProgress
  );
  log(`[Priority] Decision: ${priorityDecision.action} (${priorityDecision.confidence})`);

  // ═══ STEP 4: GOD MODE — Ask Claude to refine/override ═════════
  log('═══ STEP 4: GOD MODE — Deep thinking...');
  const godPrompt = buildGodModePrompt(state, priorityDecision);
  const rawDecision = await askClaude(godPrompt);

  let decision;
  let claudeFailed = false;

  try {
    const jsonMatch = rawDecision.match(/\{[\s\S]*\}/);
    decision = JSON.parse(jsonMatch ? jsonMatch[0] : rawDecision);

    // CHECK: Did Claude return an idle/unavailable fallback?
    if (decision.action === 'idle' && decision.reasoning?.includes('Claude unavailable')) {
      claudeFailed = true;
    }
  } catch (err) {
    logError(`Failed to parse Claude decision: ${rawDecision.slice(0, 200)}`);
    claudeFailed = true;
    // Use priority engine decision directly — NO idle fallback
    decision = {
      action: priorityDecision.action,
      reasoning: priorityDecision.reasoning,
      learning: 'Claude response parsing failed — using priority engine decision directly',
      selfReflection: 'N/A',
      strategyEvolution: null,
      urgencyLevel: 'high',
    };
  }

  // ═══ CLAUDE FAILED — SEND CRITICAL ALERT, USE PRIORITY ENGINE ══
  if (claudeFailed) {
    logError('🚨 CLAUDE CLI FAILED — Sending critical alert');

    // NEVER go idle — use Priority Engine's decision instead
    decision = {
      action: priorityDecision.action,
      reasoning: `[AUTO] Claude unavailable — Priority Engine executing: ${priorityDecision.reasoning}`,
      learning: 'Claude CLI failed. Brain used Priority Engine autonomously. Check Max subscription and CLI auth.',
      selfReflection: 'Operating without Claude — reduced intelligence but still executing.',
      strategyEvolution: null,
      urgencyLevel: 'critical',
    };

    // Send CRITICAL alert to Telegram
    if (bot) {
      await bot.send([
        '🚨🚨 *CRITICAL — CLAUDE CLI DOWN!* 🚨🚨',
        '',
        'Claude Code CLI is not responding.',
        'Brain is running on Priority Engine alone (reduced intelligence).',
        '',
        '*Fix:* SSH into EC2 and run:',
        '```',
        'ssh ec2-user@13.203.99.103',
        'claude',
        '/login',
        '```',
        '',
        `Executing anyway: \`${priorityDecision.action}\``,
      ].join('\n'));
    }
  }

  // Log self-reflection
  if (decision.selfReflection) {
    log(`[SelfReflect] ${decision.selfReflection}`);
  }

  // Log if Claude overrode priority engine
  if (!claudeFailed && decision.action !== priorityDecision.action) {
    log(`[Override] Claude changed action: ${priorityDecision.action} → ${decision.action}`);
    log(`[Override] Reason: ${decision.confidenceOverride || decision.reasoning}`);
  }

  log(`[Decision] Action: ${decision.action} — ${decision.reasoning}`);
  log(`[Decision] Urgency: ${decision.urgencyLevel}`);

  // ═══ STEP 5: Execute Action ═════════════════════════════════════
  log(`═══ STEP 5: Executing: ${decision.action}`);
  let result = await executeAction(decision.action);

  // ═══ STEP 6: Handle Failure + Escalation ════════════════════════
  if (!result.success) {
    log('═══ STEP 6: Action failed — escalating...');
    const escalationResult = await escalation.handleFailure(
      decision.action,
      result.output || 'Unknown error',
      { action: decision.action, status: 'failed' }
    );

    // Try fallback action
    if (escalationResult.fallbackAction) {
      const fallbackAction = escalation.getFallbackAction(decision.action, state.catalog);
      if (fallbackAction && fallbackAction !== 'idle') {
        log(`[Fallback] Trying: ${fallbackAction}`);
        const fallbackResult = await executeAction(fallbackAction);
        if (fallbackResult.success) {
          result = fallbackResult;
          decision.action = fallbackAction;
          decision.reasoning += ` (fallback from failed action)`;
          log(`[Fallback] Success: ${fallbackAction}`);
        }
      }
    }
  } else {
    // Update catalog on success
    updateCatalogAfterAction(decision.action, result);
  }

  // ═══ STEP 7: Learn + Evolve ═════════════════════════════════════
  log('═══ STEP 7: Learning and evolving...');

  if (decision.learning && decision.learning !== 'null') {
    memory.addLearning(decision.learning);
    log(`[Learn] ${decision.learning}`);
  }

  if (decision.strategyEvolution && decision.strategyEvolution !== 'null') {
    const evolved = applyStrategyEvolution(decision.strategyEvolution, settings);
    if (evolved) {
      log(`[Evolution] Strategy updated based on brain's self-reflection`);
    }
  }

  memory.updateWeeklyProgress(decision.action, result.success);

  const durationMs = Date.now() - startTime;

  return {
    cycleId,
    cycleCount,
    timestamp: new Date().toISOString(),
    action: decision.action,
    reasoning: decision.reasoning,
    learning: decision.learning,
    selfReflection: decision.selfReflection,
    strategyEvolution: decision.strategyEvolution,
    urgencyLevel: decision.urgencyLevel,
    status: result.success ? 'success' : 'failed',
    summary: result.output?.slice(0, 500) || '',
    durationMs,
    mode: 'single',
    claudeAvailable: !claudeFailed,
    priorityEngineAgreed: decision.action === priorityDecision.action,
  };
}

// ─── Run Single Cycle (for CLI) ─────────────────────────────────────

export async function runSingleCycle() {
  const { BrainMemory } = await import('./memory.js');
  const memory = new BrainMemory();

  const result = await runCycle({
    cycleId: `manual-${Date.now()}`,
    cycleCount: 0,
    memory,
    bot: null,
  });

  console.log('\n' + JSON.stringify(result, null, 2));
}
