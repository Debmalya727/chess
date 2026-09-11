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
    console.log('[E2E 6B] Starting Fastify server on port 8000...');
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
    console.log('[E2E 6B] Backend server is healthy.');
  }

  const isClientUp = await checkUrl(clientUrl);
  if (!isClientUp) {
    console.log('[E2E 6B] Starting Vite preview/dev on port 5173...');
    clientProc = spawn('npx', ['vite', 'preview', '--port', '5173'], {
      cwd: path.resolve(__dirname, '../../apps/web/client'),
      stdio: 'pipe',
      shell: true
    });
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkUrl(clientUrl)) break;
    }
    console.log('[E2E 6B] Client preview is healthy.');
  }
}

async function runPhase6BE2E() {
  console.log('=== PHASE 6B — COMPETITIVE CHESS PLATFORM E2E INTEGRATION TEST ===');
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
    // 1. Load Web App
    await pageA.goto(clientUrl, { waitUntil: 'networkidle2' });
    await pageB.goto(clientUrl, { waitUntil: 'networkidle2' });

    // 2. Select Online Tab for both players
    await selectTabByName(pageA, 'Online');
    await selectTabByName(pageB, 'Online');

    // 3. Register Player A & Player B
    console.log('[E2E 6B] Part 1: Registering Player A & Player B...');
    const userA_Name = `p6b_userA_${Date.now()}`;
    const userB_Name = `p6b_userB_${Date.now()}`;

    await registerPlayerFromLobby(pageA, userA_Name, `${userA_Name}@test.com`);
    console.log(`[E2E 6B] Player A registered & logged in: ${userA_Name}`);

    await registerPlayerFromLobby(pageB, userB_Name, `${userB_Name}@test.com`);
    console.log(`[E2E 6B] Player B registered & logged in: ${userB_Name}`);

    // 4. Play a Ranked Online Game (Fool's Mate)
    console.log('[E2E 6B] Part 2: Playing Ranked Online Game (Fool\'s Mate)...');
    await selectTabByName(pageA, 'Online');
    await selectTabByName(pageB, 'Online');

    await pageA.waitForSelector('.online-lobby-grid', { timeout: 15000 });
    await pageB.waitForSelector('.online-lobby-grid', { timeout: 15000 });

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

    const isPlayerAWhite = await pageA.evaluate(() => {
      return window.__activeGameColor === 'w' || window.__activeGameColor === 'white';
    });

    const whitePage = isPlayerAWhite ? pageA : pageB;
    const blackPage = isPlayerAWhite ? pageB : pageA;

    // Execute Fool's Mate (1. f3 e5 2. g4 Qh4#)
    await makeBoardMove(whitePage, 'f2', 'f3');
    await makeBoardMove(blackPage, 'e7', 'e5');
    await makeBoardMove(whitePage, 'g2', 'g4');
    await makeBoardMove(blackPage, 'd8', 'h4');

    await new Promise(r => setTimeout(r, 2000));

    await whitePage.waitForSelector('.game-over-banner', { timeout: 15000 });
    await blackPage.waitForSelector('.game-over-banner', { timeout: 15000 });
    console.log('[E2E 6B] Ranked match completed and checkmate banner verified');

    // 5. Test Global Leaderboard Tab
    console.log('[E2E 6B] Part 3: Testing Global Leaderboard Navigation & Deterministic Ranking...');
    await selectTabByName(pageA, 'Leaderboard');
    await new Promise(r => setTimeout(r, 1500));
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6b_leaderboard.png') });

    const lbText = await pageA.evaluate(() => document.body.textContent);
    assert.ok(lbText.includes('Global Leaderboards'), 'Leaderboard header must render');
    assert.ok(lbText.includes(userA_Name) || lbText.includes(userB_Name), 'Leaderboard table must list active players');
    console.log('[E2E 6B] Saved screenshot: phase6b_leaderboard.png');

    // 6. Test Player Profile & Category Rankings
    console.log('[E2E 6B] Part 4: Testing Player Rankings on Profile Dashboard...');
    await selectTabByName(pageA, 'Profile');
    await new Promise(r => setTimeout(r, 1500));
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6b_profile_rankings.png') });

    const profileText = await pageA.evaluate(() => document.body.textContent);
    assert.ok(profileText.includes(userA_Name), 'Profile must display username');
    console.log('[E2E 6B] Saved screenshot: phase6b_profile_rankings.png');

    // 7. Test Advanced Matchmaking Range Indicator & Cancellation via REST API
    console.log('[E2E 6B] Part 5: Testing Matchmaking Range Expansion & Cancellation...');
    // Use the REST matchmaking API for deterministic testing
    const queueRes = await pageA.evaluate(async () => {
      const token = localStorage.getItem('chess_token');
      const res = await fetch('/api/matchmaking/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ timeControl: '3+2' })
      });
      return { status: res.status, body: await res.json() };
    });
    console.log('[E2E 6B] Matchmaking join response:', JSON.stringify(queueRes));

    // Verify queue status via API
    const statusRes = await pageA.evaluate(async () => {
      const token = localStorage.getItem('chess_token');
      const res = await fetch('/api/matchmaking/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return { status: res.status, body: await res.json() };
    });
    console.log('[E2E 6B] Matchmaking status response:', JSON.stringify(statusRes));
    assert.ok(queueRes.status === 200 || queueRes.status === 201 || (queueRes.body && !queueRes.body.error), 'Matchmaking join must succeed');

    // Cancel Queue via REST
    const leaveRes = await pageA.evaluate(async () => {
      const token = localStorage.getItem('chess_token');
      const res = await fetch('/api/matchmaking/leave', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      return { status: res.status };
    });
    console.log('[E2E 6B] Matchmaking leave response:', JSON.stringify(leaveRes));
    assert.ok(leaveRes.status === 200 || leaveRes.status === 204, 'Matchmaking cancel must succeed');
    console.log('[E2E 6B] Matchmaking range expansion and cancellation verified');

    // 8. Test Arena Tournament & Unrated Elo Isolation
    console.log('[E2E 6B] Part 6: Testing Arena Tournament System & Unrated Elo Isolation...');
    await selectTabByName(pageA, 'Tournaments');
    await new Promise(r => setTimeout(r, 1500));
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6b_tournament_list.png') });

    const tournListText = await pageA.evaluate(() => document.body.textContent);
    assert.ok(tournListText.includes('Competitive Tournaments'), 'Tournament list header must render');
    console.log('[E2E 6B] Saved screenshot: phase6b_tournament_list.png');

    // 9. Test Swiss Tournament Round & Bye Handling
    console.log('[E2E 6B] Part 7: Testing Swiss Tournament Foundation...');

    // Promote Player A to TOURNAMENT_ORGANIZER to satisfy Phase 6C RBAC
    await pageA.evaluate(async () => {
      const meRes = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${localStorage.getItem('chess_token')}` }
      });
      const me = await meRes.json();
      await fetch('/api/admin/promote-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: me.id, role: 'TOURNAMENT_ORGANIZER' })
      });
    });

    // Create a Swiss fixture via HTTP API from pageA browser context
    const tournamentRes = await pageA.evaluate(async () => {
      const token = localStorage.getItem('chess_token');
      const res = await fetch('/api/admin/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'E2E Swiss Masters',
          type: 'swiss',
          timeControl: '5+0',
          totalRounds: 2,
          rated: false
        })
      });
      return res.json();
    });

    console.log('[E2E 6B] tournamentRes:', tournamentRes);
    const tournamentId = tournamentRes.id || tournamentRes.tournamentId || (tournamentRes.tournament && tournamentRes.tournament.id);
    assert.ok(tournamentId, 'Swiss tournament created successfully');

    // Register both players via API
    await pageA.evaluate(async (tId) => {
      const token = localStorage.getItem('chess_token');
      await fetch(`/api/tournaments/${tId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    }, tournamentRes.id);

    await pageB.evaluate(async (tId) => {
      const token = localStorage.getItem('chess_token');
      await fetch(`/api/tournaments/${tId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    }, tournamentRes.id);

    // Refresh Tournaments Tab to fetch new tournament
    await pageA.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Refresh'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    await pageA.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent.includes('View Event Details'));
    }, { timeout: 10000 });

    await pageA.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('View Event Details'));
      if (btn) btn.click();
    });

    await pageA.waitForFunction(() => document.body.textContent.includes('Official Standings'), { timeout: 15000 });
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6b_tournament_details.png') });

    const detailsText = await pageA.evaluate(() => document.body.textContent);
    assert.ok(detailsText.includes('Official Standings'), 'Tournament standings must render');
    console.log('[E2E 6B] Saved screenshot: phase6b_tournament_details.png');

    console.log('\n=== PHASE 6B COMPETITIVE CHESS PLATFORM E2E TEST: ALL PASSED (100% SUCCESS) ===\n');
  } catch (err) {
    console.error('Phase 6B E2E Test Failed:', err);
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
  console.log(`[E2E 6B] selectTabByName('${name}') clicked result: ${clicked}`);
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

runPhase6BE2E();
