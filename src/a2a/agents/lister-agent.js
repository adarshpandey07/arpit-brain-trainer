/**
 * LISTER AGENT — Lists templates on Etsy
 *
 * This agent:
 *   1. Listens for "template-built" from Builder
 *   2. Checks if ETSY_API_KEY exists
 *   3. Runs the moneymaker list pipeline
 *   4. Publishes "template-listed" on success
 *   5. If listing fails, asks Optimizer for SEO improvements first
 */

import { Agent } from '../agent.js';
import { execSync } from 'child_process';
import { log, logError } from '../../logger.js';
import 'dotenv/config';

const MONEYMAKER_PATH = process.env.MONEYMAKER_PATH || '/home/ec2-user/adarsh-moneymaker';

export class ListerAgent extends Agent {
  constructor(config) {
    super(config);
    this.templateId = config.templateId;
    this.newlyBuilt = [];

    // Listen for freshly built templates from Builder agent
    this.bus.subscribe(this.id, 'template-built', (msg) => {
      log(`[A2A:Lister] Builder just built: ${msg.data.templateId}`);
      this.newlyBuilt.push(msg.data.templateId);
    });

    // Listen for mockup readiness
    this.bus.subscribe(this.id, 'mockups-ready', (msg) => {
      log(`[A2A:Lister] Mockups ready for: ${msg.data.templateId}`);
    });
  }

  async plan() {
    if (!process.env.ETSY_API_KEY) {
      return `skip — ETSY_API_KEY not set. Cannot list anything.`;
    }

    const template = this.catalog.find(t => t.id === this.templateId);
    if (!template) return `skip — template ${this.templateId} not found`;
    if (template.status === 'live') return `skip — ${this.templateId} already live`;
    if (!template.copyLink) return `skip — ${this.templateId} not built yet`;

    return `list ${this.templateId} on Etsy`;
  }

  async execute(plan) {
    if (plan.startsWith('skip')) {
      // If Etsy key missing, communicate this to all agents
      if (plan.includes('ETSY_API_KEY')) {
        this.bus.broadcast(this.id, {
          type: 'blocker',
          blocker: 'etsy-api-missing',
          message: 'Cannot list — ETSY_API_KEY not configured',
        });
      }
      return { success: true, action: 'skip', output: plan };
    }

    try {
      // First ask Optimizer if it has SEO suggestions for this template
      const optimizerSuggestion = this.getShared(`seo-suggestions-${this.templateId}`);
      if (optimizerSuggestion) {
        log(`[A2A:Lister] Using Optimizer's SEO suggestions for ${this.templateId}`);
      }

      const cmd = `cd "${MONEYMAKER_PATH}" && node src/pipeline/runner.js list ${this.templateId}`;
      log(`[A2A:Lister] Executing: ${cmd}`);

      const output = execSync(cmd, {
        timeout: 300000,
        encoding: 'utf-8',
        env: { ...process.env, PATH: process.env.PATH },
      });

      this.addFinding('template-listed', {
        templateId: this.templateId,
        status: 'live',
        message: `${this.templateId} is NOW LIVE on Etsy!`,
      });

      return {
        success: true,
        action: `list:${this.templateId}`,
        output: `LISTED! ${this.templateId} is live on Etsy!`,
      };

    } catch (err) {
      logError(`[A2A:Lister] Listing failed: ${err.message}`);

      this.bus.broadcast(this.id, {
        type: 'listing-failed',
        templateId: this.templateId,
        error: err.message,
      });

      return {
        success: false,
        action: `list:${this.templateId}`,
        output: err.stderr || err.message,
      };
    }
  }
}
