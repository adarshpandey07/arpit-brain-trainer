/**
 * Enhanced Brain Memory — Persistent state with weekly tracking + blocker awareness
 *
 * All state is stored as JSON files and committed to git for auditability.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WeeklyTracker } from './weekly-tracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, '..', 'memory');
const STATE_PATH = path.join(MEMORY_DIR, 'state.json');
const LEARNINGS_PATH = path.join(MEMORY_DIR, 'learnings.json');
const CYCLE_DIR = path.join(MEMORY_DIR, 'cycle-history');

const MAX_LEARNINGS = 100;
const MAX_CYCLE_FILES = 200;

export class BrainMemory {
  constructor() {
    this._ensureDirs();
    this.weeklyTracker = new WeeklyTracker();
  }

  // ─── State ────────────────────────────────────────────────────────

  getState() {
    try {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    } catch {
      const initial = {
        startedAt: new Date().toISOString(),
        totalCycles: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        catalog: { total: 0, built: 0, live: 0, planned: 0 },
        lastCycle: null,
        brainVersion: '2.0.0',
      };
      fs.writeFileSync(STATE_PATH, JSON.stringify(initial, null, 2));
      return initial;
    }
  }

  updateState(cycleResult) {
    const state = this.getState();
    state.totalCycles++;
    if (cycleResult.status === 'success') state.totalSuccesses++;
    else state.totalFailures++;

    state.lastCycle = {
      timestamp: cycleResult.timestamp,
      action: cycleResult.action,
      status: cycleResult.status,
      urgencyLevel: cycleResult.urgencyLevel,
    };

    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  }

  // ─── Learnings ────────────────────────────────────────────────────

  getLearnings() {
    try {
      const raw = JSON.parse(fs.readFileSync(LEARNINGS_PATH, 'utf-8'));
      return raw.map(l => typeof l === 'string' ? l : l.text);
    } catch {
      return [];
    }
  }

  addLearning(text) {
    if (!text || text === 'null' || typeof text !== 'string') return;

    let learnings;
    try {
      learnings = JSON.parse(fs.readFileSync(LEARNINGS_PATH, 'utf-8'));
    } catch {
      learnings = [];
    }

    // Dedup — don't add very similar learnings
    const isDuplicate = learnings.some(l => {
      const existing = typeof l === 'string' ? l : l.text;
      return existing.toLowerCase().includes(text.toLowerCase().slice(0, 50));
    });

    if (!isDuplicate) {
      learnings.push({
        text,
        addedAt: new Date().toISOString(),
      });

      // Cap at MAX_LEARNINGS (keep most recent)
      if (learnings.length > MAX_LEARNINGS) {
        learnings = learnings.slice(-MAX_LEARNINGS);
      }

      fs.writeFileSync(LEARNINGS_PATH, JSON.stringify(learnings, null, 2));
      this.weeklyTracker.recordLearning();
    }
  }

  // ─── Cycle History ────────────────────────────────────────────────

  saveCycleResult(result) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${result.cycleId}.json`;
    const filepath = path.join(CYCLE_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));

    // Update state
    this.updateState(result);

    // Cleanup old files
    this._cleanupCycleFiles();
  }

  getRecentCycles(count = 10) {
    try {
      const files = fs.readdirSync(CYCLE_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, count);

      return files.map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(CYCLE_DIR, f), 'utf-8'));
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  // ─── Weekly Progress ──────────────────────────────────────────────

  getWeeklyProgress() {
    return this.weeklyTracker.getProgress();
  }

  updateWeeklyProgress(action, success) {
    this.weeklyTracker.recordAction(action, success);
  }

  // ─── Daily Report ─────────────────────────────────────────────────

  getDailyReport() {
    const today = new Date().toISOString().split('T')[0];
    const cycles = this.getRecentCycles(50).filter(c =>
      c.timestamp?.startsWith(today)
    );

    const successes = cycles.filter(c => c.status === 'success').length;
    const failures = cycles.filter(c => c.status === 'failed').length;
    const actions = cycles.map(c => c.action);
    const state = this.getState();

    return [
      `📋 *DAILY REPORT* (${today})`,
      '',
      `Cycles today: ${cycles.length}`,
      `  ✅ Success: ${successes}`,
      `  ❌ Failed: ${failures}`,
      '',
      `Actions: ${actions.join(', ') || 'none'}`,
      '',
      `📦 Catalog: ${state.catalog?.live || 0} live / ${state.catalog?.built || 0} built / ${state.catalog?.planned || 0} planned`,
      `Total cycles since startup: ${state.totalCycles}`,
      `Lifetime success rate: ${state.totalCycles > 0 ? Math.round((state.totalSuccesses / state.totalCycles) * 100) : 0}%`,
    ].join('\n');
  }

  // ─── Tasks (Telegram assigned) ────────────────────────────────────

  addTask(task) {
    // Stored in memory for persistence across restarts
    const tasksPath = path.join(MEMORY_DIR, 'tasks.json');
    let tasks = [];
    try { tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8')); } catch {}
    tasks.push(task);
    fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
  }

  // ─── Private ──────────────────────────────────────────────────────

  _ensureDirs() {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    fs.mkdirSync(CYCLE_DIR, { recursive: true });
  }

  _cleanupCycleFiles() {
    try {
      const files = fs.readdirSync(CYCLE_DIR)
        .filter(f => f.endsWith('.json'))
        .sort();

      if (files.length > MAX_CYCLE_FILES) {
        const toDelete = files.slice(0, files.length - MAX_CYCLE_FILES);
        toDelete.forEach(f => {
          try { fs.unlinkSync(path.join(CYCLE_DIR, f)); } catch {}
        });
      }
    } catch {}
  }
}
