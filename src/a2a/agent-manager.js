/**
 * AGENT MANAGER — V2 OBSERVER edition (read-only)
 *
 * V2 NO LONGER does worker actions (build/list/publish). Those are V1's job.
 * V2 spawns READ-ONLY observation agents that produce structured suggestions
 * for V1 to consume.
 *
 * Agents:
 *   - ResearcherAgent  — find new niches (read-only)
 *   - OptimizerAgent   — analyze existing listings, suggest SEO tweaks (read-only)
 *   - AnalystAgent     — observe brain performance, identify bottlenecks
 *   - SalesDataAgent   — fetch Etsy stats per live listing, snapshot history
 */

import { MessageBus } from './message-bus.js';
import { ResearcherAgent } from './agents/researcher-agent.js';
import { OptimizerAgent } from './agents/optimizer-agent.js';
import { AnalystAgent } from './agents/analyst-agent.js';
import { SalesDataAgent } from './agents/sales-data-agent.js';
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
    const live = this.catalog.filter(t => t.status === 'live');
    const weeklyProgress = this.memory.getWeeklyProgress();

    // ─── SalesData: ALWAYS if there are live listings ────────────────
    if (live.length > 0) {
      agents.push({
        type: 'sales-data',
        goal: `Fetch Etsy stats (views, favorites) for ${live.length} live listings; flag low-impression performers`,
        priority: 0,
      });
    }

    // ─── Researcher (unless already researched twice this week) ──────
    if ((weeklyProgress.researchSessions || 0) < 2) {
      agents.push({
        type: 'researcher',
        goal: 'Find trending niches with high demand + low competition; surface as new template candidates',
        priority: 2,
      });
    }

    // ─── Optimizer: rotates through live listings ─────────────────────
    if (live.length > 0) {
      const toOptimize = live[Math.floor(Math.random() * live.length)];
      agents.push({
        type: 'optimizer',
        goal: `Suggest SEO improvements for ${toOptimize.id} — title, tags, price (no edits, suggestions only)`,
        templateId: toOptimize.id,
        priority: 3,
      });
    }

    // ─── Analyst: assess overall performance after a few cycles ──────
    if (this.memory.getState().totalCycles > 3) {
      agents.push({
        type: 'analyst',
        goal: 'Analyze V1 cycle-history + sales data; identify patterns, bottlenecks, write strategy hints',
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
        case 'researcher':
          return new ResearcherAgent({ ...baseConfig, role: 'researcher', goal: plan.goal });
        case 'optimizer':
          return new OptimizerAgent({ ...baseConfig, role: 'optimizer', goal: plan.goal, templateId: plan.templateId });
        case 'analyst':
          return new AnalystAgent({ ...baseConfig, role: 'analyst', goal: plan.goal });
        case 'sales-data':
          return new SalesDataAgent({ ...baseConfig, role: 'sales-data', goal: plan.goal });
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
