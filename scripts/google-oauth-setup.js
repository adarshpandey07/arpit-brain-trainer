#!/usr/bin/env node

/**
 * Google OAuth Setup for Arpit Brain
 *
 * Usage:
 *   node scripts/google-oauth-setup.js --csv /path/to/credentials.csv
 *   node scripts/google-oauth-setup.js --client-id XXX --client-secret YYY
 *
 * This script:
 *   1. Reads OAuth client credentials (from CSV or flags)
 *   2. Opens browser for Google consent (arpitpandey19191@gmail.com)
 *   3. Gets refresh_token
 *   4. Saves everything to config/google-credentials.json
 *   5. Updates .claude/settings.json with real values
 *   6. Updates .env with the credentials
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ─── Parse Args ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
let clientId = null;
let clientSecret = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--csv' && args[i + 1]) {
    const csvContent = fs.readFileSync(args[i + 1], 'utf-8');
    const parsed = parseCSV(csvContent);
    clientId = parsed.clientId;
    clientSecret = parsed.clientSecret;
    i++;
  } else if (args[i] === '--client-id' && args[i + 1]) {
    clientId = args[i + 1];
    i++;
  } else if (args[i] === '--client-secret' && args[i + 1]) {
    clientSecret = args[i + 1];
    i++;
  }
}

if (!clientId || !clientSecret) {
  console.error(`
  Google OAuth Setup for Arpit Brain
  ===================================

  Usage:
    node scripts/google-oauth-setup.js --csv /path/to/credentials.csv
    node scripts/google-oauth-setup.js --client-id YOUR_ID --client-secret YOUR_SECRET

  The CSV file should be the one downloaded from Google Cloud Console:
    Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs > Download CSV

  Make sure you have enabled these APIs in your Google Cloud project:
    - Gmail API
    - Google Drive API
    - Google Sheets API
  `);
  process.exit(1);
}

console.log('\n  Google OAuth Setup for Arpit Brain');
console.log('  ===================================\n');
console.log(`  Client ID: ${clientId.slice(0, 20)}...`);
console.log(`  Account: arpitpandey19191@gmail.com\n`);

// ─── OAuth Flow ─────────────────────────────────────────────────────

const REDIRECT_URI = 'http://localhost:9876/oauth/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(clientId)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent` +
  `&login_hint=arpitpandey19191@gmail.com`;

console.log('  Opening browser for Google consent...\n');
console.log(`  If browser doesn't open, go to:\n  ${authUrl}\n`);

// Open browser
const openCmd = process.platform === 'darwin' ? 'open' :
  process.platform === 'win32' ? 'start' : 'xdg-open';
exec(`${openCmd} "${authUrl}"`);

// ─── Local callback server ──────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:9876');

  if (url.pathname === '/oauth/callback') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>OAuth Failed</h1><p>${error}</p>`);
      console.error(`  OAuth error: ${error}`);
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>No auth code received</h1>');
      return;
    }

    console.log('  Authorization code received! Exchanging for tokens...\n');

    try {
      const tokens = await exchangeCode(code);

      // Save credentials
      const credentials = {
        clientId,
        clientSecret,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000),
        email: 'arpitpandey19191@gmail.com',
        scopes: SCOPES.split(' '),
        createdAt: new Date().toISOString(),
      };

      const credPath = path.join(ROOT, 'config', 'google-credentials.json');
      fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2));
      console.log(`  Credentials saved to: config/google-credentials.json`);

      // Update .claude/settings.json
      updateClaudeSettings(credentials);
      console.log('  Updated: .claude/settings.json');

      // Update .env
      updateEnvFile(credentials);
      console.log('  Updated: .env');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
        <body style="font-family: monospace; padding: 40px; background: #0a0a0a; color: #00ff00;">
          <h1>ARPIT BRAIN — Google OAuth Complete!</h1>
          <p>Account: arpitpandey19191@gmail.com</p>
          <p>Refresh token saved.</p>
          <p>Scopes: Gmail (read/send), Drive, Sheets</p>
          <br>
          <p>You can close this window.</p>
        </body>
        </html>
      `);

      console.log('\n  ===================================');
      console.log('  OAuth setup COMPLETE!');
      console.log('  ===================================');
      console.log(`  Email: arpitpandey19191@gmail.com`);
      console.log(`  Refresh Token: ${tokens.refresh_token?.slice(0, 20)}...`);
      console.log(`  Scopes: Gmail, Drive, Sheets`);
      console.log('\n  Next: Deploy to EC2 with:');
      console.log('  scp config/google-credentials.json ec2-user@13.203.99.103:/home/ec2-user/arpit-brain-trainer/config/');
      console.log('');

      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 1000);

    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Token exchange failed</h1><p>${err.message}</p>`);
      console.error(`  Token exchange failed: ${err.message}`);
      process.exit(1);
    }
  }
});

server.listen(9876, () => {
  console.log('  Waiting for OAuth callback on localhost:9876...\n');
});

// ─── Helpers ────────────────────────────────────────────────────────

function parseCSV(content) {
  const lines = content.trim().split('\n');
  // Google Cloud CSV format: first line is headers, second line is values
  // Headers: client_id,project_id,auth_uri,token_uri,... OR just client_id,client_secret

  if (lines.length < 2) {
    // Try JSON format (credentials.json download)
    try {
      const json = JSON.parse(content);
      const creds = json.installed || json.web || json;
      return { clientId: creds.client_id, clientSecret: creds.client_secret };
    } catch {}
    throw new Error('Cannot parse credentials file');
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const values = lines[1].split(',').map(v => v.trim());

  const idIdx = headers.findIndex(h => h.includes('client_id') || h.includes('client id'));
  const secretIdx = headers.findIndex(h => h.includes('client_secret') || h.includes('secret'));

  if (idIdx === -1 || secretIdx === -1) {
    // Fallback: try positional (some CSVs have id in col 1, secret in col 2)
    if (values.length >= 2 && values[0].includes('.apps.googleusercontent.com')) {
      return { clientId: values[0], clientSecret: values[1] };
    }
    throw new Error('Cannot find client_id and client_secret in CSV headers');
  }

  return { clientId: values[idIdx], clientSecret: values[secretIdx] };
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${err}`);
  }

  return response.json();
}

function updateClaudeSettings(creds) {
  const settingsPath = path.join(ROOT, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

  for (const serverName of Object.keys(settings.mcpServers)) {
    const env = settings.mcpServers[serverName].env;
    if (env) {
      env.GOOGLE_CLIENT_ID = creds.clientId;
      env.GOOGLE_CLIENT_SECRET = creds.clientSecret;
      env.GOOGLE_REFRESH_TOKEN = creds.refreshToken;
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function updateEnvFile(creds) {
  const envPath = path.join(ROOT, '.env');
  let envContent = '';
  try { envContent = fs.readFileSync(envPath, 'utf-8'); } catch {}

  const envVars = {
    GOOGLE_CLIENT_ID: creds.clientId,
    GOOGLE_CLIENT_SECRET: creds.clientSecret,
    GOOGLE_REFRESH_TOKEN: creds.refreshToken,
  };

  for (const [key, value] of Object.entries(envVars)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n');
}
