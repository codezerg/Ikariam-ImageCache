import browser from '../lib/browser.js';
import { MSG } from '../lib/messages.js';
import * as stats from './stats.js';

const RULESET_ID = 'cached-images';

browser.runtime.onMessage.addListener((msg) => {
  switch (msg?.type) {
    case MSG.REPORT:
      return stats.merge(msg.batch).then(() => ({ ok: true }));

    case MSG.GET_STATS:
      return stats.all();

    case MSG.CLEAR_STATS:
      return stats.clear().then(() => ({ ok: true }));

    case MSG.GET_STATUS:
      return status();

    case MSG.SET_RULESET:
      return setRuleset(msg.enabled).then(status);

    default:
      return undefined;
  }
});

async function status() {
  const enabled = await browser.declarativeNetRequest.getEnabledRulesets();
  let ruleCount = 0;
  try {
    const res = await fetch(browser.runtime.getURL('rules/redirects.json'));
    ruleCount = (await res.json()).length;
  } catch {
    // Ruleset file missing or malformed — report zero rather than failing.
  }
  return { rulesetEnabled: enabled.includes(RULESET_ID), ruleCount };
}

async function setRuleset(enabled) {
  await browser.declarativeNetRequest.updateEnabledRulesets(
    enabled ? { enableRulesetIds: [RULESET_ID] } : { disableRulesetIds: [RULESET_ID] }
  );
}
