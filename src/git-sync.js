/**
 * Git Sync — Auto-commit cycle results to brain repo
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, logError } from './logger.js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_PATH = process.env.BRAIN_PATH || path.join(__dirname, '..');

export async function pushBrainRepo(cycleId, action) {
  try {
    const cmd = [
      `cd "${BRAIN_PATH}"`,
      'git add memory/ config/',
      `git commit -m "cycle ${cycleId}: ${action}" --allow-empty`,
      'git push origin main 2>/dev/null || git push origin master 2>/dev/null || true',
    ].join(' && ');

    execSync(cmd, {
      timeout: 30000,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    log(`[Git] Pushed: ${cycleId}`);
  } catch (err) {
    logError(`[Git] Push failed: ${err.message}`);
  }
}
