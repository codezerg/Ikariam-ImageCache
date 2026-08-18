import browser from '../lib/browser.js';
import { MSG } from '../lib/messages.js';

const toggle = document.getElementById('toggle');
const info = document.getElementById('ruleInfo');

function paint(status) {
  toggle.checked = status.rulesetEnabled;
  info.textContent = status.ruleCount
    ? `${status.ruleCount} images bundled in this build`
    : 'No images bundled yet — see below';
}

toggle.addEventListener('change', async () => {
  paint(await browser.runtime.sendMessage({ type: MSG.SET_RULESET, enabled: toggle.checked }));
});

browser.runtime.sendMessage({ type: MSG.GET_STATUS }).then(paint);
