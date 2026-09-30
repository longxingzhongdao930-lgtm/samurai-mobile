/**
 * Win / loss / played per player, kept in a JSON file next to the server.
 *
 * Keyed by the client's own random id (kept in its localStorage) — there are
 * no accounts. Written a moment after each change rather than on every one.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { memoryStats } from './room.js';

const DEFAULT_FILE = resolve(dirname(fileURLToPath(import.meta.url)), 'stats.json');

export function fileStats(file = DEFAULT_FILE) {
  let initial = {};
  try {
    initial = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    initial = {};
  }
  const stats = memoryStats(initial);
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        writeFileSync(file, JSON.stringify(stats.data, null, 1));
      } catch (error) {
        console.warn('[pvp] could not save stats', error.message);
      }
    }, 300);
  };
  return {
    get: stats.get,
    data: stats.data,
    record(id, result) {
      const out = stats.record(id, result);
      save();
      return out;
    }
  };
}
