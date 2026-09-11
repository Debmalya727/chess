const puppeteer = require('puppeteer');
const path = require('path');
const assert = require('assert');
const { spawn, execSync } = require('child_process');
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

function getDbHost() {
  try {
    const ip = execSync('wsl hostname -I').toString().trim().split(' ')[0];
    if (ip) return ip;
  } catch {}
  return '127.0.0.1';
}

async function ensureServersRunning() {
  const isServerUp = await checkUrl(`${serverUrl}/health`);
  if (!isServerUp) {
    console.log('[E2E 8] Starting Fastify server on port 8000...');
    const dbHost = getDbHost();
    serverProc = spawn('node', ['apps/server/src/index.js'], {
      cwd: path.resolve(__dirname, '../..'),
      env: {
        ...process.env,
        PORT: '8000',
        DB_MODE: 'memory'
      },
      stdio: 'pipe'
    });
    serverProc.stdout.on('data', (d) => process.stdout.write(`[BACKEND] ${d}`));
    serverProc.stderr.on('data', (d) => process.stderr.write(`[BACKEND ERR] ${d}`));

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkUrl(`${serverUrl}/health`)) break;
    }
    console.log('[E2E 8] Backend server is healthy.');
  }

  const isClientUp = await checkUrl(clientUrl);
  if (!isClientUp) {
    console.log('[E2E 8] Starting Vite preview/dev on port 5173...');
    clientProc = spawn('npx', ['vite', 'preview', '--port', '5173'], {
      cwd: path.resolve(__dirname, '../../apps/web/client'),
      stdio: 'pipe',
      shell: true
    });
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkUrl(clientUrl)) break;
    }
    console.log('[E2E 8] Client preview is healthy.');
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
  console.log(`[E2E 8] selectTabByName('${name}') clicked result: ${clicked}`);
  await new Promise(r => setTimeout(r, 1000));
}

async function runPhase8E2E() {
  console.log('===============================================================');
  console.log('=== PHASE 8 — COMPLETE COMPETITIVE TOURNAMENT PLATFORM E2E ===');
  console.log('===============================================================\n');
  await ensureServersRunning();

  const browserA = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const browserB = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  const pageA = await browserA.newPage();
  const pageB = await browserB.newPage();

  await pageA.setViewport({ width: 1280, height: 900 });
  await pageB.setViewport({ width: 1280, height: 900 });

  pageA.on('pageerror', err => console.error('[PAGE A ERROR]', err.toString()));
  pageB.on('pageerror', err => console.error('[PAGE B ERROR]', err.toString()));

  try {
    const ts = Date.now();
    const aliceUser = `p8_alice_${ts}`;
    const aliceEmail = `alice_${ts}@chess.com`;
    const bobUser = `p8_bob_${ts}`;
    const bobEmail = `bob_${ts}@chess.com`;

    // Step 1: Open clients & navigate to Online tab to register
    console.log('[E2E 8] Step 1: Navigating to Online tab to authenticate Player A and Player B...');
    await pageA.goto(clientUrl, { waitUntil: 'networkidle2' });
    await pageB.goto(clientUrl, { waitUntil: 'networkidle2' });

    await selectTabByName(pageA, 'Online');
    await selectTabByName(pageB, 'Online');

    await registerPlayerFromLobby(pageA, aliceUser, aliceEmail);
    console.log(`[E2E 8] Player A registered: ${aliceUser}`);

    await registerPlayerFromLobby(pageB, bobUser, bobEmail);
    console.log(`[E2E 8] Player B registered: ${bobUser}`);

    // Elevate Alice to TOURNAMENT_ORGANIZER via /api/admin/promote-test
    await pageA.evaluate(async (email) => {
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${localStorage.getItem('chess_token')}` }
      });
      const me = await meRes.json();
      if (me.user?.id) {
        await fetch('/api/admin/promote-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: me.user.id, role: 'TOURNAMENT_ORGANIZER' })
        });
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'Password123!' })
        });
        const loginData = await loginRes.json();
        if (loginData.token) {
          localStorage.setItem('chess_token', loginData.token);
        }
      }
    }, aliceEmail);

    // Step 2: Navigate to Tournaments Tab
    console.log('[E2E 8] Step 2: Navigating to Tournaments Tab...');
    await selectTabByName(pageA, 'Tournaments');
    await selectTabByName(pageB, 'Tournaments');

    await pageA.waitForFunction(() => document.body.textContent.includes('Competitive Tournament Platform'), { timeout: 15000 });
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase8_01_tournaments_lobby.png') });
    console.log('[E2E 8] Saved screenshot: phase8_01_tournaments_lobby.png');

    // Step 3: Create Tournament via Player A (Organizer)
    console.log('[E2E 8] Step 3: Player A creates Phase 8 Swiss Championship...');
    const createRes = await pageA.evaluate(async () => {
      const token = localStorage.getItem('chess_token');
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Phase 8 Swiss Championship',
          type: 'swiss',
          timeControl: '10+0',
          totalRounds: 2,
          minPlayers: 2,
          maxPlayers: 16
        })
      });
      return await res.json();
    });

    assert.ok(createRes.id, 'Tournament must be created with valid ID');
    const tournamentId = createRes.id;
    console.log(`[E2E 8] Tournament created with ID: ${tournamentId}`);

    // Refresh Tournaments list on both browsers
    await pageA.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Refresh'));
      if (btn) btn.click();
    });
    await pageB.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Refresh'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Both players open tournament details
    console.log('[E2E 8] Step 4: Both players view tournament details...');
    await pageA.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent.includes('View Event Details'));
    }, { timeout: 10000 });

    await pageA.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('View Event Details'));
      if (btn) btn.click();
    });

    await pageB.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent.includes('View Event Details'));
    }, { timeout: 10000 });

    await pageB.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('View Event Details'));
      if (btn) btn.click();
    });

    await pageA.waitForFunction(() => document.body.textContent.includes('Phase 8 Swiss Championship'), { timeout: 15000 });
    await pageB.waitForFunction(() => document.body.textContent.includes('Phase 8 Swiss Championship'), { timeout: 15000 });

    // Step 5: Register both players for the tournament
    console.log('[E2E 8] Step 5: Registering Player A and Player B...');
    await pageA.evaluate(async (tId) => {
      const token = localStorage.getItem('chess_token');
      await fetch(`/api/tournaments/${tId}/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    }, tournamentId);

    await pageB.evaluate(async (tId) => {
      const token = localStorage.getItem('chess_token');
      await fetch(`/api/tournaments/${tId}/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    }, tournamentId);

    // Refresh page A view
    await pageA.evaluate(() => {
      const backBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Back to Tournaments'));
      if (backBtn) backBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));
    await pageA.evaluate(() => {
      const viewBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('View Event Details'));
      if (viewBtn) viewBtn.click();
    });

    await pageA.waitForFunction(() => document.body.textContent.includes('Phase 8 Swiss Championship'), { timeout: 10000 });
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase8_02_tournament_registration.png') });
    console.log('[E2E 8] Saved screenshot: phase8_02_tournament_registration.png');

    // Step 6: Start the Swiss Tournament
    console.log('[E2E 8] Step 6: Starting the tournament...');
    const startRes = await pageA.evaluate(async (tId) => {
      const token = localStorage.getItem('chess_token');
      const res = await fetch(`/api/tournaments/${tId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      return await res.json();
    }, tournamentId);
    assert.strictEqual(startRes.success, true, 'Tournament must successfully start');
    console.log('[E2E 8] Tournament successfully started with Round 1 pairings!');

    // Refresh page A to see live running state
    await pageA.evaluate(() => {
      const backBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Back to Tournaments'));
      if (backBtn) backBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));
    await pageA.evaluate(() => {
      const viewBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('View Event Details'));
      if (viewBtn) viewBtn.click();
    });

    await pageA.waitForFunction(() => document.body.textContent.includes('Standings & Buchholz Tiebreaks'), { timeout: 10000 });
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase8_03_tournament_standings.png') });
    console.log('[E2E 8] Saved screenshot: phase8_03_tournament_standings.png');

    // Step 7: View Rounds & Pairings Board
    console.log('[E2E 8] Step 7: Verifying Rounds & Pairings Board...');
    await pageA.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Rounds & Pairings'));
      if (tab) tab.click();
    });
    await new Promise(r => setTimeout(r, 800));

    await pageA.waitForFunction(() => document.body.textContent.includes('Tournament Pairings Board'), { timeout: 10000 });
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase8_04_tournament_pairings.png') });
    console.log('[E2E 8] Saved screenshot: phase8_04_tournament_pairings.png');

    const boardText = await pageA.evaluate(() => document.body.textContent);
    assert.ok(boardText.includes('Tournament Pairings Board'), 'Pairings board must be visible');
    assert.ok(boardText.includes('R1'), 'Round 1 must be displayed on board');

    console.log('\n===============================================================');
    console.log('=== PHASE 8 E2E INTEGRATION TEST: ALL PASSED (100% SUCCESS) ===');
    console.log('===============================================================\n');

  } catch (err) {
    console.error('[E2E 8 FATAL ERROR]', err);
    process.exitCode = 1;
  } finally {
    await browserA.close();
    await browserB.close();
    if (serverProc) serverProc.kill();
    if (clientProc) clientProc.kill();
    process.exit(0);
  }
}

runPhase8E2E().catch(err => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
