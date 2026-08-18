import browser from "../lib/browser.js";
import { MSG } from "../lib/messages.js";
import { DEFAULT_DENY, isDenied, requestDomainFor } from "../lib/patterns.js";

function byId(id)
{
    return document.getElementById(id);
}

/**
 * A rule matches on domain plus path, so that pair is what decides whether an
 * observed image is one we ship. Keying on the whole URL would never match — a
 * rule stores no host — and keying on the path alone would let one domain claim
 * another's image.
 */
function keyForRule(rule)
{
    const condition = rule.condition;
    if (condition === undefined)
    {
        return null;
    }
    return `${condition.requestDomains[0]}|${condition.urlFilter}`;
}

/** The same key for an observed URL, or null when the URL will not parse. */
function keyForUrl(url)
{
    try
    {
        return `${requestDomainFor(url)}|${new URL(url).pathname}`;
    }
    catch
    {
        return null;
    }
}

async function cachedKeys()
{
    const keys = new Set();
    try
    {
        const res = await fetch(browser.runtime.getURL("rules/redirects.json"));
        const rules = await res.json();
        for (const rule of rules)
        {
            const key = keyForRule(rule);
            if (key !== null)
            {
                keys.add(key);
            }
        }
    }
    catch
    {
        // No ruleset shipped, or it is malformed — report nothing as cached.
    }
    return keys;
}

function toRow(url, entry, cached)
{
    const key = keyForUrl(url);
    return { url, ...entry, cached: key !== null && cached.has(key) };
}

function shorten(url)
{
    try
    {
        const u = new URL(url);
        return u.hostname + u.pathname;
    }
    catch
    {
        return url;
    }
}

async function render()
{
    const [stats, status, cached] = await Promise.all([
        browser.runtime.sendMessage({ type: MSG.GET_STATS }),
        browser.runtime.sendMessage({ type: MSG.GET_STATUS }),
        cachedKeys(),
    ]);

    const rows = Object.entries(stats || {})
        .map(([url, entry]) => toRow(url, entry, cached))
        .sort((a, b) => b.count - a.count);

    byId("status").textContent = status.rulesetEnabled
        ? `${status.ruleCount} images bundled and served locally`
        : "Local image serving is OFF";
    byId("status").classList.toggle("on", status.rulesetEnabled && status.ruleCount > 0);

    let totalLoads = 0;
    for (const row of rows)
    {
        totalLoads += row.count;
    }

    byId("uniqueCount").textContent = rows.length;
    byId("loadCount").textContent = totalLoads;
    byId("cachedCount").textContent = rows.filter((r) => r.cached).length;

    const body = document.querySelector("#table tbody");
    body.replaceChildren(
        ...rows.map((r) =>
        {
            const tr = document.createElement("tr");
            const name = document.createElement("td");
            name.textContent = shorten(r.url);
            name.title = r.url;
            const count = document.createElement("td");
            count.className = "num";
            count.textContent = r.count;
            const hit = document.createElement("td");
            hit.className = "num";
            hit.textContent = r.cached ? "yes" : "—";
            tr.append(name, count, hit);
            return tr;
        }),
    );

    byId("table").hidden = rows.length === 0;
    byId("empty").hidden = rows.length > 0;
    return rows;
}

byId("download").addEventListener("click", async () =>
{
    const stats = await browser.runtime.sendMessage({ type: MSG.GET_STATS });
    const urls = Object.keys(stats || {})
        .filter((u) => !isDenied(u, DEFAULT_DENY))
        .sort();

    const payload = {
        $comment: "Drop this in the repo root as safelist.json, then run: npm run scrape && npm run build",
        urls,
        denyPatterns: DEFAULT_DENY,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "safelist.json";
    a.click();
    URL.revokeObjectURL(a.href);
});

byId("clear").addEventListener("click", async () =>
{
    await browser.runtime.sendMessage({ type: MSG.CLEAR_STATS });
    render();
});

byId("options").addEventListener("click", () => browser.runtime.openOptionsPage());

render();
