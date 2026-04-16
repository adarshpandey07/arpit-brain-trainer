/**
 * Priority Engine — Smart action selection based on pipeline state
 *
 * Instead of asking Claude "what to do next?" every cycle,
 * the priority engine determines the BEST action based on:
 *   1. What's blocked (no Etsy key = skip listing)
 *   2. What's ready (built + mockups = list it)
 *   3. What's next in the pipeline (planned = build it)
 *   4. Weekly goals (are we on track?)
 *   5. Day of week (research Monday, listing Fri/Sat)
 *   6. Recent failures (don't repeat failed actions)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class PriorityEngine {
  constructor(memory, settings) {
    this.memory = memory;
    this.settings = settings;
  }

  /**
   * Determine the best next action based on full pipeline state.
   * Returns { action, reasoning, confidence }
   */
  decide(catalog, blockers, weeklyProgress) {
    const now = new Date();
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
    const hour = now.getHours();
    const recentCycles = this.memory.getRecentCycles(10);
    const recentFailures = this._getRecentFailures(recentCycles);
    const consecutiveFailures = this._getConsecutiveFailures(recentCycles);

    // Categorize templates
    const built = catalog.filter(t => t.status === 'built');
    const live = catalog.filter(t => t.status === 'live');
    const planned = catalog.filter(t => t.status === 'planned');
    const readyToList = built.filter(t => t.mockupsReady && t.copyLink);
    const needsMockups = built.filter(t => !t.mockupsReady && t.copyLink);

    const hasEtsyKey = !blockers.includes('etsy-api-missing');

    log(`[PriorityEngine] State: ${built.length} built, ${live.length} live, ${planned.length} planned, ${readyToList.length} ready-to-list`);
    log(`[PriorityEngine] Blockers: ${blockers.length > 0 ? blockers.join(', ') : 'none'}`);
    log(`[PriorityEngine] Day: ${dayOfWeek}, Hour: ${hour}`);

    // ─── RULE 1: If 3+ consecutive failures, go idle ──────────
    if (consecutiveFailures >= 3) {
      return {
        action: 'idle',
        reasoning: `${consecutiveFailures} consecutive failures — backing off to prevent loops. Manual intervention needed.`,
        confidence: 'high',
        escalate: true,
      };
    }

    // ─── RULE 2: List ready templates (highest priority) ──────
    if (hasEtsyKey && readyToList.length > 0) {
      // Prefer listing on Fri/Sat but don't block on other days
      const template = this._pickByTier(readyToList);
      const wasRecentlyFailed = recentFailures.includes(`list:${template.id}`);

      if (!wasRecentlyFailed) {
        return {
          action: `list:${template.id}`,
          reasoning: `${template.name} is built with mockups ready — listing for revenue. ${readyToList.length} total ready to list.`,
          confidence: 'high',
        };
      }
    }

    // ─── RULE 3: Generate mockups for built templates ─────────
    if (needsMockups.length > 0) {
      const template = this._pickByTier(needsMockups);
      const wasRecentlyFailed = recentFailures.includes(`mockups:${template.id}`);

      if (!wasRecentlyFailed) {
        return {
          action: `mockups:${template.id}`,
          reasoning: `${template.name} is built but needs mockups before listing. ${needsMockups.length} templates need mockups.`,
          confidence: 'high',
        };
      }
    }

    // ─── RULE 4: Build planned templates ──────────────────────
    if (planned.length > 0) {
      const weeklyBuilds = weeklyProgress?.templatesBuild || 0;
      const maxPerWeek = this.settings.weeklyGoals?.templatesBuild || 5;

      if (weeklyBuilds < maxPerWeek) {
        const template = this._pickByTier(planned);
        const wasRecentlyFailed = recentFailures.includes(`build:${template.id}`);

        if (!wasRecentlyFailed) {
          return {
            action: `build:${template.id}`,
            reasoning: `Building ${template.name} (Tier ${template.tier}). ${weeklyBuilds}/${maxPerWeek} built this week. ${planned.length} planned remaining.`,
            confidence: 'high',
          };
        }
      }
    }

    // ─── RULE 5: Research on Mondays or when no planned ───────
    const researchDays = this.settings.priorities?.researchDays || ['Monday'];
    const isResearchDay = researchDays.includes(dayOfWeek);
    const weeklyResearch = weeklyProgress?.researchSessions || 0;
    const wasResearchFailed = recentFailures.includes('research');

    if ((isResearchDay || planned.length < 5) && weeklyResearch < 2 && !wasResearchFailed) {
      return {
        action: 'research',
        reasoning: isResearchDay
          ? `${dayOfWeek} is research day. Finding new trending niches to add to catalog.`
          : `Only ${planned.length} planned templates left. Need more ideas.`,
        confidence: 'medium',
      };
    }

    // ─── RULE 6: Optimize live listings ───────────────────────
    if (live.length > 0) {
      const template = live[Math.floor(Math.random() * live.length)];
      return {
        action: `optimize:${template.id}`,
        reasoning: `All build/list actions done or blocked. Optimizing ${template.name} SEO for better visibility.`,
        confidence: 'low',
      };
    }

    // ─── RULE 7: If listing blocked, keep building ────────────
    if (!hasEtsyKey && planned.length > 0) {
      const template = this._pickByTier(planned);
      return {
        action: `build:${template.id}`,
        reasoning: `Listing blocked (no Etsy key). Building ${template.name} so inventory is ready when key is added.`,
        confidence: 'medium',
      };
    }

    // ─── FALLBACK: Idle ───────────────────────────────────────
    return {
      action: 'idle',
      reasoning: `No actionable work found. ${live.length} live, ${built.length} built, ${planned.length} planned.`,
      confidence: 'low',
    };
  }

  /**
   * Pick the highest priority template (lowest tier first, then alphabetical)
   */
  _pickByTier(templates) {
    return templates.sort((a, b) => {
      if ((a.tier || 99) !== (b.tier || 99)) return (a.tier || 99) - (b.tier || 99);
      return a.id.localeCompare(b.id);
    })[0];
  }

  /**
   * Get actions that failed in the last 3 cycles (to avoid repeating)
   */
  _getRecentFailures(recentCycles) {
    return recentCycles
      .slice(0, 3)
      .filter(c => c.status === 'failed')
      .map(c => c.action);
  }

  /**
   * Count consecutive failures from the most recent cycle backwards
   */
  _getConsecutiveFailures(recentCycles) {
    let count = 0;
    for (const cycle of recentCycles) {
      if (cycle.status === 'failed') count++;
      else break;
    }
    return count;
  }
}
