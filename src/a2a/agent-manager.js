/**
 * AGENT MANAGER — The orchestrator of parallel agents
 *
 * This is Arpit's prefrontal cortex. It:
 *   1. Analyzes what work is available
 *   2. Decides which agents to spawn IN PARALLEL
 *   3. Creates the message bus for inter-agent communication
 *   4. Spawns all agents simultaneously (Promise.allSettled)
 *   5. Collects results and synthesizes a unified report
 *   6. Feeds learnings back to brain memory
 *
 * KEY INSIGHT: Instead of doing ONE thing per cycle (old brain),
 * Arpit now does MULTIPLE things per cycle. A researcher can find
 * niches WHILE a builder builds a template WHILE an optimizer
 * improves existing listings. And they TALK to each other.
 */

import { MessageBus } from './message-bus.js';
import { BuilderAgent } from './agents/builder-agent.js';
import { ResearcherAgent } from './agents/researcher-agent.js';
import { ListerAgent } from './agents/lister-agent.js';
import { OptimizerAgent } from './agents/optimizer-agent.js';
import { AnalystAgent } from './agents/analyst-agent.js';
import { log, logError } from '../logger.js';

export class AgentManager {
  constructor({ memory, catalog, claudeFn, settings, blockers }) {
    this.memory = memory;
    this.catalog = catalog;
    this.askClaude = claudeFn;
    this.settings = settings;
    this.blockers = blockers || [];
    this.bus = null;
  }

  /**
   * Decide which agents to spawn based on current state.
   * Returns an array of agent configs to run in parallel.
   */
  planAgents() {
    const agents = [];
    const hasEtsyKey = !this.blockers.includes('etsy-api-missing');

    const built = this.catalog.filter(t => t.status === 'built');
    const planned = this.catalog.filter(t => t.status === 'planned');
    const live = this.catalog.filter(t => t.status === 'live');
    const readyToList = built.filter(t => t.mockupsReady && t.copyLink);
    const needsMockups = built.filter(t => !t.mockupsReady && t.copyLink);

    const weeklyProgress = this.memory.getWeeklyProgress();
    const weeklyBuildTarget = this.settings.weeklyGoals?.templatesBuild || 3;

    // ─── ALWAYS: Researcher (unless already researched this week) ────
    if ((weeklyProgress.researchSessions || 0) < 2) {
      agents.push({
        type: 'researcher',
        goal: 'Find trending niches and template ideas with high demand + low competition',
        priority: 2,
      });
    }

    // ─── Builder: If planned templates exist and weekly target not met ─
    if (planned.length > 0 && (weeklyProgress.templatesBuild || 0) < weeklyBuildTarget) {
      const nextToBuild = planned.sort((a, b) => (a.tier || 99) - (b.tier || 99))[0];
      agents.push({
        type: 'builder',
        goal: `Build template: ${nextToBuild.id} (${nextToBuild.name})`,
        templateId: nextToBuild.id,
        priority: 1,
      });
    }

    // ─── Lister: If templates are ready and Etsy key exists ──────────
    if (hasEtsyKey && readyToList.length > 0) {
      const nextToList = readyToList.sort((a, b) => (a.tier || 99) - (b.tier || 99))[0];
      agents.push({
        type: 'lister',
        goal: `List ${nextToList.id} on Etsy for revenue`,
        templateId: nextToList.id,
        priority: 0, // Highest priority — revenue!
      });
    }

    // ─── Optimizer: If live listings exist ────────────────────────────
    if (live.length > 0) {
      const toOptimize = live[Math.floor(Math.random() * live.length)];
      agents.push({
        type: 'optimizer',
        goal: `Optimize SEO for ${toOptimize.id} — improve tags, title, price`,
        templateId: toOptimize.id,
        priority: 3,
      });
    }

    // ─── Analyst: Always run to assess overall performance ───────────
    if (this.memory.getState().totalCycles > 3) {
      agents.push({
        type: 'analyst',
        goal: 'Analyze brain performance, identify bottlenecks, suggest strategy changes',
        priority: 4,
      });
    }

    // Sort by priority (lowest number = highest priority)
    agents.sort((a, b) => a.priority - b.priority);

    // Cap at 3 parallel agents to avoid overloading Claude
    const maxParallel = this.settings.a2a?.maxParallelAgents || 3;
    return agents.slice(0, maxParallel);
  }

  /**
   * Spawn agents and run them in parallel.
   * Returns aggregated results from all agents.
   */
  async runParallel() {
    const startTime = Date.now();

    // Create message bus for this cycle
    this.bus = new MessageBus();

    // Plan which agents to spawn
    const agentPlans = this.planAgents();

    if (agentPlans.length === 0) {
      log('[A2A:Manager] No agents to spawn — nothing to do');
      return { agents: [], totalDurationMs: 0, messageSummary: {} };
    }

    log(`[A2A:Manager] Spawning ${agentPlans.length} parallel agents:`);
    agentPlans.forEach((a, i) => log(`  ${i + 1}. ${a.type} — ${a.goal}`));

    // Instantiate agents
    const agents = agentPlans.map((plan, idx) => {
      const baseConfig = {
        id: `${plan.type}-${idx}`,
        bus: this.bus,
        claudeFn: this.askClaude,
        catalog: this.catalog,
        memory: this.memory,
      };

      switch (plan.type) {
        case 'builder':
          return new BuilderAgent({ ...baseConfig, role: 'builder', goal: plan.goal, templateId: plan.templateId });
        case 'researcher':
          return new ResearcherAgent({ ...baseConfig, role: 'researcher', goal: plan.goal });
        case 'lister':
          return new ListerAgent({ ...baseConfig, role: 'lister', goal: plan.goal, templateId: plan.templateId });
        case 'optimizer':
          return new OptimizerAgent({ ...baseConfig, role: 'optimizer', goal: plan.goal, templateId: plan.templateId });
        case 'analyst':
          return new AnalystAgent({ ...baseConfig, role: 'analyst', goal: plan.goal });
        default:
          return null;
      }
    }).filter(Boolean);

    // ─── PUBLISH initial shared state ────────────────────────────────
    this.bus.setShared('catalog', this.catalog, 'manager');
    this.bus.setShared('blockers', this.blockers, 'manager');
    this.bus.setShared('weeklyProgress', this.memory.getWeeklyProgress(), 'manager');

    // ─── RUN ALL AGENTS IN PARALLEL ──────────────────────────────────
    log(`[A2A:Manager] ═══ LAUNCHING ${agents.length} AGENTS IN PARALLEL ═══`);

    const results = await Promise.allSettled(
      agents.map(agent => agent.run())
    );

    // ─── Collect results ─────────────────────────────────────────────
    const agentResults = results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return r.value;
      } else {
        return {
          agentId: agents[i]?.id || `agent-${i}`,
          role: agents[i]?.role || 'unknown',
          state: 'failed',
          error: r.reason?.message || String(r.reason),
        };
      }
    });

    // ─── Get communication summary ───────────────────────────────────
    const messageSummary = this.bus.getMessageLogSummary();
    const sharedState = this.bus.getAllShared();

    const totalDurationMs = Date.now() - startTime;

    log(`[A2A:Manager] ═══ ALL AGENTS DONE — ${totalDurationMs}ms ═══`);
    log(`[A2A:Manager] Messages exchanged: ${messageSummary.totalMessages}`);
    log(`[A2A:Manager] Shared memory keys: ${messageSummary.sharedMemoryKeys.join(', ')}`);

    // Cleanup
    agents.forEach(a => a.destroy());
    this.bus.destroy();

    return {
      agents: agentResults,
      totalDurationMs,
      messageSummary,
      sharedState,
      parallelCount: agents.length,
    };
  }

  /**
   * Generate a unified report from all agent results.
   */
  static synthesizeReport(a2aResult) {
    const { agents, totalDurationMs, messageSummary, parallelCount } = a2aResult;

    const succeeded = agents.filter(a => a.state === 'completed');
    const failed = agents.filter(a => a.state === 'failed');
    const findings = agents.flatMap(a => a.findings || []);

    const actions = agents
      .filter(a => a.result?.action)
      .map(a => `${a.role}:${a.result.action}`);

    return {
      summary: `${parallelCount} agents ran in parallel: ${succeeded.length} succeeded, ${failed.length} failed. ${messageSummary.totalMessages} inter-agent messages exchanged.`,
      actions,
      findings,
      agents: agents.map(a => ({
        id: a.agentId,
        role: a.role,
        state: a.state,
        action: a.result?.action,
        messagesReceived: a.messagesReceived,
        durationMs: a.durationMs,
      })),
      totalDurationMs,
      interAgentMessages: messageSummary.totalMessages,
    };
  }
}
