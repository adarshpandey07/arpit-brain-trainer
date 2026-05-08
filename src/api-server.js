/**
 * API Server — REST endpoints for dashboard at adarshpandey.co.in
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { log, logError } from './logger.js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.API_PORT || '3000', 10);

export async function startApiServer() {
  const app = express();

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'alive', version: '2.0.0', uptime: process.uptime() });
  });

  // Brain state
  app.get('/api/state', (req, res) => {
    try {
      const state = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'memory', 'state.json'), 'utf-8'));
      res.json(state);
    } catch { res.json({}); }
  });

  // Catalog
  app.get('/api/catalog', (req, res) => {
    try {
      const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'templates-full.json'), 'utf-8'));
      res.json(catalog);
    } catch { res.json([]); }
  });

  // Recent cycles
  app.get('/api/cycles', (req, res) => {
    try {
      const dir = path.join(__dirname, '..', 'memory', 'cycle-history');
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .sort().reverse()
        .slice(0, 20);

      const cycles = files.map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { return null; }
      }).filter(Boolean);

      res.json(cycles);
    } catch { res.json([]); }
  });

  // Learnings
  app.get('/api/learnings', (req, res) => {
    try {
      const learnings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'memory', 'learnings.json'), 'utf-8'));
      res.json(learnings);
    } catch { res.json([]); }
  });

  // Weekly progress
  app.get('/api/weekly', (req, res) => {
    try {
      const weekly = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'memory', 'weekly-goals.json'), 'utf-8'));
      res.json(weekly);
    } catch { res.json({ weeks: {} }); }
  });

  // Settings
  app.get('/api/settings', (req, res) => {
    try {
      const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'settings.json'), 'utf-8'));
      res.json(settings);
    } catch { res.json({}); }
  });

  // Blockers
  app.get('/api/blockers', (req, res) => {
    try {
      const blockers = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'memory', 'blockers.json'), 'utf-8'));
      res.json(blockers);
    } catch { res.json([]); }
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      log(`[API] Server running on port ${PORT}`);
      resolve(server);
    });

    server.on('error', async (err) => {
      if (err.code === 'EADDRINUSE') {
        log(`[API] Port ${PORT} in use — killing old process and retrying...`);
        try {
          execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
          await new Promise(r => setTimeout(r, 1000));

          const retryServer = app.listen(PORT, () => {
            log(`[API] Server running on port ${PORT} (after retry)`);
            resolve(retryServer);
          });
          retryServer.on('error', (retryErr) => {
            logError(`[API] Retry failed: ${retryErr.message}`);
            reject(retryErr);
          });
        } catch (killErr) {
          logError(`[API] Could not free port ${PORT}: ${killErr.message}`);
          reject(err);
        }
      } else {
        reject(err);
      }
    });
  });
}
