import { CREATURES, CAMP_CHARACTERS } from '../config/creatures.js';

/** Small, keyboard-accessible way to find the six additions in the world. */
export class CharacterRoster {
  constructor(onSelect) {
    this.element = document.createElement('details');
    this.element.className = 'character-roster';
    const summary = document.createElement('summary');
    summary.textContent = 'Characters · 6';
    this.element.append(summary);
    for (const definition of [...CREATURES, ...CAMP_CHARACTERS]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = definition.label;
      const role = document.createElement('small');
      role.textContent = definition.role ?? 'Battle encounter';
      button.append(role);
      button.addEventListener('click', () => {
        onSelect(definition.id);
        this.element.open = false;
      });
      this.element.append(button);
    }
    const credits = document.createElement('a');
    credits.href = './model-credits.html';
    credits.target = '_blank';
    credits.rel = 'noopener';
    credits.textContent = 'Model credits';
    this.element.append(credits);
    // UI presses must not also mark targets or operate the camera behind it.
    for (const event of ['pointerdown', 'pointerup', 'click', 'wheel']) {
      this.element.addEventListener(event, e => e.stopPropagation());
    }
    this.element.addEventListener('keydown', e => e.stopPropagation());
    document.body.append(this.element);
  }

  dispose() { this.element.remove(); }
}
