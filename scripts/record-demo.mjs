import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

// Timeline definition matching the user's audio:
// Act 1: 00:00 - 00:41 (41s)
// Act 2: 00:41 - 01:20 (39s)
// Act 3: 01:20 - 02:21 (61s)
// Act 4: 02:21 - 03:36 (75s)
// Act 5 + 6: 03:36 - 04:48 (72s)
// Total: 288 seconds (04:48)

const OUT_DIR = path.resolve('demo-recording');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function smoothMove(page, targetX, targetY, durationMs = 800) {
  await page.evaluate(
    ({ x, y, duration }) => {
      let cursor = document.getElementById('demo-virtual-cursor');
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'demo-virtual-cursor';
        cursor.style.position = 'fixed';
        cursor.style.width = '24px';
        cursor.style.height = '24px';
        cursor.style.backgroundImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='%2338bdf8' stroke='%230284c7' stroke-width='1.5'%3E%3Cpath d='M3 3l7 18 3-7 7-3L3 3z'/%3E%3C/svg%3E")`;
        cursor.style.backgroundSize = 'contain';
        cursor.style.backgroundRepeat = 'no-repeat';
        cursor.style.zIndex = '999999';
        cursor.style.pointerEvents = 'none';
        cursor.style.transition = `left ${duration}ms cubic-bezier(0.25, 1, 0.5, 1), top ${duration}ms cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s ease`;
        cursor.style.transform = 'scale(1)';
        cursor.style.left = '500px';
        cursor.style.top = '300px';
        document.body.appendChild(cursor);
      } else {
        cursor.style.transition = `left ${duration}ms cubic-bezier(0.25, 1, 0.5, 1), top ${duration}ms cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s ease`;
      }
      cursor.style.left = `${x}px`;
      cursor.style.top = `${y}px`;
    },
    { x: targetX, y: targetY, duration: durationMs }
  );
  await sleep(durationMs);
}

async function cursorClickEffect(page) {
  await page.evaluate(() => {
    const cursor = document.getElementById('demo-virtual-cursor');
    if (cursor) {
      cursor.style.transform = 'scale(0.85)';
      setTimeout(() => {
        cursor.style.transform = 'scale(1)';
      }, 150);
    }
  });
}

async function moveAndClick(page, selector, durationMs = 800) {
  const el = await page.$(selector);
  if (!el) {
    console.log(`Element not found: ${selector}`);
    return;
  }
  const box = await el.boundingBox();
  if (box) {
    const cx = Math.round(box.x + box.width / 2);
    const cy = Math.round(box.y + box.height / 2);
    await smoothMove(page, cx, cy, durationMs);
    await cursorClickEffect(page);
    await el.click();
    await sleep(200);
  }
}

async function run() {
  console.log('Launching browser with 1920x1080 recording...');
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  console.log('Setting up demo state...');
  await page.goto('http://localhost:5173/#account');
  await page.waitForLoadState('networkidle');

  // Trigger one-click demo setup if not already active
  const setupBtn = await page.$('button:has-text("One-click demo setup")');
  if (setupBtn) {
    console.log('Clicking One-click demo setup...');
    await setupBtn.click();
    await sleep(1500);
  }

  // Set dark theme
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  console.log('=== STARTING RECORDING AT 00:00 ===');
  const startTime = Date.now();

  const syncWait = async (targetSec) => {
    const elapsed = (Date.now() - startTime) / 1000;
    const remainMs = Math.round((targetSec - elapsed) * 1000);
    if (remainMs > 0) {
      console.log(`[${Math.round(elapsed)}s] Waiting ${remainMs}ms until target ${targetSec}s...`);
      await sleep(remainMs);
    }
  };

  // --- ACT 1: 00:00 - 00:41 (41s) ---
  console.log('Act 1: Dashboard overview (0:00 - 0:41)');
  await page.goto('http://localhost:5173/#dashboard');
  await page.waitForTimeout(1000);
  await smoothMove(page, 960, 200, 1000);

  // Pan across portfolio and gauges
  await sleep(10000);
  await smoothMove(page, 550, 360, 1200); // Point to health factor gauge
  await sleep(12000);
  await smoothMove(page, 800, 480, 1200); // Point to positions table
  await sleep(10000);
  await smoothMove(page, 200, 50, 1000); // Point to brand logo "The AI proposes, code decides"
  await syncWait(41);

  // --- ACT 2: 00:41 - 01:20 (39s) ---
  console.log('Act 2: Architecture & Account Abstraction (0:41 - 1:20)');
  // Hover over session active badge in header
  await smoothMove(page, 1600, 45, 1000);
  await sleep(9000);

  // Switch to Account tab
  await page.keyboard.press('5');
  await sleep(1500);
  await smoothMove(page, 600, 300, 1000); // Hover over session key details
  await sleep(12000);
  await smoothMove(page, 1100, 320, 1000); // Hover over allowed selectors & spending caps
  await sleep(10000);
  await smoothMove(page, 600, 600, 1000); // Hover over policy details

  // Return to Dashboard ready for Crash
  await page.keyboard.press('1');
  await sleep(1000);
  await syncWait(80);

  // --- ACT 3: 01:20 - 02:21 (61s) ---
  console.log('Act 3: Crash Demo & Liquidation Rescue (1:20 - 2:21)');
  // Turn on Live mode in header
  await moveAndClick(page, 'button:has-text("Run")', 800);
  await sleep(5000);

  // Go to Lab tab
  await page.keyboard.press('6');
  await sleep(1500);
  await smoothMove(page, 600, 280, 1000); // Point to Demo scripts card
  await sleep(8000);

  // Click -40% crash button
  console.log('Triggering -40% crash...');
  await moveAndClick(page, 'button:has-text("−40%")', 1000);
  await sleep(1500);

  // Jump to Dashboard immediately to observe rescue
  await page.keyboard.press('1');
  await sleep(1000);

  // Point to health factor gauge as price crashes
  await smoothMove(page, 550, 360, 1000);
  await sleep(15000); // Watching sentinel rescue toast & recovery

  // Point to protected loan at 1.40
  await smoothMove(page, 800, 440, 1000);
  await sleep(15000);

  // Point to benchmark loan showing liquidation
  await smoothMove(page, 800, 520, 1000);
  await syncWait(141);

  // --- ACT 4: 02:21 - 03:36 (75s) ---
  console.log('Act 4: Natural Intent, Attack Block & Yield (2:21 - 3:36)');
  // Switch to Agent tab
  await page.keyboard.press('2');
  await sleep(2000);

  // Click a normal prompt chip
  const normalChip = await page.$('button.chip:not(:has-text("attack"))');
  if (normalChip) {
    const box = await normalChip.boundingBox();
    if (box) {
      await smoothMove(page, box.x + box.width / 2, box.y + box.height / 2, 800);
      await cursorClickEffect(page);
      await normalChip.click();
    }
  }
  await sleep(15000);

  // THE DIFFERENTIATOR: Click "⚡ Try an attack (prompt injection)"
  console.log('Triggering "Try an attack" chip...');
  const attackChip = await page.$('button.chip:has-text("Try an attack")');
  if (attackChip) {
    const box = await attackChip.boundingBox();
    if (box) {
      await smoothMove(page, box.x + box.width / 2, box.y + box.height / 2, 1000);
      await cursorClickEffect(page);
      await attackChip.click();
    }
  } else {
    await moveAndClick(page, 'button:has-text("attack")', 1000);
  }

  // Hover over the red firewall block message
  await sleep(2000);
  await smoothMove(page, 550, 750, 800);
  await sleep(18000);

  // Switch to Yield tab
  await page.keyboard.press('3');
  await sleep(2000);
  await smoothMove(page, 700, 350, 1000); // Point to DeFiLlama pools
  await sleep(14000);

  // Switch to Activity tab
  await page.keyboard.press('4');
  await sleep(2000);
  await smoothMove(page, 600, 400, 1000); // Point to audit rules
  await syncWait(216);

  // --- ACT 5 + 6: 03:36 - 04:48 (72s) ---
  console.log('Act 5 + 6: Fault Injection, Adversarial Suite & Closing (3:36 - 4:48)');
  // Switch to Lab tab
  await page.keyboard.press('6');
  await sleep(2000);

  // Scroll down to Fault Injection
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  await sleep(1000);

  // Toggle Sequencer down
  const toggle = await page.$('label.check:has-text("Sequencer down") input');
  if (toggle) {
    await toggle.click();
  }
  await sleep(12000);

  // Click Run suite in adversarial tests
  const runSuiteBtn = await page.$('button:has-text("Run suite")');
  if (runSuiteBtn) {
    const box = await runSuiteBtn.boundingBox();
    if (box) {
      await smoothMove(page, box.x + box.width / 2, box.y + box.height / 2, 1000);
      await cursorClickEffect(page);
      await runSuiteBtn.click();
    }
  }
  await sleep(18000);

  // Point to Emergency stop in header
  await smoothMove(page, 1830, 45, 1200);
  await sleep(10000);

  // Return to Dashboard for final wrap-up
  await page.keyboard.press('1');
  await sleep(2000);
  await smoothMove(page, 960, 400, 1000);

  // Hold smoothly until 4:48 mark
  await syncWait(288);

  console.log('=== DEMO RECORDING FINISHED AT 04:48 ===');
  await page.close();
  await context.close();
  await browser.close();

  // Find the generated video file
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm'));
  if (files.length > 0) {
    console.log(`Video recorded successfully: ${path.join(OUT_DIR, files[0])}`);
  }
}

run().catch((err) => {
  console.error('Recording error:', err);
  process.exit(1);
});
