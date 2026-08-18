import browser from '../lib/browser.js';
import { MSG } from '../lib/messages.js';
import { isDenied } from '../lib/patterns.js';

const DEFAULT_DENY = ['/avatar', '/captcha', '/premium', 'highscore', '/temp/', '\.php'];

const $ = (id) => document.getElementById(id);

async function cachedUrls() {
  try {
    const res = await fetch(browser.runtime.getURL('rules/redirects.json'));
    const rules = await res.json();
    // urlFilter is stored as "|<url>" — strip the anchor to get the URL back.
    return new Set(rules.map((r) => (r.condition?.urlFilter || '').replace(/^\|/, '')));
  } catch {
    return new Set();
  }
}

function shorten(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch {
    return url;
  }
}

async function render() {
  const [stats, status, cached] = await Promise.all([
    browser.runtime.sendMessage({ type: MSG.GET_STATS }),
    browser.runtime.sendMessage({ type: MSG.GET_STATUS }),
    cachedUrls(),
  ]);

  const rows = Object.entries(stats || {})
    .map(([url, s]) => ({ url, ...s, cached: cached.has(url) }))
    .sort((a, b) => b.count - a.count);

  $('status').textContent = status.rulesetEnabled
    ? `${status.ruleCount} images bundled and served locally`
    : 'Local image serving is OFF';
  $('status').classList.toggle('on', status.rulesetEnabled && status.ruleCount > 0);

  $('uniqueCount').textContent = rows.length;
  $('loadCount').textContent = rows.reduce((n, r) => n + r.count, 0);
  $('cachedCount').textContent = rows.filter((r) => r.cached).length;

  const body = document.querySelector('#table tbody');
  body.replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = shorten(r.url);
      name.title = r.url;
      const count = document.createElement('td');
      count.className = 'num';
      count.textContent = r.count;
      const hit = document.createElement('td');
      hit.className = 'num';
      hit.textContent = r.cached ? 'yes' : '—';
      tr.append(name, count, hit);
      return tr;
    })
  );

  $('table').hidden = rows.length === 0;
  $('empty').hidden = rows.length > 0;
  return rows;
}

$('download').addEventListener('click', async () => {
  const stats = await browser.runtime.sendMessage({ type: MSG.GET_STATS });
  const urls = Object.keys(stats || {})
    .filter((u) => !isDenied(u, DEFAULT_DENY))
    .sort();

  const payload = {
    $comment: 'Drop this in the repo root as safelist.json, then run: npm run scrape && npm run build',
    urls,
    denyPatterns: DEFAULT_DENY,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'safelist.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('clear').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: MSG.CLEAR_STATS });
  render();
});

$('options').addEventListener('click', () => browser.runtime.openOptionsPage());

render();
