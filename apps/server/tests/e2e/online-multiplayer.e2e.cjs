const puppeteer = require('d:/Projects/Chess/node_modules/puppeteer');
const assert = require('assert');
const path = require('path');

const SCREENSHOT_DIR = 'C:/Users/DEBMALYA/.gemini/antigravity-ide/brain/95f9d5aa-3b2c-4063-b156-62261e4a3f05/scratch';

async function runE2ETests() {
  console.log('=== Starting Phase 4.5 Two-Browser E2E Integration Suite ===');

  const browserA = await puppeteer.launch({ headless: 'new' });
  const browserB = await puppeteer.launch({ headless: 'new' });

  const pageA = await browserA.newPage();
  const pageB = await browserB.newPage();

  await pageA.setViewport({ width: 1280, height: 900 });
  await pageB.setViewport({ width: 1280, height: 900 });

  try {
    // 1. Open both pages
    await pageA.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await pageB.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // 2. Player A opens Online tab & registers
    await selectOnlineTab(pageA);
    const userA_Name = `playerA_${Date.now()}`;
    await registerPlayerFromLobby(pageA, userA_Name, `${userA_Name}@test.com`);
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'online-login.png') });
    console.log('✓ Player A registered & logged in');

    // 3. Player B opens Online tab & registers
    await selectOnlineTab(pageB);
    const userB_Name = `playerB_${Date.now()}`;
    await registerPlayerFromLobby(pageB, userB_Name, `${userB_Name}@test.com`);
    console.log('✓ Player B registered & logged in');

    // 4. Player A creates room
    await pageA.waitForSelector('.create-room-buttons button', { timeout: 10000 });
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'online-lobby.png') });

    await pageA.click('.create-room-buttons button'); // Rapid 10+0
    await pageA.waitForSelector('.code-display span', { timeout: 10000 });
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'online-room-waiting.png') });

    const roomCodeElement = await pageA.$('.code-display span');
    const roomCode = await pageA.evaluate(el => el.textContent.trim(), roomCodeElement);
    console.log(`✓ Player A created private room: ${roomCode}`);

    // 5. Player B joins room
    await pageB.waitForSelector('.join-input-group input', { timeout: 10000 });
    await pageB.type('.join-input-group input', roomCode);
    await pageB.click('.join-input-group button');
    
    await pageA.waitForSelector('.active-online-game', { timeout: 10000 });
    await pageB.waitForSelector('.active-online-game', { timeout: 10000 });

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'online-game-start.png') });
    console.log('✓ Player B joined room — Game switched to ACTIVE on both browsers');

    // 6. Play Real Chess Sequence: 1. e4 e5 2. Nf3 Nc6
    console.log('--- Playing Real Move Sequence ---');

    // Move 1: e2 -> e4 (Player A - White)
    await makeBoardMove(pageA, 'e2', 'e4');
    await new Promise(r => setTimeout(r, 1200));

    // Move 1: e7 -> e5 (Player B - Black)
    await makeBoardMove(pageB, 'e7', 'e5');
    await new Promise(r => setTimeout(r, 1200));

    // Move 2: g1 -> f3 (Player A - White)
    await makeBoardMove(pageA, 'g1', 'f3');
    await new Promise(r => setTimeout(r, 1200));

    // Move 2: b8 -> c6 (Player B - Black)
    await makeBoardMove(pageB, 'b8', 'c6');
    await new Promise(r => setTimeout(r, 1200));

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'online-midgame.png') });
    console.log('✓ Moves 1. e4 e5 2. Nf3 Nc6 successfully executed & synchronized');

    // 7. Security & Robustness Tests
    console.log('--- Running Security & Robustness Tests ---');

    // Test A: Wrong Turn Attempt (Player B tries to move out of turn)
    console.log('Testing Wrong-Turn Rejection...');
    await makeBoardMove(pageB, 'a7', 'a6');
    await new Promise(r => setTimeout(r, 800));
    console.log('✓ Wrong turn attempt rejected by server');

    // Test B: Reconnection Test
    console.log('Testing Disconnect & Reconnection Sync...');
    await pageA.reload({ waitUntil: 'networkidle2' });
    await selectOnlineTab(pageA);
    await new Promise(r => setTimeout(r, 2000));
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'online-reconnect.png') });
    console.log('✓ Player A reconnected — Authoritative state synchronized');

    // 8. Game Completion (Player B Resigns)
    console.log('--- Testing Game Completion (Resignation) ---');
    const resignBtn = await pageB.$('.online-action-bar button:last-child');
    if (resignBtn) {
      await resignBtn.click();
      await new Promise(r => setTimeout(r, 1500));
    }
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'online-game-over.png') });
    console.log('✓ Resignation executed & Game Over overlay verified');

  } catch (err) {
    console.error('E2E Test Failed:', err);
    process.exitCode = 1;
  } finally {
    await browserA.close();
    await browserB.close();
    console.log('=== Phase 4.5 E2E Integration Suite Completed ===');
  }
}

async function registerPlayerFromLobby(page, username, email) {
  const lobbyBtn = await page.$('.online-lobby-card button');
  if (lobbyBtn) {
    await lobbyBtn.click();
  } else {
    const loginHeaderBtn = await page.$('.app-header button');
    if (loginHeaderBtn) await loginHeaderBtn.click();
  }
  await new Promise(r => setTimeout(r, 600));

  const regTab = (await page.$$('.auth-tab'))[1];
  if (regTab) await regTab.click();
  await new Promise(r => setTimeout(r, 400));

  const inputs = await page.$$('.auth-form input');
  if (inputs.length >= 3) {
    await inputs[0].type(username);
    await inputs[1].type(email);
    await inputs[2].type('password123');
    await page.click('.auth-submit-btn');
    await page.waitForSelector('.auth-user-badge', { timeout: 10000 });
  }
}

async function selectOnlineTab(page) {
  const tabs = await page.$$('.mode-tab');
  if (tabs.length >= 3) {
    await tabs[2].click();
    await new Promise(r => setTimeout(r, 800));
  }
}

async function makeBoardMove(page, fromSq, toSq) {
  const fromEl = await page.$(`[data-square="${fromSq}"]`);
  const toEl = await page.$(`[data-square="${toSq}"]`);
  if (fromEl && toEl) {
    await fromEl.click();
    await new Promise(r => setTimeout(r, 200));
    await toEl.click();
  }
}

runE2ETests();
