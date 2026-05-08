/**
 * SUGGESTION WRITER
 *
 * Takes A2A cycle results (analyst, optimizer, sales-data outputs + bus messages)
 * and synthesizes top-5 actionable suggestions for V1 to consume.
 *
 * Writes to:
 *   <V1_BRAIN_PATH>/memory/trainer-suggestions.json   (V1 reads this each cycle)
 *   <BRAIN_PATH>/memory/suggestion-history/<iso>.json (V2's own append-only log)
 */

import fs from 'fs';
import path from 'path';
import { log } from './logger.js';

const V1_BRAIN_PATH = process.env.V1_BRAIN_PATH || '/home/ec2-user/adarsh-pandey-money-maker-brain';
const BRAIN_PATH = process.env.BRAIN_PATH || '/home/ec2-user/arpit-brain-trainer';

function readCurrentVersion() {
  try {
    const cur = JSON.parse(fs.readFileSync(path.join(V1_BRAIN_PATH, 'memory/trainer-suggestions.json'), 'utf-8'));
    return Number(cur.version) || 0;
  } catch {
    return 0;
  }
}

/**
 * @param {Object} a2aResult — result from AgentManager.runParallel()
 * @returns {Object} — the file written
 */
export function writeSuggestions(a2aResult) {
  const version = readCurrentVersion() + 1;
  const generatedAt = new Date().toISOString();
  const suggestions = [];
  let counter = 0;

  const nextId = () => `sug-${version}-${++counter}`;

  // Pull from sales-data: low-performers → high priority pricing/SEO suggestions
  const salesAgent = a2aResult.agents.find(a => a.role === 'sales-data');
  if (salesAgent?.lowPerformers?.length) {
    for (const lp of salesAgent.lowPerformers.slice(0, 2)) {
      suggestions.push({
        id: nextId(),
        priority: 'high',
        category: 'pricing',
        text: `${lp.id}: ${lp.views} views, ${lp.favorers} favorites in ${lp.ageDays}d — try lowering price by $1 or refresh tags`,
        actionableFor: `optimize:${lp.id}`,
        evidence: `etsy stats listing ${lp.listingId} (last fetched ${lp.fetchedAt})`,
      });
    }
  }

  // Pull from optimizer: SEO recommendations
  const optAgent = a2aResult.agents.find(a => a.role === 'optimizer');
  if (optAgent?.findings?.length) {
    for (const f of optAgent.findings.slice(0, 2)) {
      suggestions.push({
        id: nextId(),
        priority: 'medium',
        category: 'seo',
        text: typeof f === 'string' ? f : (f.text || JSON.stringify(f).slice(0, 200)),
        actionableFor: optAgent.templateId ? `optimize:${optAgent.templateId}` : 'optimize',
        evidence: `optimizer-agent cycle ${a2aResult.cycleId || 'latest'}`,
      });
    }
  }

  // Pull from analyst: strategy hints
  const analyst = a2aResult.agents.find(a => a.role === 'analyst');
  if (analyst?.findings?.length) {
    for (const f of analyst.findings.slice(0, 2)) {
      suggestions.push({
        id: nextId(),
        priority: 'medium',
        category: 'strategy',
        text: typeof f === 'string' ? f : (f.text || JSON.stringify(f).slice(0, 200)),
        actionableFor: 'strategy',
        evidence: `analyst-agent cycle ${a2aResult.cycleId || 'latest'}`,
      });
    }
  }

  // Pull from researcher: new niche ideas
  const researcher = a2aResult.agents.find(a => a.role === 'researcher');
  if (researcher?.findings?.length) {
    const f = researcher.findings[0];
    suggestions.push({
      id: nextId(),
      priority: 'low',
      category: 'inventory',
      text: typeof f === 'string' ? f : (f.text || JSON.stringify(f).slice(0, 200)),
      actionableFor: 'add-template',
      evidence: 'researcher-agent niche scan',
    });
  }

  // Cap at top 5
  const top5 = suggestions.slice(0, 5);

  const payload = {
    version,
    generatedAt,
    cycleId: a2aResult.cycleId,
    agentCount: a2aResult.parallelCount || a2aResult.agents?.length || 0,
    suggestions: top5,
  };

  // Write to V1's memory (V1 reads this on next cycle)
  const v1MemoryDir = path.join(V1_BRAIN_PATH, 'memory');
  fs.mkdirSync(v1MemoryDir, { recursive: true });
  fs.writeFileSync(path.join(v1MemoryDir, 'trainer-suggestions.json'), JSON.stringify(payload, null, 2));
  log(`[SuggestionWriter] v${version} → ${v1MemoryDir}/trainer-suggestions.json (${top5.length} suggestions)`);

  // V2's own append-only history
  const histDir = path.join(BRAIN_PATH, 'memory', 'suggestion-history');
  fs.mkdirSync(histDir, { recursive: true });
  const histFile = path.join(histDir, `v${version}-${generatedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(histFile, JSON.stringify(payload, null, 2));

  return payload;
}
