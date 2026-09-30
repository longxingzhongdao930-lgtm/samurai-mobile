/**
 * The duel's screens: the room panel, and the match HUD over the fight.
 *
 * Plain DOM, sized for a thumb first (every control is at least 44px tall) —
 * the same panel serves a phone and a desktop. It knows nothing about the
 * socket: every button calls a hook, and `PvpMode` pushes state in through
 * `show*` / `set*`.
 */
export class PvpMenu {
  /**
   * @param {object} hooks
   * @param {() => void} hooks.onOpen
   * @param {() => void} hooks.onClose
   * @param {(name: string) => void} hooks.onCreate
   * @param {(code: string, name: string) => void} hooks.onJoin
   * @param {() => void} hooks.onReady
   * @param {() => void} hooks.onLeave
   * @param {() => void} hooks.onRematch
   */
  constructor(hooks) {
    this.hooks = hooks;

    this.button = el('button', 'pvp-open', 'PvP 対戦');
    this.button.type = 'button';
    this.button.addEventListener('click', () => hooks.onOpen());
    this.button.addEventListener('pointerdown', (e) => e.stopPropagation());

    /* ---- the panel ---- */
    this.panel = el('div', 'pvp-panel');
    this.panel.hidden = true;
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.panel.addEventListener('keydown', (e) => e.stopPropagation());

    const head = el('div', 'pvp-panel__head');
    head.append(el('span', 'pvp-panel__title', '対戦 · 1v1'));
    this.close = el('button', 'pvp-btn pvp-btn--ghost', '×');
    this.close.type = 'button';
    this.close.addEventListener('click', () => hooks.onClose());
    head.append(this.close);

    this.status = el('p', 'pvp-panel__status', 'Offline');
    this.stats = el('p', 'pvp-panel__stats', '');

    // Out of a room: a name, create, or a code to join.
    this.lobby = el('div', 'pvp-panel__lobby');
    this.name = input('pvp-input', 'Name', 16);
    this.name.value = safeGet('samurai.name') || '';
    const create = button('Create room', () => hooks.onCreate(this._name()));
    this.code = input('pvp-input pvp-input--code', 'CODE', 4);
    this.code.autocapitalize = 'characters';
    const join = button('Join', () => hooks.onJoin(this.code.value.toUpperCase(), this._name()));
    const row = el('div', 'pvp-row');
    row.append(this.code, join);
    this.lobby.append(this.name, create, row);

    // In a room: the code, both seats, ready / leave.
    this.room = el('div', 'pvp-panel__room');
    this.roomCode = el('p', 'pvp-code', '');
    this.seats = el('div', 'pvp-seats');
    this.readyBtn = button('Ready', () => hooks.onReady());
    this.rematchBtn = button('Rematch', () => hooks.onRematch());
    this.leaveBtn = button('Leave', () => hooks.onLeave(), 'pvp-btn--ghost');
    this.result = el('p', 'pvp-result', '');
    this.room.append(this.roomCode, this.result, this.seats, this.readyBtn, this.rematchBtn, this.leaveBtn);

    this.error = el('p', 'pvp-panel__error', '');
    this.panel.append(head, this.status, this.stats, this.lobby, this.room, this.error);

    /* ---- the match HUD ---- */
    this.hud = el('div', 'pvp-hud');
    this.hud.hidden = true;
    this.score = el('div', 'pvp-hud__score', '');
    const opp = el('div', 'pvp-hud__opp');
    this.oppName = el('span', 'pvp-hud__name', 'Opponent');
    const track = el('span', 'pvp-hud__track');
    this.oppFill = el('i', 'pvp-hud__fill');
    track.append(this.oppFill);
    this.oppValue = el('span', 'pvp-hud__value', '100');
    opp.append(this.oppName, track, this.oppValue);
    this.net = el('span', 'pvp-hud__net', '');
    this.hud.append(this.score, opp, this.net);

    this.banner = el('div', 'pvp-banner');
    this.banner.hidden = true;

    document.body.append(this.button, this.panel, this.hud, this.banner);
  }

  _name() {
    const name = (this.name.value || 'Samurai').trim().slice(0, 16);
    safeSet('samurai.name', name);
    return name;
  }

  /* ------------------------------------------------------------------ */

  open() {
    this.panel.hidden = false;
  }

  hide() {
    // A button still focused inside the hidden panel would keep taking the
    // keyboard (the panel stops its keys), and K / J would never reach the game.
    if (this.panel.contains(document.activeElement)) document.activeElement.blur();
    this.panel.hidden = true;
  }

  get visible() {
    return !this.panel.hidden;
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  setStats(stats) {
    if (!stats) return;
    this.stats.textContent = `勝 ${stats.wins} · 敗 ${stats.losses} · 戦 ${stats.played}`;
  }

  setError(text) {
    this.error.textContent = text || '';
  }

  /** @param {object|null} room the server's `room` message, or null out of a room */
  setRoom(room) {
    this.lobby.hidden = !!room;
    this.room.hidden = !room;
    if (!room) return;
    this.roomCode.textContent = `Room ${room.code}`;
    this.seats.replaceChildren(
      ...room.players.map((p, slot) => {
        const seat = el('div', 'pvp-seat');
        if (!p) {
          seat.textContent = 'Waiting for opponent…';
          seat.classList.add('is-empty');
          return seat;
        }
        const tag = slot === room.you ? ' (you)' : '';
        const state = !p.connected
          ? 'reconnecting…'
          : room.phase === 'matchEnd'
            ? p.rematch
              ? 'rematch ✓'
              : ''
            : p.ready
              ? 'ready ✓'
              : '';
        seat.textContent = `${p.name}${tag}  ${state}`;
        seat.classList.toggle('is-ready', !!(p.ready || p.rematch));
        return seat;
      })
    );
    const me = room.players[room.you];
    const lobby = room.phase === 'lobby';
    const ended = room.phase === 'matchEnd';
    this.readyBtn.hidden = !lobby;
    this.readyBtn.textContent = me?.ready ? 'Not ready' : 'Ready';
    this.readyBtn.disabled = !room.players.every(Boolean);
    this.rematchBtn.hidden = !ended;
    this.rematchBtn.disabled = !!me?.rematch;
    if (!ended) this.result.textContent = '';
  }

  setResult(text) {
    this.result.textContent = text;
  }

  /* ---- match HUD ---- */

  showHud(on) {
    this.hud.hidden = !on;
    this.button.hidden = on;
  }

  setScore(score, you, round) {
    const mine = score[you] ?? 0;
    const theirs = score[1 - you] ?? 0;
    const dots = (n) => '●'.repeat(n) + '○'.repeat(Math.max(0, 2 - n));
    this.score.textContent = `${dots(mine)}  R${round}  ${dots(theirs)}`;
  }

  setOpponent(name, hp, max) {
    this.oppName.textContent = name || 'Opponent';
    this.oppValue.textContent = String(Math.max(0, Math.round(hp)));
    this.oppFill.style.transform = `scaleX(${Math.max(0, hp) / max})`;
  }

  setNet(rtt, status) {
    this.net.textContent = status === 'online' ? `${Math.round(rtt)} ms` : status;
  }

  /** A big line across the middle — the countdown, a round result. Empty hides it. */
  setBanner(text) {
    this.banner.hidden = !text;
    if (text && this.banner.textContent !== text) this.banner.textContent = text;
  }

  dispose() {
    this.button.remove();
    this.panel.remove();
    this.hud.remove();
    this.banner.remove();
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, onClick, extra = '') {
  const b = el('button', `pvp-btn ${extra}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function input(className, placeholder, max) {
  const i = el('input', className);
  i.placeholder = placeholder;
  i.maxLength = max;
  i.autocomplete = 'off';
  i.spellcheck = false;
  return i;
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // no storage: the name is asked for again next time
  }
}
