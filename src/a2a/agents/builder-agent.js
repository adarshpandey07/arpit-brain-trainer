/**
 * BUILDER AGENT — Builds Google Sheet templates
 *
 * This agent:
 *   1. Checks what the Researcher found (via message bus)
 *   2. Runs the moneymaker build pipeline
 *   3. Publishes "template-built" so Lister can pick it up
 *   4. If build fails, broadcasts failure so others adapt
 */

import { Agent } from '../agent.js';
import { execSync } from 'child_process';
import { log, logError } from '../../logger.js';
import 'dotenv/config';

const MONEYMAKER_PATH = process.env.MONEYMAKER_PATH || '/home/ec2-user/adarsh-moneymaker';

export class BuilderAgent extends Agent {
  constructor(config) {
    super(config);
    this.templateId = config.templateId;

    // Listen for researcher discoveries — maybe build what's trending
    this.bus.subscribe(this.id, 'trending-niche', (msg) => {
      log(`[A2A:Builder] Got trending niche from researcher: ${JSON.stringify(msg.data).slice(0, 100)}`);
      this.setShared('trending-niches', msg.data);
    });
  }

  async plan() {
    const template = this.catalog.find(t => t.id === this.templateId);
    if (!template) return `skip — template ${this.templateId} not found`;
    if (template.status !== 'planned') return `skip — ${this.templateId} already ${template.status}`;
    return `build ${this.templateId} (${template.name}) via moneymaker pipeline`;
  }

  async execute(plan) {
    if (plan.startsWith('skip')) {
      return { success: true, action: 'skip', output: plan };
    }

    try {
      const cmd = `cd "${MONEYMAKER_PATH}" && node src/pipeline/runner.js build ${this.templateId}`;
      log(`[A2A:Builder] Executing: ${cmd}`);

      const output = execSync(cmd, {
        timeout: 300000,
        encoding: 'utf-8',
        env: { ...process.env, PATH: process.env.PATH },
      });

      log(`[A2A:Builder] Build output: ${output.slice(0, 200)}`);

      // Publish success — Lister agent can pick this up
      this.addFinding('template-built', {
        templateId: this.templateId,
        status: 'built',
        message: `${this.templateId} built successfully`,
      });

      // Also generate mockups immediately
      try {
        const mockupCmd = `cd "${MONEYMAKER_PATH}" && node src/pipeline/runner.js mockups ${this.templateId}`;
        const mockupOutput = execSync(mockupCmd, {
          timeout: 300000,
          encoding: 'utf-8',
          env: { ...process.env, PATH: process.env.PATH },
        });

        this.addFinding('mockups-ready', {
          templateId: this.templateId,
          message: `Mockups generated for ${this.templateId}`,
        });

        return {
          success: true,
          action: `build+mockups:${this.templateId}`,
          output: `Built and mockups ready: ${this.templateId}`,
        };
      } catch (mockupErr) {
        return {
          success: true,
          action: `build:${this.templateId}`,
          output: `Built (mockups failed: ${mockupErr.message})`,
        };
      }

    } catch (err) {
      logError(`[A2A:Builder] Build failed: ${err.message}`);
      return {
        success: false,
        action: `build:${this.templateId}`,
        output: err.stderr || err.message,
      };
    }
  }
}
