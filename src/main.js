import { App } from './core/App.js';
import { LoadingScreen } from './ui/LoadingScreen.js';
import { settings } from './config/settings.js';
import { applyGameSettings } from './game/data/gameSettings.js';
import { Game } from './game/Game.js';
import { Stage } from './game/world/Stage.js';
import { Flow } from './game/Flow.js';

/**
 * Entry point.
 *
 * Everything interesting lives in `core/App.js`; this file only wires the app
 * to the page and reports fatal boot errors somewhere the user can see them.
 */
const canvas = document.getElementById('viewport');

async function boot() {
  try {
    // `?dev` opens the original template (studio, editor, abilities); the
    // default is the trial.
    const params = new URLSearchParams(window.location.search);
    const mode = params.has('dev') ? 'dev' : 'game';
    if (mode === 'game') applyGameSettings();
    const sandbox = params.has('sandbox');
    const app = new App(canvas, {
      mode,
      Game,
      Stage: sandbox ? null : Stage,
      Flow: sandbox ? null : Flow
    });
    await app.load();

    // Handy for poking at the scene from the console. Nothing caches a value
    // out of `settings`, so writing to it from there re-lights the stage live.
    window.app = app;
    window.settings = settings;
  } catch (error) {
    console.error('[boot] failed to start', error);
    new LoadingScreen().fail(
      error?.message ? `Failed to start: ${error.message}` : 'Failed to start — see the console.'
    );
  }
}

boot();
