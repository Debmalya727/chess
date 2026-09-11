import net from 'net';

/**
 * Lightweight in-memory Redis RESP server for testing multi-instance horizontal scaling.
 * Supports PING, SET, GET, DEL, EXISTS, SADD, SREM, SMEMBERS, SCARD, MGET, INCR, PEXPIRE,
 * EVAL (custom Lua scripts), SUBSCRIBE, UNSUBSCRIBE, and PUBLISH.
 */
export class TestRedisServer {
  constructor(port = 6379) {
    this.port = port;
    this.server = null;
    this.kv = new Map(); // key -> { val, expireAt }
    this.sets = new Map(); // key -> Set
    this.lists = new Map(); // key -> Array
    this.subscribers = new Map(); // channel -> Set<net.Socket>
    this.socketSubs = new Map(); // net.Socket -> Set<channel>
  }

  _isExpired(item) {
    if (!item || !item.expireAt) return false;
    return Date.now() > item.expireAt;
  }

  _getVal(key) {
    const item = this.kv.get(key);
    if (!item) return null;
    if (this._isExpired(item)) {
      this.kv.delete(key);
      return null;
    }
    return item.val;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = '';

        this.socketSubs.set(socket, new Set());

        socket.on('data', (data) => {
          buffer += data.toString('utf-8');

          while (buffer.length > 0) {
            const parsed = this._parseCommand(buffer);
            if (!parsed) break;
            const { command, args, bytesConsumed } = parsed;
            buffer = buffer.slice(bytesConsumed);
            // console.log('[TestRedisServer]', command, args);
            this._handleCommand(socket, command, args);
          }
        });

        socket.on('close', () => {
          const subs = this.socketSubs.get(socket);
          if (subs) {
            for (const ch of subs) {
              const chSubs = this.subscribers.get(ch);
              if (chSubs) {
                chSubs.delete(socket);
                if (chSubs.size === 0) this.subscribers.delete(ch);
              }
            }
          }
          this.socketSubs.delete(socket);
        });

        socket.on('error', () => {});
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        resolve(this.port);
      });

      this.server.on('error', reject);
    });
  }

  stop() {
    return new Promise((resolve) => {
      for (const [sock] of this.socketSubs) {
        try { sock.destroy(); } catch {}
      }
      this.socketSubs.clear();
      this.subscribers.clear();
      this.kv.clear();
      this.sets.clear();
      this.lists.clear();
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  _parseCommand(buf) {
    if (!buf.includes('\r\n')) return null;

    if (buf[0] === '*') {
      // Array command: *<count>\r\n$<len>\r\n<arg>\r\n...
      const firstLineEnd = buf.indexOf('\r\n');
      const count = parseInt(buf.slice(1, firstLineEnd), 10);
      let offset = firstLineEnd + 2;
      const args = [];

      for (let i = 0; i < count; i++) {
        if (offset >= buf.length) return null;
        if (buf[offset] !== '$') return null;
        const lenEnd = buf.indexOf('\r\n', offset);
        if (lenEnd === -1) return null;
        const len = parseInt(buf.slice(offset + 1, lenEnd), 10);
        offset = lenEnd + 2;
        if (buf.length < offset + len + 2) return null;
        const arg = buf.slice(offset, offset + len);
        args.push(arg);
        offset += len + 2;
      }

      if (args.length === 0) return null;
      return {
        command: args[0].toUpperCase(),
        args: args.slice(1),
        bytesConsumed: offset
      };
    } else {
      // Inline command: PING\r\n
      const lineEnd = buf.indexOf('\r\n');
      const line = buf.slice(0, lineEnd).trim();
      const parts = line.split(/\s+/);
      return {
        command: parts[0].toUpperCase(),
        args: parts.slice(1),
        bytesConsumed: lineEnd + 2
      };
    }
  }

  _handleCommand(socket, command, args) {
    switch (command) {
      case 'HELLO':
        socket.write("-ERR unknown command 'HELLO'\r\n");
        break;

      case 'PING':
        socket.write('+PONG\r\n');
        break;

      case 'COMMAND':
        socket.write('*0\r\n');
        break;

      case 'CLIENT':
        socket.write('+OK\r\n');
        break;

      case 'INFO':
        socket.write('$11\r\nredis_ver:7\r\n');
        break;

      case 'SET': {
        const [key, val, ...extra] = args;
        let expireAt = null;
        for (let i = 0; i < extra.length; i++) {
          if (extra[i].toUpperCase() === 'EX') {
            expireAt = Date.now() + parseInt(extra[i + 1], 10) * 1000;
          } else if (extra[i].toUpperCase() === 'PX') {
            expireAt = Date.now() + parseInt(extra[i + 1], 10);
          }
        }
        this.kv.set(key, { val, expireAt });
        socket.write('+OK\r\n');
        break;
      }

      case 'GET': {
        const [key] = args;
        const val = this._getVal(key);
        if (val === null || val === undefined) {
          socket.write('$-1\r\n');
        } else {
          socket.write(`$${Buffer.byteLength(val)}\r\n${val}\r\n`);
        }
        break;
      }

      case 'DEL': {
        let count = 0;
        for (const key of args) {
          if (this.kv.delete(key)) count++;
          if (this.sets.delete(key)) count++;
        }
        socket.write(`:${count}\r\n`);
        break;
      }

      case 'EXISTS': {
        let count = 0;
        for (const key of args) {
          if (this._getVal(key) !== null || this.sets.has(key)) count++;
        }
        socket.write(`:${count}\r\n`);
        break;
      }

      case 'SADD': {
        const [key, ...members] = args;
        let set = this.sets.get(key);
        if (!set) {
          set = new Set();
          this.sets.set(key, set);
        }
        let added = 0;
        for (const m of members) {
          if (!set.has(m)) {
            set.add(m);
            added++;
          }
        }
        socket.write(`:${added}\r\n`);
        break;
      }

      case 'SREM': {
        const [key, ...members] = args;
        const set = this.sets.get(key);
        let removed = 0;
        if (set) {
          for (const m of members) {
            if (set.delete(m)) removed++;
          }
        }
        socket.write(`:${removed}\r\n`);
        break;
      }

      case 'SMEMBERS': {
        const [key] = args;
        const set = this.sets.get(key);
        if (!set || set.size === 0) {
          socket.write('*0\r\n');
        } else {
          const members = Array.from(set);
          let res = `*${members.length}\r\n`;
          for (const m of members) {
            res += `$${Buffer.byteLength(m)}\r\n${m}\r\n`;
          }
          socket.write(res);
        }
        break;
      }

      case 'SCARD': {
        const [key] = args;
        const set = this.sets.get(key);
        socket.write(`:${set ? set.size : 0}\r\n`);
        break;
      }

      case 'MGET': {
        let res = `*${args.length}\r\n`;
        for (const k of args) {
          const v = this._getVal(k);
          if (v === null || v === undefined) {
            res += '$-1\r\n';
          } else {
            res += `$${Buffer.byteLength(v)}\r\n${v}\r\n`;
          }
        }
        socket.write(res);
        break;
      }

      case 'INCR': {
        const [key] = args;
        const current = parseInt(this._getVal(key) || '0', 10) + 1;
        const item = this.kv.get(key);
        this.kv.set(key, { val: String(current), expireAt: item ? item.expireAt : null });
        socket.write(`:${current}\r\n`);
        break;
      }

      case 'PEXPIRE': {
        const [key, msStr] = args;
        const item = this.kv.get(key);
        if (item) {
          item.expireAt = Date.now() + parseInt(msStr, 10);
          socket.write(':1\r\n');
        } else {
          socket.write(':0\r\n');
        }
        break;
      }

      case 'RPUSH': {
        const [key, ...items] = args;
        let list = this.lists.get(key);
        if (!list) {
          list = [];
          this.lists.set(key, list);
        }
        for (const it of items) {
          list.push(it);
        }
        socket.write(`:${list.length}\r\n`);
        break;
      }

      case 'LRANGE': {
        const [key, startStr, stopStr] = args;
        const list = this.lists.get(key) || [];
        let start = parseInt(startStr, 10);
        let stop = parseInt(stopStr, 10);
        if (start < 0) start = Math.max(0, list.length + start);
        if (stop < 0) stop = Math.max(0, list.length + stop);
        else stop = Math.min(list.length - 1, stop);

        const slice = (start <= stop && start < list.length) ? list.slice(start, stop + 1) : [];
        let res = `*${slice.length}\r\n`;
        for (const item of slice) {
          res += `$${Buffer.byteLength(item)}\r\n${item}\r\n`;
        }
        socket.write(res);
        break;
      }

      case 'EVAL': {
        const [script, numKeysStr, ...rest] = args;
        const numKeys = parseInt(numKeysStr, 10);
        const keys = rest.slice(0, numKeys);
        const scriptArgs = rest.slice(numKeys);

        if (script.includes('claimA')) {
          // CLAIM_PAIR_LUA: claimA=keys[0], claimB=keys[1], token=scriptArgs[0], ttl=scriptArgs[1]
          const claimA = keys[0];
          const claimB = keys[1];
          const token = scriptArgs[0];
          const ttl = parseInt(scriptArgs[1], 10);

          if (this._getVal(claimA) !== null || this._getVal(claimB) !== null) {
            socket.write(':0\r\n'); // Already claimed
          } else {
            const exp = Date.now() + ttl;
            this.kv.set(claimA, { val: token, expireAt: exp });
            this.kv.set(claimB, { val: token, expireAt: exp });
            socket.write(':1\r\n'); // Successfully claimed
          }
        } else if (script.includes('INCR') || script.includes('windowMs')) {
          // RATE_LIMIT_LUA: key=keys[0], limit=scriptArgs[0], windowMs=scriptArgs[1]
          const key = keys[0];
          const limit = parseInt(scriptArgs[0], 10);
          const windowMs = parseInt(scriptArgs[1], 10);

          let item = this.kv.get(key);
          let current = 1;
          if (!item || this._isExpired(item)) {
            this.kv.set(key, { val: '1', expireAt: Date.now() + windowMs });
          } else {
            current = parseInt(item.val, 10) + 1;
            item.val = String(current);
          }

          if (current > limit) {
            socket.write(':0\r\n');
          } else {
            socket.write(':1\r\n');
          }
        } else if (script.includes('del') && script.includes('get')) {
          // RELEASE_LOCK_LUA: keys[0] = lockKey, scriptArgs[0] = token
          const lockKey = keys[0];
          const token = scriptArgs[0];
          const current = this._getVal(lockKey);
          if (current === token) {
            this.kv.delete(lockKey);
            socket.write(':1\r\n');
          } else {
            socket.write(':0\r\n');
          }
        } else {
          socket.write('+OK\r\n');
        }
        break;
      }

      case 'SUBSCRIBE': {
        for (const channel of args) {
          if (!this.subscribers.has(channel)) {
            this.subscribers.set(channel, new Set());
          }
          this.subscribers.get(channel).add(socket);
          this.socketSubs.get(socket).add(channel);

          const totalSubs = this.socketSubs.get(socket).size;
          socket.write(`*3\r\n$9\r\nsubscribe\r\n$${Buffer.byteLength(channel)}\r\n${channel}\r\n:${totalSubs}\r\n`);
        }
        break;
      }

      case 'UNSUBSCRIBE': {
        for (const channel of args) {
          const chSubs = this.subscribers.get(channel);
          if (chSubs) {
            chSubs.delete(socket);
          }
          const socketChannels = this.socketSubs.get(socket);
          if (socketChannels) {
            socketChannels.delete(channel);
          }
          const totalSubs = socketChannels ? socketChannels.size : 0;
          socket.write(`*3\r\n$11\r\nunsubscribe\r\n$${Buffer.byteLength(channel)}\r\n${channel}\r\n:${totalSubs}\r\n`);
        }
        break;
      }

      case 'PUBLISH': {
        const [channel, message] = args;
        const chSubs = this.subscribers.get(channel);
        let delivered = 0;
        if (chSubs && chSubs.size > 0) {
          const payload = `*3\r\n$7\r\nmessage\r\n$${Buffer.byteLength(channel)}\r\n${channel}\r\n$${Buffer.byteLength(message)}\r\n${message}\r\n`;
          for (const subscriberSocket of chSubs) {
            try {
              subscriberSocket.write(payload);
              delivered++;
            } catch {}
          }
        }
        socket.write(`:${delivered}\r\n`);
        break;
      }

      default:
        socket.write('+OK\r\n');
        break;
    }
  }
}
