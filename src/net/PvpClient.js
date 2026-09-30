/**
 * The socket to the PvP server — `server/room.js`, at `/pvp` on the same
 * host the page came from (so a phone only ever needs one address).
 *
 * It owns three things and nothing about the game:
 *
 *  - **The seat.** A random client id kept in localStorage (the stats are
 *    keyed by it) and the server's session token kept in sessionStorage, sent
 *    back on every reconnect so the server puts the phone back in its seat
 *    rather than giving it a new one.
 *  - **Reconnecting.** A dropped socket is retried with backoff for as long as
 *    the server holds the seat (`graceMs`); nothing above has to notice
 *    beyond the `status` callback.
 *  - **The clock.** A ping every two seconds; the offset to the server's clock
 *    and the round trip are smoothed from the best recent samples. Everything
 *    time-stamped on the wire is on the server's clock.
 */
export class PvpClient {
  /**
   * @param {object} options
   * @param {(msg: object) => void} options.onMessage
   * @param {(status: 'connecting'|'online'|'reconnecting'|'offline') => void} [options.onStatus]
   * @param {string} [options.url]
   */
  constructor({ onMessage, onStatus = () => {}, url = defaultUrl(), graceMs = 20000 }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.url = url;
    this.graceMs = graceMs;
    this.clientId = stored(localStorage, 'samurai.clientId', () =>
      Math.random().toString(36).slice(2) + Date.now().toString(36)
    );
    this.token = safeGet(sessionStorage, 'samurai.token');
    this.ws = null;
    this.status = 'offline';
    /** Server clock − local clock, ms. */
    this.offset = 0;
    /** Round trip, ms. */
    this.rtt = 80;
    this._samples = [];
    this._closing = false;
    this._droppedAt = 0;
    this._retry = 0;
    this._ping = null;
    this.name = 'Samurai';
  }

  /** Server time now, ms. */
  now() {
    return performance.now() + this.offset;
  }

  connect(name) {
    if (name) this.name = name;
    this._closing = false;
    this._open();
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  close() {
    this._closing = true;
    clearInterval(this._ping);
    clearTimeout(this._timer);
    this.ws?.close();
    this.ws = null;
    this._setStatus('offline');
  }

  /* ------------------------------------------------------------------ */

  _open() {
    clearTimeout(this._timer);
    this._setStatus(this._droppedAt ? 'reconnecting' : 'connecting');
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this._scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this._retry = 0;
      ws.send(
        JSON.stringify({
          type: 'hello',
          clientId: this.clientId,
          token: this.token,
          name: this.name,
          latency: this.rtt
        })
      );
      this._pingNow();
      clearInterval(this._ping);
      this._ping = setInterval(() => this._pingNow(), 2000);
    };
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'pong') return this._pong(msg);
      if (msg.type === 'welcome') {
        this.token = msg.token;
        safeSet(sessionStorage, 'samurai.token', msg.token);
        this._droppedAt = 0;
        this._setStatus('online');
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      clearInterval(this._ping);
      this.ws = null;
      if (this._closing) return;
      if (!this._droppedAt) this._droppedAt = performance.now();
      this._scheduleRetry();
    };
    ws.onerror = () => {};
  }

  _scheduleRetry() {
    if (this._closing) return;
    if (this._droppedAt && performance.now() - this._droppedAt > this.graceMs) {
      // The server has let the seat go by now; start over as a new player.
      this.token = null;
      safeSet(sessionStorage, 'samurai.token', '');
      this._droppedAt = 0;
      this._setStatus('offline');
      return;
    }
    this._setStatus('reconnecting');
    const wait = Math.min(3000, 300 * 2 ** this._retry++);
    this._timer = setTimeout(() => this._open(), wait);
  }

  _pingNow() {
    this.send({ type: 'ping', c: performance.now() });
  }

  _pong(msg) {
    const now = performance.now();
    const rtt = now - msg.c;
    this._samples.push({ rtt, offset: msg.s + rtt / 2 - now });
    if (this._samples.length > 8) this._samples.shift();
    // The lowest round trips are the least disturbed samples.
    const best = this._samples.slice().sort((a, b) => a.rtt - b.rtt).slice(0, 3);
    this.rtt = best.reduce((t, s) => t + s.rtt, 0) / best.length;
    this.offset = best.reduce((t, s) => t + s.offset, 0) / best.length;
  }

  _setStatus(status) {
    if (status === this.status) return;
    this.status = status;
    this.onStatus(status);
  }
}

function defaultUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/pvp`;
}

function safeGet(storage, key) {
  try {
    return storage.getItem(key) || null;
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // Private mode: the seat simply does not survive a reload.
  }
}

function stored(storage, key, make) {
  const existing = safeGet(storage, key);
  if (existing) return existing;
  const value = make();
  safeSet(storage, key, value);
  return value;
}
