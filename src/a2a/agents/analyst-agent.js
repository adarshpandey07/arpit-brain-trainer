/**
 * ANALYST AGENT — Brain performance analyst + strategy advisor
 *
 * This agent:
 *   1. Analyzes cycle history, success rates, bottlenecks
 *   2. Identifies which actions are failing most
 *   3. Suggests strategy changes to the brain
 *   4. Publishes performance insights for other agents
 *   5. Rates each template's "readiness" for revenue
 */

import { Agent } from '../agent.js';
import { log } from '../../logger.js';

export class AnalystAgent extends Agent {
  constructor(config) {
    super(config);

    // Listen for all agent failures — track patterns
    this.bus.onBroadcast(this.id, (msg) => {
      if (msg.data?.type === 'agent-failed') {
        log(`[A2A:Analyst] Noted failure: ${msg.data.agentId} — ${msg.data.error}`);
      }
    });
  }

  async plan() {
    return 'Analyze brain performance, identify bottlenecks, recommend strategy changes';
  }

  async execute(plan) {
    const state = this.memory.getState();
    const recentCycles = this.memory.getRecentCycles(20);
    const learnings = this.memory.getLearnings();
    const weeklyProgress = this.memory.getWeeklyProgress();

    const catalogSummary = {
      total: this.catalog.length,
      planned: this.catalog.filter(t => t.status === 'planned').length,
      built: this.catalog.filter(t => t.status === 'built').length,
      live: this.catalog.filter(t => t.status === 'live').length,
    };

    // Calculate metrics
    const successRate = state.totalCycles > 0
      ? Math.round((state.totalSuccesses / state.totalCycles) * 100) : 0;

    const failurePatterns = {};
    for (const cycle of recentCycles) {
      if (cycle.status === 'failed') {
        const key = cycle.action?.split(':')[0] || 'unknown';
        failurePatterns[key] = (failurePatterns[key] || 0) + 1;
      }
    }

    const prompt = `You are a business analyst for an autonomous AI that sells Google Sheets templates on Etsy. Analyze this data and provide strategic recommendations.

BRAIN STATE:
- Total cycles: ${state.totalCycles}
- Success rate: ${successRate}%
- Catalog: ${catalogSummary.total} total (${catalogSummary.planned} planned, ${catalogSummary.built} built, ${catalogSummary.live} LIVE)
- Target: 20+ live listings, ₹50K/month revenue

WEEKLY PROGRESS:
${JSON.stringify(weeklyProgress, null, 2)}

FAILURE PATTERNS:
${JSON.stringify(failurePatterns, null, 2)}

RECENT CYCLES (last 10):
${recentCycles.slice(0, 10).map(c => `  ${c.action} → ${c.status}`).join('\n')}

LEARNINGS SO FAR:
${learnings.slice(-5).map(l => `  • ${l}`).join('\n') || '  None'}

ANALYZE:
1. What's the biggest bottleneck to revenue?
2. Are we on track for the weekly goals?
3. What failure patterns need addressing?
4. Strategy recommendations (specific, actionable)
5. Rate overall brain health (1-10)

RESPOND WITH JSON:
{
  "healthScore": <1-10>,
  "biggestBottleneck": "...",
  "onTrack": true/false,
  "failureAnalysis": "...",
  "recommendations": ["...", "..."],
  "strategyChange": "specific change to suggest to brain settings, or null",
  "urgency": "low|medium|high|critical"
}`;

    try {
      const response = await this.askClaude(prompt);

      let parsed;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response);
      } catch {
        return { success: false, action: 'analyze', output: 'Failed to parse analysis' };
      }

      // Publish insights for other agents
      this.addFinding('performance-insight', {
        healthScore: parsed.healthScore,
        bottleneck: parsed.biggestBottleneck,
        onTrack: parsed.onTrack,
        recommendations: parsed.recommendations,
      });

      // Share strategy suggestion via shared memory
      if (parsed.strategyChange) {
        this.setShared('strategy-suggestion', parsed.strategyChange);
      }

      // Flag low performers if any
      const lowPerformers = this.catalog.filter(t =>
        t.status === 'live' && !t.etsyListingId
      );
      for (const lp of lowPerformers) {
        this.bus.publish(this.id, 'low-performer', { templateId: lp.id });
      }

      return {
        success: true,
        action: 'analyze',
        output: `Health: ${parsed.healthScore}/10. Bottleneck: ${parsed.biggestBottleneck}. ${parsed.recommendations?.length || 0} recommendations.`,
        analysis: parsed,
      };

    } catch (err) {
      return { success: false, action: 'analyze', output: err.message };
    }
  }
}
