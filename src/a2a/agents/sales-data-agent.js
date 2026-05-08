/**
 * SALES DATA AGENT — Fetches Etsy stats per live listing
 *
 * Read-only. Pulls views, num_favorers, etc. via Etsy v3 API.
 * Snapshots to V2's own memory/etsy-stats-history/<date>.json.
 * Publishes summary on the bus for Analyst + Optimizer to consume.
 *
 * Etsy auth: combined `keystring:shared_secret` x-api-key header
 *            (per adarsh-moneymaker/OPERATIONS.md quirks).
 */

import fs from 'fs';
import path from 'path';
import { Agent } from '../agent.js';
import { log } from '../../logger.js';

const MONEYMAKER_PATH = process.env.MONEYMAKER_PATH || '/home/ec2-user/adarsh-moneymaker';
const BRAIN_PATH = process.env.BRAIN_PATH || '/home/ec2-user/arpit-brain-trainer';

function readMoneymakerEnv() {
  const out = {};
  try {
    const text = fs.readFileSync(path.join(MONEYMAKER_PATH, '.env'), 'utf-8');
    for (const line of text.split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  } catch {/* file may not exist; SalesDataAgent will skip */}
  return out;
}

function readEtsyToken() {
  try {
    return JSON.parse(fs.readFileSync(path.join(MONEYMAKER_PATH, 'config/etsy-token.json'), 'utf-8'));
  } catch {
    return null;
  }
}

export class SalesDataAgent extends Agent {
  async plan() {
    const live = this.catalog.filter(t => t.status === 'live' && t.etsyListingId);
    if (live.length === 0) return 'skip — no live listings to fetch stats for';
    return `Fetch Etsy stats for ${live.length} live listings`;
  }

  async execute(plan) {
    if (plan.startsWith('skip')) {
      return { success: true, action: 'skip', output: plan };
    }

    const env = readMoneymakerEnv();
    const token = readEtsyToken();
    const apiKey = env.ETSY_API_KEY;
    const sharedSecret = env.ETSY_SHARED_SECRET;
    const shopId = env.ETSY_SHOP_ID;

    if (!apiKey || !sharedSecret || !shopId || !token?.access_token) {
      return {
        success: false,
        error: 'Missing Etsy credentials — cannot fetch stats',
        action: 'skip',
      };
    }

    const headers = {
      'x-api-key': `${apiKey}:${sharedSecret}`,
      Authorization: `Bearer ${token.access_token}`,
    };

    const live = this.catalog.filter(t => t.status === 'live' && t.etsyListingId);
    const stats = [];
    const lowPerformers = [];

    for (const t of live) {
      try {
        const res = await fetch(`https://openapi.etsy.com/v3/application/listings/${t.etsyListingId}`, { headers });
        if (!res.ok) {
          log(`[A2A:SalesData] ${t.id}: HTTP ${res.status}`);
          continue;
        }
        const d = await res.json();
        const entry = {
          id: t.id,
          listingId: t.etsyListingId,
          views: d.views ?? 0,
          favorers: d.num_favorers ?? 0,
          state: d.state,
          title: d.title?.slice(0, 60),
          price: d.price ? d.price.amount / d.price.divisor : null,
          fetchedAt: new Date().toISOString(),
        };
        stats.push(entry);

        // Heuristic: low impressions = views < 20 after listing > 3 days old
        const ageDays = t.publishedAt
          ? (Date.now() - new Date(t.publishedAt).getTime()) / 86400000
          : 0;
        if (ageDays > 3 && entry.views < 20) {
          lowPerformers.push({ ...entry, ageDays: Math.round(ageDays) });
        }
      } catch (err) {
        log(`[A2A:SalesData] ${t.id}: ${err.message}`);
      }
    }

    // Snapshot to V2's own memory (history)
    const today = new Date().toISOString().slice(0, 10);
    const histDir = path.join(BRAIN_PATH, 'memory', 'etsy-stats-history');
    fs.mkdirSync(histDir, { recursive: true });
    const histFile = path.join(histDir, `${today}.json`);
    let prior = [];
    try { prior = JSON.parse(fs.readFileSync(histFile, 'utf-8')); } catch {/* first snapshot of day */}
    prior.push({ snapshotAt: new Date().toISOString(), stats });
    fs.writeFileSync(histFile, JSON.stringify(prior, null, 2));

    // Share for Analyst/Optimizer
    this.bus.setShared('etsy-stats', stats, this.id);
    if (lowPerformers.length > 0) {
      for (const lp of lowPerformers) {
        this.bus.publish(this.id, 'low-performer', {
          templateId: lp.id,
          listingId: lp.listingId,
          views: lp.views,
          favorers: lp.favorers,
          ageDays: lp.ageDays,
        });
      }
    }

    log(`[A2A:SalesData] Snapshotted ${stats.length} listings; ${lowPerformers.length} flagged as low-impression`);

    return {
      success: true,
      action: 'sales-data-snapshot',
      output: `Snapshotted ${stats.length} listings (${lowPerformers.length} flagged low)`,
      findings: stats,
      lowPerformers,
      result: { listingsFetched: stats.length, lowPerformers: lowPerformers.length },
    };
  }
}
