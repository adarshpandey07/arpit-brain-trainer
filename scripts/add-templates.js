#!/usr/bin/env node
/**
 * Add all 20 templates to moneymaker catalog
 * Run: node scripts/add-templates.js
 */

import { syncTemplates } from '../src/template-loader.js';

console.log('📦 Syncing all 20 templates to moneymaker catalog...\n');
syncTemplates();
console.log('\n✅ Done!');
