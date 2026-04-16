/**
 * A2A MESSAGE BUS — Inter-Agent Communication
 *
 * This is the nervous system of the multi-agent brain.
 * Agents don't work in isolation — they TALK to each other.
 *
 * Communication patterns:
 *   1. PUBLISH/SUBSCRIBE — Agent publishes to a topic, all subscribers get it
 *   2. DIRECT MESSAGE — Agent sends to a specific agent by ID
 *   3. BROADCAST — Agent sends to ALL agents
 *   4. REQUEST/REPLY — Agent asks another agent and waits for response
 *   5. SHARED MEMORY — Agents can read/write to shared state
 *
 * Example flow:
 *   ResearcherAgent discovers "wedding budget" is trending
 *   → publishes to "discovery" topic
 *   → BuilderAgent subscribes to "discovery", picks it up
 *   → BuilderAgent builds the template, publishes to "built" topic
 *   → ListerAgent subscribes to "built", creates Etsy listing
 *
 * All messages are logged for brain learning.
 */

import { EventEmitter } from 'events';
import { log } from '../logger.js';

export class MessageBus {
  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
    this.messageLog = [];
    this.sharedMemory = {};
    this.agents = new Map(); // agentId → agent reference
  }

  // ─── Register an agent on the bus ─────────────────────────────────

  registerAgent(agent) {
    this.agents.set(agent.id, agent);
    log(`[A2A:Bus] Agent registered: ${agent.id} (${agent.role})`);
  }

  unregisterAgent(agentId) {
    this.agents.delete(agentId);
  }

  // ─── PUBLISH / SUBSCRIBE ──────────────────────────────────────────

  publish(fromAgentId, topic, data) {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: fromAgentId,
      topic,
      data,
      timestamp: new Date().toISOString(),
      type: 'publish',
    };

    this.messageLog.push(message);
    log(`[A2A:Bus] ${fromAgentId} → topic:${topic} | ${JSON.stringify(data).slice(0, 120)}`);

    this.emitter.emit(`topic:${topic}`, message);
    this.emitter.emit('*', message); // wildcard listeners
  }

  subscribe(agentId, topic, handler) {
    const wrappedHandler = (message) => {
      // Don't deliver to sender
      if (message.from === agentId) return;
      log(`[A2A:Bus] ${agentId} ← topic:${topic} from ${message.from}`);
      handler(message);
    };

    this.emitter.on(`topic:${topic}`, wrappedHandler);
    log(`[A2A:Bus] ${agentId} subscribed to topic:${topic}`);

    // Return unsubscribe function
    return () => this.emitter.off(`topic:${topic}`, wrappedHandler);
  }

  // ─── DIRECT MESSAGE ───────────────────────────────────────────────

  sendDirect(fromAgentId, toAgentId, data) {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: fromAgentId,
      to: toAgentId,
      data,
      timestamp: new Date().toISOString(),
      type: 'direct',
    };

    this.messageLog.push(message);
    log(`[A2A:Bus] ${fromAgentId} → ${toAgentId} (direct) | ${JSON.stringify(data).slice(0, 120)}`);

    this.emitter.emit(`direct:${toAgentId}`, message);
  }

  onDirectMessage(agentId, handler) {
    this.emitter.on(`direct:${agentId}`, handler);
  }

  // ─── BROADCAST ────────────────────────────────────────────────────

  broadcast(fromAgentId, data) {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: fromAgentId,
      data,
      timestamp: new Date().toISOString(),
      type: 'broadcast',
    };

    this.messageLog.push(message);
    log(`[A2A:Bus] ${fromAgentId} → BROADCAST | ${JSON.stringify(data).slice(0, 120)}`);

    this.emitter.emit('broadcast', message);
  }

  onBroadcast(agentId, handler) {
    const wrappedHandler = (message) => {
      if (message.from === agentId) return;
      handler(message);
    };
    this.emitter.on('broadcast', wrappedHandler);
  }

  // ─── REQUEST / REPLY ──────────────────────────────────────────────

  async request(fromAgentId, toAgentId, data, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const timer = setTimeout(() => {
        this.emitter.off(`reply:${requestId}`, replyHandler);
        reject(new Error(`Request to ${toAgentId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const replyHandler = (reply) => {
        clearTimeout(timer);
        resolve(reply.data);
      };

      this.emitter.once(`reply:${requestId}`, replyHandler);

      // Send the request
      const message = {
        id: requestId,
        from: fromAgentId,
        to: toAgentId,
        data,
        timestamp: new Date().toISOString(),
        type: 'request',
        replyTo: requestId,
      };

      this.messageLog.push(message);
      log(`[A2A:Bus] ${fromAgentId} → ${toAgentId} (request:${requestId})`);

      this.emitter.emit(`direct:${toAgentId}`, message);
    });
  }

  reply(agentId, requestId, data) {
    const message = {
      id: `reply-${Date.now()}`,
      from: agentId,
      data,
      timestamp: new Date().toISOString(),
      type: 'reply',
      inReplyTo: requestId,
    };

    this.messageLog.push(message);
    log(`[A2A:Bus] ${agentId} → reply:${requestId}`);

    this.emitter.emit(`reply:${requestId}`, message);
  }

  // ─── SHARED MEMORY ────────────────────────────────────────────────

  setShared(key, value, fromAgentId) {
    this.sharedMemory[key] = {
      value,
      setBy: fromAgentId,
      setAt: new Date().toISOString(),
    };
    log(`[A2A:SharedMem] ${fromAgentId} set "${key}"`);

    // Notify all agents about shared memory change
    this.emitter.emit('shared-memory-change', { key, value, from: fromAgentId });
  }

  getShared(key) {
    return this.sharedMemory[key]?.value ?? null;
  }

  getAllShared() {
    const result = {};
    for (const [key, entry] of Object.entries(this.sharedMemory)) {
      result[key] = entry.value;
    }
    return result;
  }

  onSharedMemoryChange(handler) {
    this.emitter.on('shared-memory-change', handler);
  }

  // ─── MESSAGE LOG (for brain learning) ─────────────────────────────

  getMessageLog() {
    return this.messageLog;
  }

  getMessageLogSummary() {
    const byType = {};
    const byAgent = {};

    for (const msg of this.messageLog) {
      byType[msg.type] = (byType[msg.type] || 0) + 1;
      byAgent[msg.from] = (byAgent[msg.from] || 0) + 1;
    }

    return {
      totalMessages: this.messageLog.length,
      byType,
      byAgent,
      sharedMemoryKeys: Object.keys(this.sharedMemory),
    };
  }

  // ─── Cleanup ──────────────────────────────────────────────────────

  destroy() {
    this.emitter.removeAllListeners();
    this.agents.clear();
    this.messageLog = [];
    this.sharedMemory = {};
  }
}
