/**
 * Claude Interface — Talks to Claude Code CLI using Max auth
 * Uses `claude -p` (print mode) for non-interactive one-shot prompts.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { log, logError } from './logger.js';
import 'dotenv/config';

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const MAX_RETRIES = 2;
const TIMEOUT_MS = 180000; // 3 minutes (extended for god mode deep thinking)

export async function askClaude(prompt, options = {}) {
  const { retries = MAX_RETRIES, timeout = TIMEOUT_MS } = options;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      log(`[Claude] Asking (attempt ${attempt}, ${prompt.length} chars)...`);

      const tmpFile = `/tmp/claude-prompt-${Date.now()}.txt`;
      fs.writeFileSync(tmpFile, prompt);

      const cmd = `cat "${tmpFile}" | ${CLAUDE_BIN} -p --output-format text 2>/dev/null`;

      const response = execSync(cmd, {
        timeout,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PATH: process.env.PATH },
      });

      try { fs.unlinkSync(tmpFile); } catch {}

      const trimmed = response.trim();
      if (!trimmed) throw new Error('Empty response');

      log(`[Claude] Response: ${trimmed.length} chars`);
      return trimmed;

    } catch (err) {
      logError(`[Claude] Attempt ${attempt} failed: ${err.message}`);

      if (attempt > retries) {
        logError('[Claude] All attempts exhausted');
        return JSON.stringify({
          action: 'idle',
          reasoning: 'Claude unavailable — resting until next cycle',
          learning: 'Claude CLI was unreachable. Check Max subscription and CLI auth on EC2.',
          selfReflection: 'Cannot function without Claude. This is a critical dependency.',
          strategyEvolution: null,
          urgencyLevel: 'critical',
        });
      }

      await new Promise(r => setTimeout(r, 5000));
    }
  }
}
