import browser from "../lib/browser.js";
import { MSG } from "../lib/messages.js";
import * as stats from "./stats.js";

const RULESET_ID = "cached-images";

browser.runtime.onMessage.addListener(handleMessage);

async function handleMessage(msg)
{
    switch (msg?.type)
    {
        case MSG.REPORT:
            await stats.merge(msg.batch);
            return { ok: true };

        case MSG.GET_STATS:
            return await stats.all();

        case MSG.CLEAR_STATS:
            await stats.clear();
            return { ok: true };

        case MSG.GET_STATUS:
            return await status();

        case MSG.SET_RULESET:
            await setRuleset(msg.enabled);
            return await status();

        default:
            return undefined;
    }
}

async function status()
{
    const enabled = await browser.declarativeNetRequest.getEnabledRulesets();
    let ruleCount = 0;
    try
    {
        const res = await fetch(browser.runtime.getURL("rules/redirects.json"));
        ruleCount = (await res.json()).length;
    }
    catch
    {
    // Ruleset file missing or malformed — report zero rather than failing.
    }
    return { rulesetEnabled: enabled.includes(RULESET_ID), ruleCount };
}

async function setRuleset(enabled)
{
    await browser.declarativeNetRequest.updateEnabledRulesets(
        enabled ? { enableRulesetIds: [RULESET_ID] } : { disableRulesetIds: [RULESET_ID] },
    );
}
