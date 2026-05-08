/**
 * Weekly Tracker — Goal tracking and performance analytics
 *
 * Tracks:
 *   - Templates built this week vs target
 *   - Templates listed this week vs target
 *   - Mockups generated
 *   - Research sessions
 *   - Success/failure rate
 *   - Revenue progress (when analytics available)
 *   - Brain's self-improvement rate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEEKLY_PATH = path.join(__dirname, '..', 'memory', 'weekly-goals.json');
const SETTINGS_PATH = path.join(__dirname, '..', 'config', 'settings.json');

export class WeeklyTracker {
  constructor() {
    this.data = this._load();
  }

  // ─── Get current week key ─────────────────────────────────────────

  _weekKey() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // Sunday
    return start.toISOString().split('T')[0];
  }

  // ─── Get or create current week ───────────────────────────────────

  getCurrentWeek() {
    const key = this._weekKey();
    if (!this.data.weeks[key]) {
      this.data.weeks[key] = {
        startDate: key,
        templatesBuild: 0,
        templatesListed: 0,
        mockupsGenerated: 0,
        researchSessions: 0,
        totalCycles: 0,
        successfulCycles: 0,
        failedCycles: 0,
        actionsLog: [],
        learningsCount: 0,
        strategyEvolutions: 0,
      };
      this._save();
    }
    return this.data.weeks[key];
  }

  // ─── Record an action ─────────────────────────────────────────────

  recordAction(action, success) {
    const week = this.getCurrentWeek();
    week.totalCycles++;

    if (success) {
      week.successfulCycles++;
    } else {
      week.failedCycles++;
    }

    const [cmd] = action.split(':');

    if (success) {
      switch (cmd) {
        case 'build':
          week.templatesBuild++;
          break;
        case 'list':
          week.templatesListed++;
          break;
        case 'mockups':
          week.mockupsGenerated++;
          break;
        case 'research':
          week.researchSessions++;
          break;
      }
    }

    week.actionsLog.push({
      action,
      success,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 50 actions per week
    if (week.actionsLog.length > 50) {
      week.actionsLog = week.actionsLog.slice(-50);
    }

    this._save();
  }

  // ─── Record a learning ────────────────────────────────────────────

  recordLearning() {
    const week = this.getCurrentWeek();
    week.learningsCount++;
    this._save();
  }

  // ─── Record strategy evolution ────────────────────────────────────

  recordEvolution() {
    const week = this.getCurrentWeek();
    week.strategyEvolutions++;
    this._save();
  }

  // ─── Get weekly progress for priority engine ──────────────────────

  getProgress() {
    const week = this.getCurrentWeek();
    return {
      templatesBuild: week.templatesBuild,
      templatesListed: week.templatesListed,
      mockupsGenerated: week.mockupsGenerated,
      researchSessions: week.researchSessions,
      totalCycles: week.totalCycles,
      successRate: week.totalCycles > 0
        ? Math.round((week.successfulCycles / week.totalCycles) * 100)
        : 0,
    };
  }

  // ─── Get weekly report (for Telegram) ─────────────────────────────

  getWeeklyReport() {
    const week = this.getCurrentWeek();
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    const goals = settings.weeklyGoals || {};

    const buildPct = goals.templatesBuild ? Math.round((week.templatesBuild / goals.templatesBuild) * 100) : 0;
    const listPct = goals.templatesListed ? Math.round((week.templatesListed / goals.templatesListed) * 100) : 0;
    const successRate = week.totalCycles > 0 ? Math.round((week.successfulCycles / week.totalCycles) * 100) : 0;

    const buildBar = this._progressBar(week.templatesBuild, goals.templatesBuild || 3);
    const listBar = this._progressBar(week.templatesListed, goals.templatesListed || 2);

    return [
      `📊 *WEEKLY REPORT* (${week.startDate})`,
      '',
      `*Build:* ${week.templatesBuild}/${goals.templatesBuild || 3} ${buildBar} ${buildPct}%`,
      `*List:*  ${week.templatesListed}/${goals.templatesListed || 2} ${listBar} ${listPct}%`,
      `*Mockups:* ${week.mockupsGenerated}`,
      `*Research:* ${week.researchSessions}`,
      '',
      `*Cycles:* ${week.totalCycles} total | ${week.successfulCycles} ok | ${week.failedCycles} failed`,
      `*Success Rate:* ${successRate}%`,
      '',
      `*Brain Growth:*`,
      `  Learnings: ${week.learningsCount}`,
      `  Strategy evolutions: ${week.strategyEvolutions}`,
      '',
      buildPct >= 100 && listPct >= 100
        ? '🎯 *ALL GOALS MET! Brain is on track!*'
        : buildPct < 50
          ? '⚠️ *Behind on build target — need to accelerate!*'
          : '💪 *Making progress — keep pushing!*',
    ].join('\n');
  }

  // ─── Get performance trend (last 4 weeks) ─────────────────────────

  getTrend() {
    const weeks = Object.keys(this.data.weeks).sort().slice(-4);
    return weeks.map(key => {
      const w = this.data.weeks[key];
      return {
        week: key,
        builds: w.templatesBuild,
        listed: w.templatesListed,
        successRate: w.totalCycles > 0
          ? Math.round((w.successfulCycles / w.totalCycles) * 100)
          : 0,
        evolutions: w.strategyEvolutions,
      };
    });
  }

  // ─── Private ──────────────────────────────────────────────────────

  _progressBar(current, target) {
    const filled = Math.min(10, Math.round((current / Math.max(target, 1)) * 10));
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(WEEKLY_PATH, 'utf-8'));
    } catch {
      return { weeks: {} };
    }
  }

  _save() {
    fs.writeFileSync(WEEKLY_PATH, JSON.stringify(this.data, null, 2));
  }
}
