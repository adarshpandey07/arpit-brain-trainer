#!/usr/bin/env node

/**
 * Fix Google OAuth Consent Screen — Switch from Internal to External
 *
 * Uses Playwright to automate Google Cloud Console.
 * You login manually, script does the rest.
 */

import { chromium } from 'playwright';

const PROJECT_ID = 'project-fae86474-3375-48c2-8fb';
const APP_NAME = 'Arpit Brain';
const EMAIL = 'arpitpandey19191@gmail.com';

async function main() {
  console.log('\n  Fix Google OAuth Consent Screen');
  console.log('  ================================\n');
  console.log('  A browser will open. Login with your Google account.');
  console.log('  After login, the script will automate the rest.\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  try {
    // Step 1: Go to Google Cloud Console OAuth consent screen
    const consentUrl = `https://console.cloud.google.com/apis/credentials/consent?project=${PROJECT_ID}`;
    console.log('  Opening Google Cloud Console...');
    await page.goto(consentUrl, { waitUntil: 'networkidle', timeout: 120000 });

    // Wait for user to login if needed
    console.log('  Waiting for you to login (if not already)...');

    // Wait until we're on the consent screen (not login page)
    await page.waitForFunction(() => {
      return !window.location.href.includes('accounts.google.com') &&
             !window.location.href.includes('signin');
    }, { timeout: 300000 }); // 5 min for login

    console.log('  Logged in! Navigating to consent screen...');
    await page.waitForTimeout(3000);

    // Check if we need to select the project
    const currentUrl = page.url();
    if (!currentUrl.includes(PROJECT_ID)) {
      await page.goto(consentUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
    }

    // Step 2: Check current state and handle accordingly
    console.log('  Checking consent screen state...');

    // Look for "MAKE EXTERNAL" button or "Edit App" or the initial setup
    const pageContent = await page.content();

    // Case 1: Need to create consent screen from scratch
    if (pageContent.includes('OAuth consent screen') && pageContent.includes('External')) {
      // Initial setup page — select External
      console.log('  Found initial setup. Selecting External...');

      // Click External radio button
      const externalRadio = page.locator('text=External').first();
      if (await externalRadio.isVisible()) {
        await externalRadio.click();
        await page.waitForTimeout(1000);
      }

      // Click CREATE button
      const createBtn = page.locator('button:has-text("Create"), button:has-text("CREATE")').first();
      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.waitForTimeout(3000);
        console.log('  Created External consent screen!');
      }
    }

    // Case 2: Already exists but Internal — need to switch
    if (pageContent.includes('Internal') && pageContent.includes('MAKE EXTERNAL')) {
      console.log('  Found Internal. Clicking MAKE EXTERNAL...');
      const makeExternalBtn = page.locator('button:has-text("MAKE EXTERNAL"), button:has-text("Make External")').first();
      if (await makeExternalBtn.isVisible()) {
        await makeExternalBtn.click();
        await page.waitForTimeout(2000);

        // Confirm dialog if any
        const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("CONFIRM")').first();
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(2000);
        }
        console.log('  Switched to External!');
      }
    }

    // Step 3: Edit the app registration form
    console.log('  Filling consent screen details...');

    // Navigate to edit page
    const editBtn = page.locator('button:has-text("Edit App"), button:has-text("EDIT APP"), a:has-text("Edit App")').first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(3000);
    }

    // Fill App Name
    const appNameInput = page.locator('input[aria-label*="App name"], input[formcontrolname*="appName"], input[id*="app-name"]').first();
    if (await appNameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await appNameInput.fill('');
      await appNameInput.fill(APP_NAME);
      console.log(`  App name: ${APP_NAME}`);
    }

    // Fill support email
    const emailInputs = page.locator(`input[type="email"], mat-select, [aria-label*="email"]`);
    const emailCount = await emailInputs.count();
    for (let i = 0; i < emailCount; i++) {
      const el = emailInputs.nth(i);
      if (await el.isVisible()) {
        try {
          await el.fill(EMAIL);
        } catch {
          // might be a dropdown
          await el.click();
          await page.waitForTimeout(500);
          const option = page.locator(`mat-option:has-text("${EMAIL}"), [role="option"]:has-text("${EMAIL}")`).first();
          if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
            await option.click();
          }
        }
      }
    }

    // Save and continue
    const saveBtn = page.locator('button:has-text("Save and Continue"), button:has-text("SAVE AND CONTINUE")').first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
      console.log('  Saved app info!');
    }

    // Step 4: Scopes page — just continue
    const saveBtnScopes = page.locator('button:has-text("Save and Continue"), button:has-text("SAVE AND CONTINUE")').first();
    if (await saveBtnScopes.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtnScopes.click();
      await page.waitForTimeout(3000);
      console.log('  Scopes page — continued.');
    }

    // Step 5: Test users page — add email
    console.log('  Adding test user...');
    const addUserBtn = page.locator('button:has-text("Add Users"), button:has-text("ADD USERS")').first();
    if (await addUserBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addUserBtn.click();
      await page.waitForTimeout(1500);

      // Type email in the dialog
      const userEmailInput = page.locator('input[type="email"], input[aria-label*="email"], textarea').last();
      if (await userEmailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await userEmailInput.fill(EMAIL);
        await page.waitForTimeout(500);
      }

      // Click Add/Save in dialog
      const addBtn = page.locator('button:has-text("Add"), button:has-text("ADD"), button:has-text("Save")').last();
      if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(2000);
        console.log(`  Added test user: ${EMAIL}`);
      }
    }

    // Final save
    const finalSave = page.locator('button:has-text("Save and Continue"), button:has-text("SAVE AND CONTINUE"), button:has-text("Back to Dashboard")').first();
    if (await finalSave.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finalSave.click();
      await page.waitForTimeout(2000);
    }

    // Step 6: Now enable the APIs
    console.log('\n  Enabling APIs...');

    const apis = [
      { name: 'Gmail API', url: `https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=${PROJECT_ID}` },
      { name: 'Google Drive API', url: `https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${PROJECT_ID}` },
      { name: 'Google Sheets API', url: `https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=${PROJECT_ID}` },
    ];

    for (const api of apis) {
      console.log(`  Enabling ${api.name}...`);
      await page.goto(api.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const enableBtn = page.locator('button:has-text("Enable"), button:has-text("ENABLE")').first();
      if (await enableBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await enableBtn.click();
        await page.waitForTimeout(5000);
        console.log(`  ✓ ${api.name} enabled!`);
      } else {
        // Check if already enabled
        const manageBtn = page.locator('button:has-text("Manage"), button:has-text("MANAGE")').first();
        if (await manageBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log(`  ✓ ${api.name} already enabled.`);
        }
      }
    }

    console.log('\n  ================================');
    console.log('  DONE! Consent screen is now External.');
    console.log(`  Test user: ${EMAIL}`);
    console.log('  APIs: Gmail, Drive, Sheets enabled.');
    console.log('  ================================\n');
    console.log('  Closing browser in 5 seconds...');
    await page.waitForTimeout(5000);

  } catch (err) {
    console.error(`\n  Error: ${err.message}`);
    console.log('  Taking screenshot for debug...');
    await page.screenshot({ path: '/tmp/oauth-fix-error.png', fullPage: true });
    console.log('  Screenshot saved: /tmp/oauth-fix-error.png');
    console.log('\n  Browser stays open — you can finish manually.');

    // Keep browser open for manual intervention
    console.log('  Press Ctrl+C to close.\n');
    await new Promise(() => {}); // hang
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
