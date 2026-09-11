const puppeteer = require('puppeteer');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');

const SCREENSHOT_DIR = 'C:/Users/DEBMALYA/.gemini/antigravity-ide/brain/95f9d5aa-3b2c-4063-b156-62261e4a3f05/scratch';
const clientUrl = 'http://localhost:5173';
const serverUrl = 'http://localhost:8000';

let serverProc = null;
let clientProc = null;

function checkUrl(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    }).on('error', () => resolve(false));
  });
}

async function ensureServersRunning() {
  const isServerUp = await checkUrl(`${serverUrl}/health`);
  if (!isServerUp) {
    console.log('[E2E 6A] Starting Fastify server on port 8000...');
    serverProc = spawn('node', ['apps/server/src/index.js'], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, DB_MODE: 'memory', PORT: '8000' },
      stdio: 'pipe'
    });
    serverProc.stdout.on('data', (d) => process.stdout.write(`[BACKEND] ${d}`));
    serverProc.stderr.on('data', (d) => process.stderr.write(`[BACKEND ERR] ${d}`));

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkUrl(`${serverUrl}/health`)) break;
    }
    console.log('[E2E 6A] Backend server is healthy.');
  }

  const isClientUp = await checkUrl(clientUrl);
  if (!isClientUp) {
    console.log('[E2E 6A] Starting Vite preview/dev on port 5173...');
    clientProc = spawn('npx', ['vite', 'preview', '--port', '5173'], {
      cwd: path.resolve(__dirname, '../../apps/web/client'),
      stdio: 'pipe',
      shell: true
    });
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkUrl(clientUrl)) break;
    }
    console.log('[E2E 6A] Client preview is healthy.');
  }
}

async function runPhase6E2E() {
  console.log('=== PHASE 6A — PLAYER PLATFORM E2E INTEGRATION TEST ===');
  await ensureServersRunning();

  const browserA = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const browserB = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  const pageA = await browserA.newPage();
  const pageB = await browserB.newPage();

  await pageA.setViewport({ width: 1280, height: 900 });
  await pageB.setViewport({ width: 1280, height: 900 });

  try {
    // 1. Load Web App
    await pageA.goto(clientUrl, { waitUntil: 'networkidle2' });
    await pageB.goto(clientUrl, { waitUntil: 'networkidle2' });
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'debug_initial_page.png') });
    console.log('[E2E DEBUG] Took initial screenshot: debug_initial_page.png');

    // 2. Select Online Tab for both players
    await selectTabByName(pageA, 'Online');
    await selectTabByName(pageB, 'Online');

    // 3. Register Player A & Player B from lobby
    console.log('[E2E] Step 1: Registering Player A...');
    const userA_Name = `p6a_userA_${Date.now()}`;
    await registerPlayerFromLobby(pageA, userA_Name, `${userA_Name}@test.com`);
    console.log(`[E2E] Player A registered & logged in: ${userA_Name}`);

    console.log('[E2E] Step 2: Registering Player B...');
    const userB_Name = `p6a_userB_${Date.now()}`;
    await registerPlayerFromLobby(pageB, userB_Name, `${userB_Name}@test.com`);
    console.log(`[E2E] Player B registered & logged in: ${userB_Name}`);

    // 4. Navigate both players to Online Multiplayer (Tab 3)
    console.log('[E2E] Step 3: Navigating to Online Multiplayer...');
    await selectTabByName(pageA, 'Online');
    await selectTabByName(pageB, 'Online');

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'debug_online_mode_pageA.png') });
    console.log('[E2E DEBUG] Took online mode screenshot for pageA: debug_online_mode_pageA.png');

    console.log('[E2E DEBUG A] Active Tab:', await pageA.evaluate(() => document.querySelector('.mode-tab.active')?.textContent));
    console.log('[E2E DEBUG A] Body Text:', await pageA.evaluate(() => document.body.textContent.substring(0, 300)));

    // Wait for WS connection & lobby grid
    await pageA.waitForSelector('.online-lobby-grid', { timeout: 15000 });
    await pageB.waitForSelector('.online-lobby-grid', { timeout: 15000 });
    console.log('[E2E] WebSocket connected & Online Lobby ready for both players');

    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.create-room-buttons button'));
      const target = btns.find(b => b.textContent.includes('10+0 Rapid'));
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.create-room-buttons button'));
      const target = btns.find(b => b.textContent.includes('10+0 Rapid'));
      if (target) target.click();
    });

    await pageA.waitForSelector('.active-online-game', { timeout: 15000 });
    await pageB.waitForSelector('.active-online-game', { timeout: 15000 });
    console.log('[E2E] Both players paired into active online game');

    // Determine colors
    const isPlayerAWhite = await pageA.evaluate(() => {
      return window.__activeGameColor === 'w' || window.__activeGameColor === 'white';
    });

    const whitePage = isPlayerAWhite ? pageA : pageB;
    const blackPage = isPlayerAWhite ? pageB : pageA;

    // 5. Execute Fool's Mate Sequence (1. f3 e5 2. g4 Qh4#)
    console.log('[E2E] Step 4: Executing Checkmate (Fool\'s Mate: 1. f3 e5 2. g4 Qh4#)...');
    await makeBoardMove(whitePage, 'f2', 'f3');
    await makeBoardMove(blackPage, 'e7', 'e5');
    await makeBoardMove(whitePage, 'g2', 'g4');
    await makeBoardMove(blackPage, 'd8', 'h4');

    await new Promise(r => setTimeout(r, 2000));

    await whitePage.waitForSelector('.game-over-banner', { timeout: 15000 });
    await blackPage.waitForSelector('.game-over-banner', { timeout: 15000 });
    console.log('[E2E] Checkmate game over banner verified');

    // 6. Test Profile Page (Tab 5)
    console.log('[E2E] Step 5: Testing Player Profile Page...');
    await selectTabByName(pageA, 'Profile'); // Profile tab
    await new Promise(r => setTimeout(r, 1500));
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6_profile_dashboard.png') });
    
    const profileText = await pageA.evaluate(() => document.body.textContent);
    assert.ok(profileText.includes(userA_Name), 'Profile must render username');
    assert.ok(profileText.includes('Lifetime Statistics'), 'Profile must render statistics');
    console.log('[E2E] Saved screenshot: phase6_profile_dashboard.png');

    // 7. Test Game History Page (Tab 6)
    console.log('[E2E] Step 6: Testing Game History Page...');
    await selectTabByName(pageA, 'History'); // History tab
    await new Promise(r => setTimeout(r, 1500));
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6_game_history.png') });

    const historyText = await pageA.evaluate(() => document.body.textContent);
    assert.ok(historyText.includes('Game History & Replays'), 'History page title must exist');
    assert.ok(historyText.includes('Replay'), 'History table must render Replay button');
    console.log('[E2E] Saved screenshot: phase6_game_history.png');

    // 8. Test Game Replay View
    console.log('[E2E] Step 7: Testing Game Replay View...');
    pageA.on('console', msg => console.log('[PAGE A LOG]', msg.text()));
    pageA.on('pageerror', err => console.error('[PAGE A ERROR]', err.toString()));

    await pageA.waitForSelector('tbody button', { timeout: 10000 });

    // Click Replay button natively
    await pageA.click('tbody button');
    await new Promise(r => setTimeout(r, 2000));

    await pageA.waitForFunction(() =>
      document.body.textContent.includes('Move Notation') || document.body.textContent.includes('Replay Error'),
      { timeout: 15000 }
    );
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6_game_replay.png') });

    const replayText = await pageA.evaluate(() => document.body.textContent);
    assert.ok(replayText.includes('Move Notation'), 'Replay must render move notation sidebar');
    assert.ok(replayText.includes('Download PGN'), 'Replay must render Download PGN button');
    console.log('[E2E] Saved screenshot: phase6_game_replay.png');

    console.log('\n=== PHASE 6A PLAYER PLATFORM E2E TEST: ALL PASSED (100% SUCCESS) ===\n');
  } catch (err) {
    console.error('Phase 6A E2E Test Failed:', err);
    process.exitCode = 1;
  } finally {
    await browserA.close();
    await browserB.close();
    if (serverProc) {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t']);
      else serverProc.kill('SIGKILL');
    }
    if (clientProc) {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(clientProc.pid), '/f', '/t']);
      else clientProc.kill();
    }
    process.exit(process.exitCode || 0);
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
    await inputs[2].type('Password123!');
    await page.click('.auth-submit-btn');
    await page.waitForSelector('.auth-user-badge', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1500));
  }
}

async function selectTabByName(page, name) {
  await new Promise(r => setTimeout(r, 500));
  const clicked = await page.evaluate((tabName) => {
    const tabs = Array.from(document.querySelectorAll('.mode-tab'));
    const target = tabs.find(b => b.textContent.toLowerCase().includes(tabName.toLowerCase()));
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, name);
  console.log(`[E2E] selectTabByName('${name}') clicked result: ${clicked}`);
  await new Promise(r => setTimeout(r, 1000));
}

async function makeBoardMove(page, fromSq, toSq) {
  await page.evaluate(({ fromSq, toSq }) => {
    const gameId = window.__activeGameId;
    if (window.globalWsClient && gameId) {
      window.globalWsClient.submitMove(gameId, fromSq, toSq);
    }
  }, { fromSq, toSq });

  await new Promise(r => setTimeout(r, 1200));
}

runPhase6E2E();
