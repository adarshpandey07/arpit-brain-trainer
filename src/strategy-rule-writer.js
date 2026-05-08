/**
 * STRATEGY RULE WRITER
 *
 * Produces structured rule edits — V1's priority engine reads these and
 * adjusts behavior accordingly.
 *
 * Default rules are seeded if file doesn't exist. Updates merge gently
 * (don't clobber owner-set fields, identified by `_ownerSet: true`).
 *
 * Writes to:
 *   <V1_BRAIN_PATH>/memory/strategy-rules.json
 */

import fs from 'fs';
import path from 'path';
import { log } from './logger.js';

const V1_BRAIN_PATH = process.env.V1_BRAIN_PATH || '/home/ec2-user/adarsh-pandey-money-maker-brain';

const DEFAULT_RULES = {
  'preferred-listing-days': ['Friday', 'Saturday'],
  'max-listings-per-week': 3,
  'low-impression-threshold-days': 7,
  'low-impression-action': 'lower-price-1-dollar',
  'auto-publish-after-trust-score': 10,
  'min-mockups-before-listing': 6,
};

function readCurrent() {
  try {
    return JSON.parse(fs.readFileSync(path.join(V1_BRAIN_PATH, 'memory/strategy-rules.json'), 'utf-8'));
  } catch {
    return { version: 0, rules: { ...DEFAULT_RULES }, _ownerLocks: [] };
  }
}

/**
 * Apply rule deltas; preserve any `_ownerLocks` (rules user explicitly set).
 *
 * @param {Object} a2aResult
 * @returns {Object} written payload
 */
export function writeStrategyRules(a2aResult) {
  const cur = readCurrent();
  const newRules = { ...cur.rules };
  const ownerLocks = cur._ownerLocks || [];
  const deltas = [];

  // Derive deltas from analyst messages on the bus
  const analyst = a2aResult.agents?.find(a => a.role === 'analyst');
  const sales = a2aResult.agents?.find(a => a.role === 'sales-data');

  // Heuristic: if many low-performers, suggest lowering threshold to be more aggressive
  if (sales?.lowPerformers?.length >= 2) {
    const cur = newRules['low-impression-threshold-days'];
    if (cur > 5 && !ownerLocks.includes('low-impression-threshold-days')) {
      deltas.push({
        rule: 'low-impression-threshold-days',
        old: cur,
        new: 5,
        reason: `${sales.lowPerformers.length} listings already low-performing — be more aggressive`,
      });
      newRules['low-impression-threshold-days'] = 5;
    }
  }

  // Analyst can supply free-form `ruleHints` array (string -> rule mapping in agent output)
  if (analyst?.ruleHints && Array.isArray(analyst.ruleHints)) {
    for (const hint of analyst.ruleHints) {
      if (hint?.rule && !ownerLocks.includes(hint.rule) && hint.value !== undefined) {
        deltas.push({
          rule: hint.rule,
          old: newRules[hint.rule],
          new: hint.value,
          reason: hint.reason || 'analyst hint',
        });
        newRules[hint.rule] = hint.value;
      }
    }
  }

  const version = (Number(cur.version) || 0) + (deltas.length > 0 ? 1 : 0);
  const payload = {
    version,
    generatedAt: new Date().toISOString(),
    rules: newRules,
    _ownerLocks: ownerLocks,
    lastDeltas: deltas,
  };

  const v1MemoryDir = path.join(V1_BRAIN_PATH, 'memory');
  fs.mkdirSync(v1MemoryDir, { recursive: true });
  fs.writeFileSync(path.join(v1MemoryDir, 'strategy-rules.json'), JSON.stringify(payload, null, 2));

  if (deltas.length > 0) {
    log(`[StrategyRules] v${version} updated: ${deltas.map(d => d.rule).join(', ')}`);
  } else {
    log(`[StrategyRules] no changes (v${version})`);
  }

  return payload;
}
