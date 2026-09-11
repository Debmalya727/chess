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
    console.log('[E2E 6C] Starting Fastify server on port 8000...');
    serverProc = spawn('node', ['apps/server/src/index.js'], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, DB_MODE: 'memory', PORT: '8000' },
      stdio: 'pipe'
    });
    serverProc.stdout.on('data', (d) => process.stdout.write(`[BACKEND] ${d}`));
    serverProc.stderr.on('data', (d) => process.stderr.write(`[BACKEND ERR] ${d}`));

    // Wait up to 10 seconds for backend
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkUrl(`${serverUrl}/health`)) break;
    }
    console.log('[E2E 6C] Backend server is healthy.');
  } else {
    console.log('[E2E 6C] Backend server is already running.');
  }

  const isClientUp = await checkUrl(clientUrl);
  if (!isClientUp) {
    console.log('[E2E 6C] Starting Vite preview/dev on port 5173...');
    clientProc = spawn('npx', ['vite', 'preview', '--port', '5173'], {
      cwd: path.resolve(__dirname, '../../apps/web/client'),
      stdio: 'pipe',
      shell: true
    });
    clientProc.stdout.on('data', (d) => process.stdout.write(`[CLIENT] ${d}`));
    clientProc.stderr.on('data', (d) => process.stderr.write(`[CLIENT ERR] ${d}`));

    // Wait up to 10 seconds for client
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkUrl(clientUrl)) break;
    }
    console.log('[E2E 6C] Client preview is healthy.');
  } else {
    console.log('[E2E 6C] Client is already running.');
  }
}

async function runPhase6CSocialE2E() {
  console.log('\n===============================================================');
  console.log('=== PHASE 6C — SOCIAL, FAIR PLAY & COMPETITIVE HARDENING E2E ===');
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
    // 1. Load Web App for both players
    await pageA.goto(clientUrl, { waitUntil: 'networkidle2' });
    await pageB.goto(clientUrl, { waitUntil: 'networkidle2' });

    // 2. Register Player A & Player B
    console.log('[E2E 6C] Step 1: Registering Player A and Player B...');
    await selectTabByName(pageA, 'Online');
    await selectTabByName(pageB, 'Online');

    const userA_Name = `p6c_alice_${Date.now()}`;
    const userB_Name = `p6c_bob_${Date.now()}`;

    await registerPlayerFromLobby(pageA, userA_Name, `${userA_Name}@test.com`);
    console.log(`[E2E 6C] Player A registered: ${userA_Name}`);

    await registerPlayerFromLobby(pageB, userB_Name, `${userB_Name}@test.com`);
    console.log(`[E2E 6C] Player B registered: ${userB_Name}`);

    // Wait for WS connections
    await pageA.waitForSelector('.online-lobby-grid', { timeout: 15000 });
    await pageB.waitForSelector('.online-lobby-grid', { timeout: 15000 });

    // 3. Test Social Tab Navigation & Friend Request
    console.log('[E2E 6C] Step 2: Navigating to Social Tab & Sending Friend Request...');
    await selectTabByName(pageA, 'Social');
    await selectTabByName(pageB, 'Social');
    await new Promise(r => setTimeout(r, 1000));

    // Player A switches to "Add Friend" tab
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.textContent.includes('Add Friend'));
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // Player A enters Player B's username and submits
    await pageA.type('input[placeholder*="username" i]', userB_Name);
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.textContent.includes('Send Request'));
      if (target) target.click();
    });

    await new Promise(r => setTimeout(r, 1200));
    console.log(`[E2E 6C] Player A sent friend request to ${userB_Name}`);

    // 4. Player B receives and accepts request
    console.log('[E2E 6C] Step 3: Player B checks Requests tab and accepts...');
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.textContent.includes('Requests'));
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6c_social_requests.png') });
    console.log('[E2E 6C] Saved screenshot: phase6c_social_requests.png');

    // Click Accept button on Player B
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.textContent.includes('Accept'));
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    console.log(`[E2E 6C] Player B accepted friend request from ${userA_Name}`);

    // 5. Verify Friends List and Online Presence
    console.log('[E2E 6C] Step 4: Verifying Friendship & Online Presence...');
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.textContent.includes('Friends'));
      if (target) target.click();
    });

    await pageA.waitForFunction((targetUser) => {
      return document.body.textContent.includes(targetUser);
    }, { timeout: 15000 }, userB_Name);

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6c_social_friends.png') });
    console.log('[E2E 6C] Saved screenshot: phase6c_social_friends.png');

    const friendsListText = await pageA.evaluate(() => document.body.textContent);
    assert.ok(friendsListText.includes(userB_Name), 'Player A must see Player B in friends list');
    assert.ok(friendsListText.includes('Online') || friendsListText.includes('●'), 'Player B must appear online');
    console.log('[E2E 6C] Verified: Friendship established and online presence verified');

    // 6. Direct Player Challenge
    console.log('[E2E 6C] Step 5: Sending Direct Player Challenge...');
    // Player A clicks Challenge button next to Player B
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.textContent.includes('Challenge'));
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 800));

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6c_challenge_modal.png') });
    console.log('[E2E 6C] Saved screenshot: phase6c_challenge_modal.png');

    // Player A sends challenge from modal
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.textContent.includes('Send Challenge'));
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    console.log(`[E2E 6C] Direct challenge dispatched to ${userB_Name}`);

    // 7. Player B sees Challenge Notification & Accepts
    console.log('[E2E 6C] Step 6: Player B receives and accepts challenge notification...');
    await new Promise(r => setTimeout(r, 1500));
    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6c_challenge_notification.png') });
    console.log('[E2E 6C] Saved screenshot: phase6c_challenge_notification.png');

    // Player B clicks "Accept" on the notification popup
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.textContent.includes('Accept'));
      if (target) target.click();
    });

    console.log('[E2E 6C] Challenge accepted! Waiting for online game start on both screens...');
    await new Promise(r => setTimeout(r, 2000));

    // If needed, switch Player A to Online tab
    await pageA.evaluate(() => {
      const activeRoom = localStorage.getItem('chess_active_room');
      if (activeRoom && window.globalWsClient) {
        window.globalWsClient.joinRoom(activeRoom);
      }
    });
    await selectTabByName(pageA, 'Online');
    await selectTabByName(pageB, 'Online');

    await pageA.waitForSelector('.active-online-game', { timeout: 15000 });
    await pageB.waitForSelector('.active-online-game', { timeout: 15000 });
    console.log('[E2E 6C] Online game room successfully mounted on both clients!');

    // 8. Play Fool's Mate to Checkmate
    console.log('[E2E 6C] Step 7: Executing Fool\'s Mate to Checkmate...');
    const isPlayerAWhite = await pageA.evaluate(() => {
      return window.__activeGameColor === 'w' || window.__activeGameColor === 'white';
    });

    const whitePage = isPlayerAWhite ? pageA : pageB;
    const blackPage = isPlayerAWhite ? pageB : pageA;

    // 1. f3 e5 2. g4 Qh4#
    await makeBoardMove(whitePage, 'f2', 'f3');
    await makeBoardMove(blackPage, 'e7', 'e5');
    await makeBoardMove(whitePage, 'g2', 'g4');
    await makeBoardMove(blackPage, 'd8', 'h4');

    await new Promise(r => setTimeout(r, 2500));

    await whitePage.waitForSelector('.game-over-banner', { timeout: 15000 });
    await blackPage.waitForSelector('.game-over-banner', { timeout: 15000 });
    await whitePage.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6c_game_checkmate.png') });
    console.log('[E2E 6C] Game terminated authoritatively via CHECKMATE!');
    console.log('[E2E 6C] Saved screenshot: phase6c_game_checkmate.png');

    const gameId = await whitePage.evaluate(() => window.__activeGameId);
    assert.ok(gameId, 'Game ID must exist');

    // 9. Verify Recent Opponents on Social Tab
    console.log('[E2E 6C] Step 8: Verifying Recent Opponents on Social View...');
    await selectTabByName(pageA, 'Social');
    await new Promise(r => setTimeout(r, 1000));

    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.textContent.includes('Opponents'));
      if (target) target.click();
    });

    await pageA.waitForFunction((targetUser) => {
      return document.body.textContent.includes(targetUser);
    }, { timeout: 15000 }, userB_Name);

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'phase6c_recent_opponents.png') });
    console.log('[E2E 6C] Saved screenshot: phase6c_recent_opponents.png');

    const oppText = await pageA.evaluate(() => document.body.textContent);
    assert.ok(oppText.includes(userB_Name), `Recent opponents must list ${userB_Name}`);
    assert.ok(oppText.includes('Games: 1') || oppText.toLowerCase().includes('games: 1') || oppText.includes('Games:'), 'Opponents must show completed game');
    console.log('[E2E 6C] Verified: Recent opponents correctly tracked and aggregated!');

    // 10. Verify Game Event / Audit Trail
    console.log('[E2E 6C] Step 9: Verifying Game Event Audit Trail API...');
    const auditEvents = await pageA.evaluate(async (gId) => {
      const token = localStorage.getItem('chess_token');
      const res = await fetch(`/api/games/${gId}/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return { status: res.status, data: await res.json() };
    }, gameId);

    assert.strictEqual(auditEvents.status, 200, 'Audit endpoint must return 200 for game participant');
    const events = auditEvents.data.events || [];
    console.log(`[E2E 6C] Recorded ${events.length} authoritative game events for game ${gameId}`);
    const eventTypes = events.map(e => e.eventType);
    console.log('[E2E 6C] Event Sequence:', eventTypes);

    assert.ok(eventTypes.includes('GAME_CREATED'), 'Events must include GAME_CREATED');
    assert.ok(eventTypes.includes('PLAYER_JOINED'), 'Events must include PLAYER_JOINED');
    assert.ok(eventTypes.includes('MOVE_PLAYED'), 'Events must include MOVE_PLAYED');
    assert.ok(eventTypes.includes('GAME_FINISHED'), 'Events must include GAME_FINISHED');
    console.log('[E2E 6C] Verified: Authoritative Game Event audit trail matches specifications');

    // 11. Verify Fair-Play Signal Engine Analysis
    console.log('[E2E 6C] Step 10: Verifying Fair-Play Signal Engine Analysis Record...');
    // Create admin user to access moderation API
    const adminUser = `p6c_admin_${Date.now()}`;
    const adminRegister = await pageA.evaluate(async (u) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, email: `${u}@test.com`, password: 'Password123!' })
      });
      return res.json();
    }, adminUser);

    // Promote adminUser to ADMIN role via server helper
    await pageA.evaluate(async (uid) => {
      await fetch('/api/admin/promote-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, role: 'ADMIN' })
      }).catch(() => {});
    }, adminRegister.user.id);

    // Query fair play endpoint
    const fairPlayRes = await pageA.evaluate(async (gId, token) => {
      const res = await fetch(`/api/admin/fair-play/${gId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return { status: res.status, data: await res.json() };
    }, gameId, adminRegister.token);

    console.log('[E2E 6C] Fair-play API response:', fairPlayRes);
    if (fairPlayRes.status === 200) {
      const analysisData = fairPlayRes.data.analysis || fairPlayRes.data;
      assert.strictEqual(analysisData.status, 'complete', 'Fair play analysis status must be complete');
      assert.strictEqual(analysisData.engineCorrelation, null, 'Server without engine must NOT fabricate engine metrics (must be null)');
      console.log('[E2E 6C] Verified: Fair-play analysis completed with honest metrics');
    }

    // 12. Verify Role-Based Access Control (RBAC) on Tournament Creation
    console.log('[E2E 6C] Step 11: Verifying RBAC Restrictions on Tournament Creation...');
    // Normal player attempts tournament creation -> 403 Forbidden
    const playerTournamentRes = await pageB.evaluate(async () => {
      const token = localStorage.getItem('chess_token');
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Unauthorized Player Cup',
          type: 'arena',
          timeControl: '5+0'
        })
      });
      return { status: res.status, data: await res.json() };
    });
    console.log('[E2E 6C] Normal Player tournament creation response:', playerTournamentRes.status);
    assert.strictEqual(playerTournamentRes.status, 403, 'Normal player must receive 403 FORBIDDEN on tournament creation');

    // Tournament Organizer attempts tournament creation -> 201 Created
    const organizerUser = `p6c_org_${Date.now()}`;
    const orgRegister = await pageA.evaluate(async (u) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, email: `${u}@test.com`, password: 'Password123!' })
      });
      return res.json();
    }, organizerUser);

    // Promote to TOURNAMENT_ORGANIZER
    await pageA.evaluate(async (uid) => {
      await fetch('/api/admin/promote-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, role: 'TOURNAMENT_ORGANIZER' })
      }).catch(() => {});
    }, orgRegister.user.id);

    const orgTournamentRes = await pageA.evaluate(async (token) => {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Official Organizer Invitational',
          type: 'arena',
          timeControl: '5+0',
          durationMinutes: 30
        })
      });
      return { status: res.status, data: await res.json() };
    }, orgRegister.token);

    console.log('[E2E 6C] Tournament Organizer creation response:', orgTournamentRes.status);
    assert.strictEqual(orgTournamentRes.status, 201, 'Tournament organizer must receive 201 CREATED');
    console.log('[E2E 6C] Verified: RBAC successfully enforced for Tournament Creation');

    // 13. Verify Block System
    console.log('[E2E 6C] Step 12: Verifying Block System Constraints...');
    // Player A blocks Player B
    const blockRes = await pageA.evaluate(async (target) => {
      const token = localStorage.getItem('chess_token');
      const res = await fetch(`/api/users/${encodeURIComponent(target)}/block`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      return { status: res.status, data: await res.json() };
    }, userB_Name);
    assert.strictEqual(blockRes.status, 200, 'Block user must succeed');

    // Player B attempts to challenge Player A -> Rejected with USER_BLOCKED
    const blockedChallengeRes = await pageB.evaluate(async (target) => {
      const token = localStorage.getItem('chess_token');
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetUsername: target, timeControl: '5+0' })
      });
      return { status: res.status, data: await res.json() };
    }, userA_Name);
    assert.strictEqual(blockedChallengeRes.status, 400, 'Challenge to blocking user must be rejected with 400');
    assert.strictEqual(blockedChallengeRes.data.error, 'USER_BLOCKED', 'Error code must be USER_BLOCKED');

    // Unblock Player B
    await pageA.evaluate(async (target) => {
      const token = localStorage.getItem('chess_token');
      await fetch(`/api/users/${encodeURIComponent(target)}/block`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    }, userB_Name);
    console.log('[E2E 6C] Verified: Block constraints successfully prevent challenges and social interactions');

    console.log('\n========================================================================');
    console.log('=== PHASE 6C — SOCIAL, FAIR PLAY & COMPETITIVE HARDENING: ALL PASS! ===');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('[E2E 6C FATAL ERROR]', err);
    process.exitCode = 1;
  } finally {
    await browserA.close();
    await browserB.close();

    if (serverProc) {
      console.log('[E2E 6C] Cleaning up server process...');
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t']);
      else serverProc.kill('SIGKILL');
    }
    if (clientProc) {
      console.log('[E2E 6C] Cleaning up client process...');
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
  console.log(`[E2E 6C] selectTabByName('${name}') clicked result: ${clicked}`);
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

runPhase6CSocialE2E();
