/**
 * Escalation Engine — Intelligent failure handling + self-evolution
 *
 * This is the brain's immune system. It:
 *   1. Tracks blockers and their resolution status
 *   2. Sends escalation alerts via Telegram at smart intervals
 *   3. Suggests fallback actions when primary actions fail
 *   4. Tracks patterns in failures to evolve strategy
 *   5. Auto-resolves blockers when conditions change
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, logError } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class EscalationEngine {
  constructor(memory, bot) {
    this.memory = memory;
    this.bot = bot;
    this.rulesPath = path.join(__dirname, '..', 'config', 'escalation-rules.json');
    this.blockersPath = path.join(__dirname, '..', 'memory', 'blockers.json');
    this.rules = this._loadRules();
    this.blockers = this._loadBlockers();
  }

  // ─── Handle a cycle failure ────────────────────────────────────────

  async handleFailure(action, error, cycleResult) {
    const errorStr = typeof error === 'string' ? error : error.message || String(error);
    log(`[Escalation] Handling failure: ${action} — ${errorStr}`);

    // Find matching rule
    const matchedRule = this.rules.find(rule =>
      errorStr.toLowerCase().includes(rule.trigger.toLowerCase())
    );

    if (matchedRule) {
      return this._applyRule(matchedRule, action, errorStr);
    }

    // Check consecutive failures
    const recentCycles = this.memory.getRecentCycles(5);
    const consecutiveFailures = this._countConsecutive(recentCycles);

    if (consecutiveFailures >= 3) {
      const stuckRule = this.rules.find(r => r.id === 'consecutive-failures');
      if (stuckRule) {
        return this._applyRule(stuckRule, action, errorStr);
      }
    }

    // No matching rule — generic escalation
    return {
      fallbackAction: null,
      shouldNotify: consecutiveFailures >= 2,
      message: `Action "${action}" failed: ${errorStr.slice(0, 200)}`,
      severity: 'warning',
    };
  }

  // ─── Check for active blockers ─────────────────────────────────────

  getActiveBlockers() {
    const now = Date.now();
    const maxAge = 72 * 60 * 60 * 1000; // 72 hours

    // Clean expired blockers
    this.blockers = this.blockers.filter(b => {
      const age = now - new Date(b.firstSeen).getTime();
      return age < maxAge;
    });
    this._saveBlockers();

    return this.blockers.map(b => b.id);
  }

  // ─── Add a blocker ─────────────────────────────────────────────────

  addBlocker(id, message, severity) {
    const existing = this.blockers.find(b => b.id === id);
    if (existing) {
      existing.lastSeen = new Date().toISOString();
      existing.hitCount = (existing.hitCount || 1) + 1;
    } else {
      this.blockers.push({
        id,
        message,
        severity,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        lastNotified: null,
        hitCount: 1,
        resolved: false,
      });
    }
    this._saveBlockers();
  }

  // ─── Resolve a blocker ─────────────────────────────────────────────

  resolveBlocker(id) {
    const blocker = this.blockers.find(b => b.id === id);
    if (blocker) {
      blocker.resolved = true;
      blocker.resolvedAt = new Date().toISOString();
      log(`[Escalation] Blocker resolved: ${id}`);
      this._saveBlockers();
      return true;
    }
    return false;
  }

  // ─── Check environment blockers ────────────────────────────────────

  checkEnvironmentBlockers() {
    const blockerIds = [];

    // Check ETSY_API_KEY
    if (!process.env.ETSY_API_KEY) {
      this.addBlocker('etsy-api-missing', 'ETSY_API_KEY not set in .env', 'critical');
      blockerIds.push('etsy-api-missing');
    } else {
      this.resolveBlocker('etsy-api-missing');
    }

    return blockerIds;
  }

  // ─── Should we notify about a blocker? ─────────────────────────────

  shouldNotify(blockerId) {
    const blocker = this.blockers.find(b => b.id === blockerId);
    if (!blocker || blocker.resolved) return false;

    const rule = this.rules.find(r => r.id === blockerId);
    if (!rule) return true; // No rule = always notify

    if (!blocker.lastNotified) return true;

    const timeSinceNotify = Date.now() - new Date(blocker.lastNotified).getTime();
    const intervalMs = this._parseInterval(rule.notifyEvery, rule.notifyUnit);

    return timeSinceNotify >= intervalMs;
  }

  // ─── Send escalation notification ──────────────────────────────────

  async notify(message, severity) {
    if (!this.bot) return;

    const emoji = {
      critical: '🚨',
      high: '⚠️',
      warning: '💡',
      info: 'ℹ️',
    }[severity] || '📢';

    const text = [
      `${emoji} *ESCALATION — ${severity.toUpperCase()}*`,
      '',
      message,
      '',
      `_Brain is handling this automatically._`,
    ].join('\n');

    await this.bot.send(text);
  }

  // ─── Get fallback action for a blocked action type ─────────────────

  getFallbackAction(failedAction, catalog) {
    const [cmd] = failedAction.split(':');

    switch (cmd) {
      case 'list': {
        // Listing failed — try mockups for another template
        const needsMockups = catalog.find(t => t.status === 'built' && !t.mockupsReady);
        if (needsMockups) return `mockups:${needsMockups.id}`;
        // Or build next planned
        const planned = catalog.find(t => t.status === 'planned');
        if (planned) return `build:${planned.id}`;
        return 'research';
      }

      case 'build': {
        // Build failed — try building a different template
        const [, failedId] = failedAction.split(':');
        const otherPlanned = catalog.find(t => t.status === 'planned' && t.id !== failedId);
        if (otherPlanned) return `build:${otherPlanned.id}`;
        return 'research';
      }

      case 'mockups': {
        // Mockups failed — try building next planned
        const planned = catalog.find(t => t.status === 'planned');
        if (planned) return `build:${planned.id}`;
        return 'research';
      }

      default:
        return 'idle';
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────

  async _applyRule(rule, action, error) {
    log(`[Escalation] Rule matched: ${rule.id} — ${rule.message}`);

    // Track blocker
    this.addBlocker(rule.id, rule.message, rule.severity);

    // Notify if due
    const shouldNotify = this.shouldNotify(rule.id);
    if (shouldNotify) {
      await this.notify(
        `${rule.message}\n\nFailed action: \`${action}\`\nError: ${error.slice(0, 150)}`,
        rule.severity
      );

      // Update lastNotified
      const blocker = this.blockers.find(b => b.id === rule.id);
      if (blocker) {
        blocker.lastNotified = new Date().toISOString();
        this._saveBlockers();
      }
    }

    return {
      fallbackAction: rule.fallbackAction,
      shouldNotify,
      message: rule.message,
      severity: rule.severity,
      ruleId: rule.id,
    };
  }

  _loadRules() {
    try {
      const data = JSON.parse(fs.readFileSync(this.rulesPath, 'utf-8'));
      return data.rules || [];
    } catch {
      return [];
    }
  }

  _loadBlockers() {
    try {
      return JSON.parse(fs.readFileSync(this.blockersPath, 'utf-8'));
    } catch {
      return [];
    }
  }

  _saveBlockers() {
    fs.writeFileSync(this.blockersPath, JSON.stringify(this.blockers, null, 2));
  }

  _countConsecutive(cycles) {
    let count = 0;
    for (const c of cycles) {
      if (c.status === 'failed') count++;
      else break;
    }
    return count;
  }

  _parseInterval(value, unit) {
    const ms = {
      hours: 60 * 60 * 1000,
      minutes: 60 * 1000,
      cycles: 3 * 60 * 60 * 1000, // Assume 3h cycle
    };
    return value * (ms[unit] || ms.hours);
  }
}
