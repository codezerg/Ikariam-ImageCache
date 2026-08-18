import browser from '../lib/browser.js';

const KEY = 'imageStats';
let cache = null;
let saveTimer = null;

export async function load() {
  if (cache) return cache;
  const stored = await browser.storage.local.get(KEY);
  cache = stored[KEY] || {};
  return cache;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await browser.storage.local.set({ [KEY]: cache });
  }, 2000);
}

export async function merge(batch) {
  const stats = await load();
  for (const item of batch) {
    const prev = stats[item.url] || { count: 0, totalMs: 0, bytes: 0 };
    stats[item.url] = {
      count: prev.count + item.count,
      totalMs: Math.round(prev.totalMs + item.totalMs),
      bytes: item.bytes || prev.bytes,
    };
  }
  scheduleSave();
}

export async function all() {
  return load();
}

export async function clear() {
  cache = {};
  await browser.storage.local.set({ [KEY]: cache });
}
