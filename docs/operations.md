# Operational Runbook & Maintenance Guide

## 1. Fast Incident Response Runbooks

### Incident 1: Application Down / 502 Bad Gateway
1. **Check Process Status**:
   ```bash
   # Verify Node.js process is active
   ps aux | grep node
   ```
2. **Inspect Process Logs**:
   ```bash
   # Check stderr for uncaught exceptions or startup rejections
   tail -n 100 /var/log/chess/error.log
   ```
3. **Verify Liveness and Readiness**:
   ```bash
   curl -i http://127.0.0.1:8000/health
   curl -i http://127.0.0.1:8000/readiness
   ```
4. **Action**: If process crashed, restart with systemd or container orchestrator. Ensure port is not bound by orphaned processes.

---

### Incident 2: Redis Unavailable
1. **Check Redis Connectivity**:
   ```bash
   redis-cli -u $REDIS_URL PING
   ```
2. **Behavior**:
   - In production (`REDIS_REQUIRED=true`), `/readiness` returns HTTP 503.
   - Fastify attempts automatic reconnection every 100ms..2000ms.
   - Active games maintain persistence in TiDB.
3. **Action**: Restart Redis service. Once Redis answers `PONG`, Fastify auto-reconnects and resubscribes to Pub/Sub within 2 seconds.

---

### Incident 3: TiDB Unavailable
1. **Check Database Port & TLS Connectivity**:
   ```bash
   mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASSWORD -e "SELECT 1;"
   ```
2. **Behavior**:
   - `/readiness` immediately returns HTTP 503.
   - Moves cannot be fabricated or accepted without TiDB acknowledgment.
   - Fastify connection pool queues queries up to limit, rejecting gracefully with 500 error sanitization.
3. **Action**: Check TiDB cluster status in TiDB Cloud Console. Once cluster recovers, pool resumes normal execution.

---

### Incident 4: WebSocket Disconnections or Message Lag
1. **Check System File Descriptors & Socket Limits**:
   ```bash
   ulimit -n
   netstat -an | grep :8000 | grep ESTABLISHED | wc -l
   ```
2. **Check Pub/Sub Channel Latency**:
   Verify peer instances can publish and receive messages across `chess:game:*`.
3. **Inspect Heartbeat Keys**:
   Check presence keys in Redis:
   ```bash
   redis-cli -u $REDIS_URL KEYS "chess:presence:*"
   ```

---

### Incident 5: Game Inconsistency or Desync Report
If a player reports a move desynchronization or clock error:
1. **Run Authoritative Diagnostics Query**:
   ```sql
   SELECT g.id, g.status, g.turn, g.result, COUNT(m.id) as move_count, MAX(m.ply) as max_ply
   FROM games g
   LEFT JOIN game_moves m ON g.id = m.game_id
   WHERE g.id = 'TARGET_GAME_ID'
   GROUP BY g.id;
   ```
2. **Inspect Audit Trail**:
   ```sql
   SELECT id, event_type, user_id, ply, created_at 
   FROM game_events 
   WHERE game_id = 'TARGET_GAME_ID' 
   ORDER BY id ASC;
   ```
3. **Force Room Rehydration**:
   If an in-memory session was corrupted on a node, restarting that node forces instant re-read of authoritative FEN and plies from TiDB.

---

## 2. Zero-Downtime Rolling Restart & Release Procedure

```
[Load Balancer]
     │
     ├─► Step 1: Remove Node A from upstream rotation
     │   (Wait 10s for in-flight requests to complete)
     │
     ├─► Step 2: Deploy new release to Node A
     │   Verify: curl http://127.0.0.1:8001/readiness -> 200
     │
     ├─► Step 3: Re-add Node A to upstream rotation
     │
     ├─► Step 4: Remove Node B from upstream rotation
     │   Deploy new release to Node B
     │   Verify: curl http://127.0.0.1:8002/readiness -> 200
     │
     └─► Step 5: Re-add Node B to upstream rotation
```

---

## 3. Rollback Procedure

If severe anomalies or regressions are detected post-deployment:
1. **Stop Rollout Immediately**: Freeze automated deployment pipelines.
2. **Direct Ingress Traffic to Previous Stable Revision**:
   Update load balancer upstreams to the previous stable release artifact/image.
3. **Database Migration Safety**:
   - Do NOT execute destructive schema rollbacks (`DROP TABLE`, `DROP COLUMN`) against live databases.
   - All migrations are additive and backward-compatible with N-1 revisions.
4. **Verify Health and Smoke Tests**:
   ```bash
   node tests/e2e/phase10-release-smoke.e2e.cjs
   ```

---

## 4. Secret Rotation Runbook

### Database Password Rotation
1. In TiDB Cloud, create a secondary SQL user or update the user password with zero downtime if supported.
2. Update `DB_PASSWORD` in application environment variables.
3. Perform a rolling restart of Fastify nodes. Old connections terminate gracefully; new connections authenticate with updated credentials.

### JWT Secret Rotation
1. For zero-interruption rotation, configure backend to accept dual secrets (Primary for signing, Secondary for verification during 24-hour grace period).
2. Deploy new `JWT_SECRET`.
3. Existing active sessions re-authenticate upon expiry (access token lifetime: 24h).
