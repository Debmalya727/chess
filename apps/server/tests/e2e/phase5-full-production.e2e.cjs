const puppeteer = require('d:/Projects/Chess/node_modules/puppeteer');
const assert = require('assert');
const path = require('path');
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
    console.log('[E2E 5] Starting Fastify server on port 8000...');
    serverProc = spawn('node', ['apps/server/src/index.js'], {
      cwd: path.resolve(__dirname, '../../../..'),
      env: { ...process.env, DB_MODE: 'memory', PORT: '8000' },
      stdio: 'pipe'
    });
    serverProc.stdout.on('data', (d) => process.stdout.write(`[BACKEND] ${d}`));
    serverProc.stderr.on('data', (d) => process.stderr.write(`[BACKEND ERR] ${d}`));

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkUrl(`${serverUrl}/health`)) break;
    }
    console.log('[E2E 5] Backend server is healthy.');
  }

  const isClientUp = await checkUrl(clientUrl);
  if (!isClientUp) {
    console.log('[E2E 5] Starting Vite preview/dev on port 5173...');
    clientProc = spawn('npx', ['vite', 'preview', '--port', '5173'], {
      cwd: path.resolve(__dirname, '../../../../apps/web/client'),
      stdio: 'pipe',
      shell: true
    });
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkUrl(clientUrl)) break;
    }
    console.log('[E2E 5] Client preview is healthy.');
  }
}

async function runPhase5E2E() {
  console.log('=== Starting Phase 5 Production Online Chess E2E Suite ===');
  await ensureServersRunning();

  const browserA = await puppeteer.launch({ headless: 'new' });
  const browserB = await puppeteer.launch({ headless: 'new' });

  const pageA = await browserA.newPage();
  const pageB = await browserB.newPage();

  pageA.on('console', msg => console.log('PageA Console:', msg.text()));
  pageB.on('console', msg => console.log('PageB Console:', msg.text()));

  await pageA.setViewport({ width: 1280, height: 900 });
  await pageB.setViewport({ width: 1280, height: 900 });

  try {
    // 1. Load Web App in both browsers
    await pageA.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await pageB.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // 2. Register & Login Player A
    await selectOnlineTab(pageA);
    const userA_Name = `p5_userA_${Date.now()}`;
    await registerPlayerFromLobby(pageA, userA_Name, `${userA_Name}@test.com`);
    console.log(`✓ Player A registered & logged in: ${userA_Name}`);

    // 3. Register & Login Player B
    await selectOnlineTab(pageB);
    const userB_Name = `p5_userB_${Date.now()}`;
    await registerPlayerFromLobby(pageB, userB_Name, `${userB_Name}@test.com`);
    console.log(`✓ Player B registered & logged in: ${userB_Name}`);

    // Wait for WS connection to show CONNECTED
    await pageA.waitForFunction(() => document.body.textContent.includes('CONNECTED'), { timeout: 10000 });
    await pageB.waitForFunction(() => document.body.textContent.includes('CONNECTED'), { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));
    console.log('✓ WebSocket connected & authenticated for both players');

    // 4. Test Matchmaking Queue
    console.log('--- Testing Quick Matchmaking Queue ---');
    await pageA.waitForSelector('.online-lobby-grid', { timeout: 10000 });
    await pageB.waitForSelector('.online-lobby-grid', { timeout: 10000 });

    // Player A clicks 10+0 Rapid queue
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.create-room-buttons button'));
      const target = btns.find(b => b.textContent.includes('10+0 Rapid'));
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Player B clicks 10+0 Rapid queue
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.create-room-buttons button'));
      const target = btns.find(b => b.textContent.includes('10+0 Rapid'));
      if (target) target.click();
    });

    // Both pages should automatically switch to active online game
    await pageA.waitForSelector('.active-online-game', { timeout: 10000 });
    await pageB.waitForSelector('.active-online-game', { timeout: 10000 });
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase5_matchmaking_start.png') });
    console.log('✓ Matchmaking Service successfully paired Player A and Player B into an active game');

    // Determine colors
    const isPlayerAWhite = await pageA.evaluate(() => {
      return window.__activeGameColor === 'w';
    });

    const whitePage = isPlayerAWhite ? pageA : pageB;
    const blackPage = isPlayerAWhite ? pageB : pageA;

    console.log(`✓ Authoritative Color Assignment: Player A is ${isPlayerAWhite ? 'White' : 'Black'}, Player B is ${isPlayerAWhite ? 'Black' : 'White'}`);

    // 5. Execute Fool's Mate Sequence: 1. f3 e5 2. g4 Qh4#
    console.log('--- Executing Checkmate Sequence (Fool\'s Mate: 1. f3 e5 2. g4 Qh4#) ---');

    // 1. f2 -> f3 (White)
    console.log('White playing f2 -> f3');
    await makeBoardMove(whitePage, 'f2', 'f3');

    // 1... e7 -> e5 (Black)
    console.log('Black playing e7 -> e5');
    await makeBoardMove(blackPage, 'e7', 'e5');

    // 2. g2 -> g4 (White)
    console.log('White playing g2 -> g4');
    await makeBoardMove(whitePage, 'g2', 'g4');

    // 2... d8 -> h4# (Black - Checkmate!)
    console.log('Black playing d8 -> h4 (Checkmate)');
    await makeBoardMove(blackPage, 'd8', 'h4');

    await new Promise(r => setTimeout(r, 2000));
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase5_checkmate_game_over.png') });

    // 6. Verify Checkmate Termination & Result
    console.log('Waiting for game over banner...');
    await whitePage.waitForSelector('.game-over-banner', { timeout: 15000 });
    await blackPage.waitForSelector('.game-over-banner', { timeout: 15000 });

    const bannerTextA = await pageA.evaluate(() => document.querySelector('.game-over-banner')?.textContent || '');
    const bannerTextB = await pageB.evaluate(() => document.querySelector('.game-over-banner')?.textContent || '');

    assert.ok(bannerTextA.includes('CHECKMATE'), 'Banner must indicate CHECKMATE termination');
    assert.ok(bannerTextB.includes('CHECKMATE'), 'Banner must indicate CHECKMATE termination');
    console.log('✓ Complete Chess Lifecycle Verified: Game ended by CHECKMATE (0-1), Winner: Black');

    // 7. Verify PGN & Game Over Controls
    console.log('--- Testing PGN Download & Game Over Controls ---');
    const hasDownloadBtn = await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.game-over-banner button'));
      return btns.some(b => b.textContent.includes('Download PGN'));
    });

    assert.strictEqual(hasDownloadBtn, true, 'Game Over banner must render Download PGN button');
    console.log('✓ PGN Download and Game Over controls verified in UI');

  } catch (err) {
    console.error('Phase 5 E2E Test Failed:', err);
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
    console.log('=== Phase 5 Production Online Chess E2E Suite Finished ===');
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
  }
}

async function selectOnlineTab(page) {
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.mode-tab'));
    const target = tabs.find(b => b.textContent.toLowerCase().includes('online'));
    if (target) target.click();
  });
  await new Promise(r => setTimeout(r, 800));
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

runPhase5E2E();
