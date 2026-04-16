/**
 * Template Loader — Syncs brain's master catalog to moneymaker
 *
 * The brain knows about all 20 templates. This module ensures
 * the moneymaker repo's catalog has all of them so the pipeline
 * can build any template the brain decides to work on.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './logger.js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_CATALOG = path.join(__dirname, '..', 'config', 'templates-full.json');
const MONEYMAKER_PATH = process.env.MONEYMAKER_PATH || path.join(__dirname, '..', '..', 'adarsh-moneymaker');
const MM_CATALOG = path.join(MONEYMAKER_PATH, 'config', 'templates.json');

export function syncTemplates() {
  if (!fs.existsSync(BRAIN_CATALOG)) {
    log('[TemplateLoader] Brain catalog not found');
    return;
  }

  const brainTemplates = JSON.parse(fs.readFileSync(BRAIN_CATALOG, 'utf-8'));

  if (!fs.existsSync(path.dirname(MM_CATALOG))) {
    log('[TemplateLoader] Moneymaker config dir not found — skipping sync');
    return;
  }

  let mmTemplates = [];
  if (fs.existsSync(MM_CATALOG)) {
    mmTemplates = JSON.parse(fs.readFileSync(MM_CATALOG, 'utf-8'));
  }

  let added = 0;
  let updated = 0;

  for (const brainT of brainTemplates) {
    const existing = mmTemplates.find(t => t.id === brainT.id);

    if (!existing) {
      // Add new template to moneymaker (strip brain-only fields)
      mmTemplates.push({
        id: brainT.id,
        name: brainT.name,
        status: brainT.status,
        price: brainT.price,
        sheetId: brainT.sheetId,
        copyLink: brainT.copyLink,
        etsyListingId: brainT.etsyListingId,
        title: brainT.title,
        tags: brainT.tags,
      });
      added++;
    } else {
      // Sync status back from moneymaker to brain (moneymaker is truth for built/live)
      if (existing.sheetId && !brainT.sheetId) {
        brainT.sheetId = existing.sheetId;
        brainT.copyLink = existing.copyLink;
        if (brainT.status === 'planned') brainT.status = 'built';
        updated++;
      }
      if (existing.etsyListingId && !brainT.etsyListingId) {
        brainT.etsyListingId = existing.etsyListingId;
        brainT.status = 'live';
        updated++;
      }
    }
  }

  // Save both catalogs
  fs.writeFileSync(MM_CATALOG, JSON.stringify(mmTemplates, null, 2));
  fs.writeFileSync(BRAIN_CATALOG, JSON.stringify(brainTemplates, null, 2));

  log(`[TemplateLoader] Synced: ${added} added, ${updated} updated. Total: ${mmTemplates.length} in moneymaker`);
}
