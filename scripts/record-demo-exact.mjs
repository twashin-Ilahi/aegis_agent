import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Exact Audio Timestamps derived from uploaded .m4a files:
// Act 1 (uploaded_media_1): 41.620s   -> Ends at 41.62s
// Act 2 (uploaded_media_2): 39.892s   -> Ends at 81.51s
// Act 3 (uploaded_media_3): 61.716s   -> Ends at 143.23s
// Act 4 (uploaded_media_4): 74.964s   -> Ends at 218.19s
// Act 5+6 (uploaded_media_0): 72.425s -> Ends at 290.62s
// Total: ~290.62s (04:50.6)

const OUT_DIR = path.resolve('demo-recording');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function injectCursor(page) {
  await page.evaluate(() => {
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
      cursor.style.zIndex = '9999999';
      cursor.style.pointerEvents = 'none';
      cursor.style.transform = 'scale(1)';
      cursor.style.left = '960px';
      cursor.style.top = '300px';
      document.body.appendChild(cursor);
    }
  });
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
        cursor.style.zIndex = '9999999';
        cursor.style.pointerEvents = 'none';
        cursor.style.left = '960px';
        cursor.style.top = '300px';
        document.body.appendChild(cursor);
      }
      cursor.style.transition = `left ${duration}ms cubic-bezier(0.25, 1, 0.5, 1), top ${duration}ms cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s ease`;
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
      cursor.style.transform = 'scale(0.8)';
      setTimeout(() => {
        cursor.style.transform = 'scale(1)';
      }, 150);
    }
  });
}

async function moveAndClick(page, selector, durationMs = 800) {
  const el = await page.$(selector);
  if (!el) {
    console.log(`[Selector warning] Not found: ${selector}`);
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
  console.log('Starting Playwright Chromium (1920x1080) for exact audio sync...');
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

  console.log('Initializing fresh state...');
  await page.goto('http://localhost:5173/#account');
  await page.waitForLoadState('networkidle');

  // Trigger one-click demo setup
  const setupBtn = await page.$('button:has-text("One-click demo setup")');
  if (setupBtn) {
    await setupBtn.click();
    await sleep(1500);
  }

  // Ensure dark theme
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  await page.goto('http://localhost:5173/#dashboard');
  await page.waitForLoadState('networkidle');
  await injectCursor(page);

  console.log('=== RECORDING STARTED (00:00.0) ===');
  const startTime = Date.now();

  const syncWait = async (targetSec) => {
    const elapsed = (Date.now() - startTime) / 1000;
    const remainMs = Math.round((targetSec - elapsed) * 1000);
    if (remainMs > 0) {
      console.log(`[Sync ${elapsed.toFixed(1)}s -> ${targetSec.toFixed(1)}s] Waiting ${remainMs}ms...`);
      await sleep(remainMs);
    }
  };

  // ==========================================
  // ACT 1: 00:00 - 41.62s (41.62s duration)
  // ==========================================
  console.log('>>> ACT 1 (0:00 - 41.62s): Problem & Core Thesis');
  // 00:00 - 00:06: "DeFi is 24/7, highly volatile and fragmented across chains."
  await smoothMove(page, 960, 200, 1000);
  await sleep(6000);

  // 00:06 - 00:15: "either your lending position gets liquidated while you sleep..."
  await smoothMove(page, 550, 360, 1200); // Point to health factor gauge
  await sleep(9000);

  // 00:15 - 00:24: "or your capital sits idle missing out on real cross-chain yields..."
  await smoothMove(page, 800, 480, 1200); // Point to active positions table
  await sleep(9000);

  // 00:24 - 00:32: "Existing AI solutions are dangerous. Giving an LLM direct wallet keys..."
  await smoothMove(page, 1500, 45, 1000); // Hover near header status
  await sleep(8000);

  // 00:32 - 00:41.62: "Meet AegisAgent: where the AI proposes, but deterministic code decides."
  await smoothMove(page, 180, 50, 1000); // Point to Aegis brand logo & tagline
  await syncWait(41.62);

  // ==========================================
  // ACT 2: 41.62s - 81.51s (39.89s duration)
  // ==========================================
  console.log('>>> ACT 2 (41.62s - 81.51s): Architecture & Account Abstraction');
  // 00:00 - 00:10: "Under the hood, AegisAgent uses ERC-4337 account abstraction with session keys..."
  await smoothMove(page, 1600, 45, 1000); // Point to Session Active badge
  await sleep(5000);

  // 00:10 - 00:19: "The user signs an explicit policy: allowed selectors, strict spending caps..."
  await page.keyboard.press('5'); // Switch to Account tab
  await sleep(1500);
  await injectCursor(page);
  await smoothMove(page, 550, 310, 1000); // Hover over Session Key & allowed selectors
  await sleep(8000);

  // 00:19 - 00:30: "When an action is proposed, it must pass through two independent enforcement layers..."
  await smoothMove(page, 1050, 310, 1000); // Hover over Spending caps ($/day)
  await sleep(10000);

  // 00:30 - 00:40: "The AI cannot invent addresses, change limits, or bypass policies."
  await smoothMove(page, 600, 600, 1000); // Hover over Policy details
  await sleep(6000);

  // Return to Dashboard before Act 3 starts
  await page.keyboard.press('1');
  await sleep(1000);
  await injectCursor(page);
  await syncWait(81.51);

  // ==========================================
  // ACT 3: 81.51s - 143.23s (61.72s duration)
  // ==========================================
  console.log('>>> ACT 3 (81.51s - 143.23s): Crash Demo & Liquidation Rescue');
  // 00:00 - 00:05: "Let's see AegisAgent in action under extreme market stress..."
  // Start Live blocks
  await moveAndClick(page, 'button:has-text("Run")', 800);
  await sleep(3000);

  // 00:05 - 00:20: "In our lab environment, we have set up two identical Aave loans..."
  await page.keyboard.press('6'); // Switch to Lab tab
  await sleep(1200);
  await injectCursor(page);
  await smoothMove(page, 550, 290, 1000); // Point to Demo scripts card
  await sleep(12000);

  // 00:20 - 00:26: "Now, let's trigger a sudden −40% market crash across 8 blocks."
  // EXACT CLICK at ~102.5s!
  await syncWait(81.51 + 21.0);
  console.log('--> Clicking -40% crash button right on audio cue!');
  await moveAndClick(page, 'button:has-text("40%")', 600);
  await sleep(1200);

  // Jump to Dashboard immediately to observe live fall and rescue
  await page.keyboard.press('1');
  await sleep(1000);
  await injectCursor(page);

  // 00:26 - 00:39: "Watch what happens as Ethereum plunges... Once Loan A drops below 1.15..."
  await smoothMove(page, 550, 360, 1000); // Point directly to Health Factor dropping
  await sleep(12000); // Sentinel rescue triggers, toast pops up!

  // 00:39 - 00:48: "It draws from designated rescue reserves, repays debt, and brings the health factor safely back to 1.4."
  await smoothMove(page, 820, 440, 1000); // Point to Loan A restored to 1.40
  await sleep(10000);

  // 00:48 - 01:01.7: "Meanwhile, the benchmark loan drops below 1.0, and it is completely liquidated at a loss..."
  await smoothMove(page, 820, 520, 1000); // Point to Loan B showing liquidated!
  await syncWait(143.23);

  // ==========================================
  // ACT 4: 143.23s - 218.19s (74.96s duration)
  // ==========================================
  console.log('>>> ACT 4 (143.23s - 218.19s): Natural Intent, Attack Block & Yield');
  // 00:00 - 00:12: "Now, let's look at how users interact with Aegis..."
  await page.keyboard.press('2'); // Switch to Agent tab
  await sleep(1500);
  await injectCursor(page);

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
  await sleep(8000);

  // 00:12 - 00:22: "Now, here is our strongest differentiator. What happens if someone tries a malicious jailbreak? Watch what happens when I click Try an attack."
  // EXACT CLICK at ~164.5s (143.23 + 21.3s)!
  await syncWait(143.23 + 21.0);
  console.log('--> Clicking "⚡ Try an attack" right on audio cue!');
  const attackChip = await page.$('button.chip:has-text("Try an attack")');
  if (attackChip) {
    const box = await attackChip.boundingBox();
    if (box) {
      await smoothMove(page, box.x + box.width / 2, box.y + box.height / 2, 800);
      await cursorClickEffect(page);
      await attackChip.click();
    }
  }
  await sleep(1500);

  // 00:22 - 00:39: "It fires a classic prompt-injection attempt... It's rejected instantly before even reaching the model..."
  await smoothMove(page, 550, 720, 800); // Point directly to the red firewall block message
  await sleep(14000);

  // 00:39 - 01:03: "For legitimate goals, Aegis scans live protocols across Arbitrum, Optimism, Ethereum using DeFiLlama data..."
  await page.keyboard.press('3'); // Switch to Yield tab
  await sleep(1500);
  await injectCursor(page);
  await smoothMove(page, 750, 360, 1000); // Point to DeFiLlama pools and net APY table
  await sleep(18000);

  // 01:03 - 01:15: "In the Activity tab, every single proposal has an immediate audit trail..."
  await page.keyboard.press('4'); // Switch to Activity tab
  await sleep(1500);
  await injectCursor(page);
  await smoothMove(page, 650, 380, 1000); // Point to Rule IDs and decisions
  await syncWait(218.19);

  // ==========================================
  // ACT 5 + 6: 218.19s - 290.62s (72.43s duration)
  // ==========================================
  console.log('>>> ACT 5 + 6 (218.19s - 290.62s): Fault Injection, Emergency Stop & Summary');
  // 00:00 - 00:11: "What happens when things go wrong? Most DeFi bots fail open... AegisAgent is strictly designed to fail closed."
  await page.keyboard.press('6'); // Switch to Lab tab
  await sleep(1500);
  await injectCursor(page);
  await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
  await sleep(1000);

  // 00:11 - 00:23: "In our fault injection suite, if Chainlink feeds freeze, sequencers go down, or RPCs fail..."
  // Toggle Sequencer down
  const toggle = await page.$('label.check:has-text("Sequencer down") input');
  if (toggle) {
    await toggle.click();
  }
  await sleep(9000);

  // 00:23 - 00:34: "Even if the AI backend or the agent server were completely compromised, the session key cannot exceed..."
  // Click Run suite
  const runSuiteBtn = await page.$('button:has-text("Run suite")');
  if (runSuiteBtn) {
    const box = await runSuiteBtn.boundingBox();
    if (box) {
      await smoothMove(page, box.x + box.width / 2, box.y + box.height / 2, 800);
      await cursorClickEffect(page);
      await runSuiteBtn.click();
    }
  }
  await sleep(10000);

  // 00:34 - 00:41: "At any point, the user has a single-click emergency stop that instantly revokes the session key..."
  // Move to Emergency stop in header
  await smoothMove(page, 1830, 45, 1200);
  await sleep(7000);

  // 00:41 - 01:12.4: "To summarize, AegisAgent bridges autonomous AI with institutional-grade cryptographic safety... Thank you."
  await page.keyboard.press('1'); // Return to Dashboard for final wrap-up
  await sleep(1500);
  await injectCursor(page);
  await smoothMove(page, 960, 400, 1000);

  // Hold cleanly until end of audio
  await syncWait(290.8);

  console.log('=== RECORDING FINISHED AT EXACT AUDIO DURATION ===');
  await page.close();
  await context.close();
  await browser.close();

  // Find the video recorded by Playwright
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm') && f.startsWith('page@'));
  const latestWebm = files.map((f) => path.join(OUT_DIR, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

  console.log(`Raw video saved: ${latestWebm}`);

  // Mux master audio and recorded video into final MP4
  const finalMp4 = path.join(OUT_DIR, 'aegis-agent-final-demo.mp4');
  const masterAudio = path.resolve('audio/master-voiceover.m4a');

  console.log('Muxing video with synchronized master voiceover track...');
  if (fs.existsSync(finalMp4)) {
    fs.unlinkSync(finalMp4);
  }

  execFileSync(ffmpegPath, [
    '-i', latestWebm,
    '-i', masterAudio,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-shortest',
    finalMp4,
  ], { stdio: 'inherit' });

  console.log(`\n========================================`);
  console.log(`SUCCESS! Master demo video with synced audio:`);
  console.log(finalMp4);
  console.log(`========================================\n`);
}

run().catch((err) => {
  console.error('Recording error:', err);
  process.exit(1);
});
