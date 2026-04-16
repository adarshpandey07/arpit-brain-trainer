/**
 * Logger — Timestamped console logging
 */

export function log(message) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${message}`);
}

export function logError(message) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] ❌ ${message}`);
}
