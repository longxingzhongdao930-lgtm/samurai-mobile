import { settings } from '../config/settings.js';

/** What each level means, in words. */
const DESCRIBE = {
  blade: (v) => `攻撃 ×${v.toFixed(2)}`,
  body: (v) => `体力 ${v}`,
  spirit: (v) => `無双ゲージ ×${v.toFixed(2)}`
};

/**
 * 強化 — spend red souls on the blade, the body and the Musou.
 *
 * A small panel in the same lacquer as the PvP one, sized for a thumb (every
 * button at least 44px). It knows nothing of the game beyond `Progress`: the
 * app opens it (pausing the world) and reads the levels back when a blow or a
 * gauge needs them.
 */
export class UpgradeMenu {
  /**
   * @param {object} options
   * @param {import('../combat/Progress.js').Progress} options.progress
   * @param {() => void} options.onClose
   * @param {(id: string) => void} [options.onBuy]
   */
  constructor({ progress, onClose, onBuy = () => {} }) {
    this.progress = progress;
    this.onBuy = onBuy;

    this.panel = document.createElement('div');
    this.panel.className = 'upg';
    this.panel.hidden = true;
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());

    const head = document.createElement('div');
    head.className = 'upg__head';
    const title = document.createElement('span');
    title.className = 'upg__title';
    title.textContent = '強化 · Upgrade';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'upg__btn upg__btn--ghost';
    close.textContent = '×';
    close.addEventListener('click', () => onClose());
    head.append(title, close);

    this.wallet = document.createElement('p');
    this.wallet.className = 'upg__wallet';

    this.rows = document.createElement('div');
    this.rows.className = 'upg__rows';

    this.panel.append(head, this.wallet, this.rows);
    document.body.append(this.panel);
  }

  get visible() {
    return !this.panel.hidden;
  }

  open() {
    this.render();
    this.panel.hidden = false;
  }

  hide() {
    if (this.panel.contains(document.activeElement)) document.activeElement.blur();
    this.panel.hidden = true;
  }

  render() {
    const p = this.progress;
    this.wallet.textContent = `赤の魂  ${p.souls}`;
    const rows = Object.entries(settings.upgrades.tracks).map(([id, track]) => {
      const row = document.createElement('div');
      row.className = 'upg__row';
      const name = document.createElement('div');
      name.className = 'upg__name';
      const lv = p.level(id);
      const max = track.values.length;
      name.innerHTML = `<b>${track.label}</b><span>Lv ${lv}/${max} · ${(DESCRIBE[id] ?? String)(p.value(id))}</span>`;
      const cost = p.cost(id);
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'upg__btn';
      if (cost === null) {
        buy.textContent = 'MAX';
        buy.disabled = true;
      } else {
        buy.textContent = `強化 ${cost}`;
        buy.disabled = p.souls < cost;
        buy.addEventListener('click', () => {
          if (p.buy(id)) this.onBuy(id);
          this.render();
        });
      }
      row.append(name, buy);
      return row;
    });
    this.rows.replaceChildren(...rows);
  }

  dispose() {
    this.panel.remove();
  }
}
