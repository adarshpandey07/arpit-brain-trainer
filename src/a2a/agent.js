/**
 * BASE AGENT — The DNA of every A2A agent
 *
 * Every agent in Arpit's brain inherits from this.
 * An agent is a self-contained intelligence with:
 *   - A ROLE (what it's good at)
 *   - A GOAL (what it wants to achieve this cycle)
 *   - ACCESS to the message bus (talk to other agents)
 *   - CLAUDE access (think deeply)
 *   - LIFECYCLE: spawn → plan → execute → report → die
 *
 * Agents are SHORT-LIVED — spawned per cycle, do their work, share
 * findings with other agents, then die. The brain remembers everything.
 */

import { log, logError } from '../logger.js';

// Agent states
export const AgentState = {
  IDLE: 'idle',
  PLANNING: 'planning',
  RUNNING: 'running',
  WAITING: 'waiting',      // waiting for another agent
  COMMUNICATING: 'communicating',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export class Agent {
  constructor({ id, role, goal, bus, claudeFn, catalog, memory }) {
    this.id = id;
    this.role = role;
    this.goal = goal;
    this.bus = bus;
    this.askClaude = claudeFn;
    this.catalog = catalog;
    this.memory = memory;

    this.state = AgentState.IDLE;
    this.result = null;
    this.findings = [];      // What this agent discovered
    this.messagesReceived = [];
    this.startTime = null;
    this.endTime = null;

    // Register on bus
    this.bus.registerAgent(this);

    // Listen for direct messages
    this.bus.onDirectMessage(this.id, (msg) => {
      this.messagesReceived.push(msg);
      this._onMessage(msg);
    });

    // Listen for broadcasts
    this.bus.onBroadcast(this.id, (msg) => {
      this.messagesReceived.push(msg);
      this._onBroadcast(msg);
    });
  }

  // ─── LIFECYCLE ────────────────────────────────────────────────────

  async run() {
    this.startTime = Date.now();
    this.state = AgentState.PLANNING;
    log(`[A2A:${this.id}] Starting — role: ${this.role}, goal: ${this.goal}`);

    try {
      // Step 1: Plan
      const plan = await this.plan();
      log(`[A2A:${this.id}] Plan: ${plan}`);

      // Step 2: Execute
      this.state = AgentState.RUNNING;
      this.result = await this.execute(plan);

      // Step 3: Share findings with other agents
      this.state = AgentState.COMMUNICATING;
      await this.shareFindings();

      // Step 4: Done
      this.state = AgentState.COMPLETED;
      this.endTime = Date.now();
      log(`[A2A:${this.id}] Completed in ${this.endTime - this.startTime}ms`);

      return this.getReport();

    } catch (err) {
      this.state = AgentState.FAILED;
      this.endTime = Date.now();
      logError(`[A2A:${this.id}] Failed: ${err.message}`);

      // Broadcast failure so other agents can adapt
      this.bus.broadcast(this.id, {
        type: 'agent-failed',
        agentId: this.id,
        role: this.role,
        error: err.message,
      });

      return {
        agentId: this.id,
        role: this.role,
        state: AgentState.FAILED,
        error: err.message,
        durationMs: this.endTime - this.startTime,
      };
    }
  }

  // ─── Override these in specialized agents ──────────────────────────

  /** Decide what to do (override in subclass) */
  async plan() {
    return 'default plan';
  }

  /** Do the actual work (override in subclass) */
  async execute(plan) {
    return { success: true, output: 'no-op' };
  }

  /** Share discoveries with other agents (override if needed) */
  async shareFindings() {
    if (this.findings.length > 0) {
      for (const finding of this.findings) {
        this.bus.publish(this.id, finding.topic || 'discovery', finding);
      }
    }
  }

  /** Handle incoming direct message (override if needed) */
  _onMessage(msg) {
    log(`[A2A:${this.id}] Received DM from ${msg.from}: ${JSON.stringify(msg.data).slice(0, 80)}`);

    // Handle request/reply
    if (msg.type === 'request' && msg.replyTo) {
      this.handleRequest(msg).then(response => {
        this.bus.reply(this.id, msg.replyTo, response);
      });
    }
  }

  /** Handle incoming broadcast (override if needed) */
  _onBroadcast(msg) {
    // Default: log and ignore
  }

  /** Handle a request from another agent (override for specific behavior) */
  async handleRequest(msg) {
    return { acknowledged: true, from: this.id };
  }

  // ─── Helper: Add a finding to share ───────────────────────────────

  addFinding(topic, data) {
    this.findings.push({ topic, ...data, foundBy: this.id, foundAt: new Date().toISOString() });
  }

  // ─── Helper: Ask another agent something ──────────────────────────

  async askAgent(targetAgentId, question) {
    try {
      return await this.bus.request(this.id, targetAgentId, question, 30000);
    } catch (err) {
      log(`[A2A:${this.id}] No response from ${targetAgentId}: ${err.message}`);
      return null;
    }
  }

  // ─── Helper: Write to shared memory ───────────────────────────────

  setShared(key, value) {
    this.bus.setShared(key, value, this.id);
  }

  getShared(key) {
    return this.bus.getShared(key);
  }

  // ─── Report ───────────────────────────────────────────────────────

  getReport() {
    return {
      agentId: this.id,
      role: this.role,
      goal: this.goal,
      state: this.state,
      result: this.result,
      findings: this.findings,
      messagesReceived: this.messagesReceived.length,
      durationMs: this.endTime ? this.endTime - this.startTime : null,
    };
  }

  // ─── Cleanup ──────────────────────────────────────────────────────

  destroy() {
    this.bus.unregisterAgent(this.id);
  }
}
