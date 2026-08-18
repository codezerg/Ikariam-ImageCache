// Runs at document_start on Ikariam pages.
// Its only job is to observe which images the page loads, so we can build the
// safe list. It does not touch the DOM — the actual caching happens in the
// network layer via declarativeNetRequest redirects.

import browser from "../lib/browser.js";
import { looksLikeImage, normalizeUrl } from "../lib/patterns.js";
import { MSG } from "../lib/messages.js";

const pending = new Map();

function record(entry)
{
    if (!looksLikeImage(entry.name, entry.initiatorType))
    {
        return;
    }

    let url;
    try
    {
        url = normalizeUrl(entry.name);
    }
    catch
    {
        return;
    }
    // Already redirected to our own copy — nothing to learn from it.
    if (url.startsWith("chrome-extension://") || url.startsWith("moz-extension://"))
    {
        return;
    }

    const prev = pending.get(url) || { url, count: 0, totalMs: 0, bytes: 0 };
    prev.count += 1;
    prev.totalMs += entry.duration || 0;
    // Cross-origin responses without Timing-Allow-Origin report 0 here; that is
    // expected and simply means we cannot show a size for that asset.
    if (entry.encodedBodySize)
    {
        prev.bytes = entry.encodedBodySize;
    }
    pending.set(url, prev);
}

async function flush()
{
    if (pending.size === 0)
    {
        return;
    }
    const batch = [...pending.values()];
    pending.clear();
    try
    {
        await browser.runtime.sendMessage({ type: MSG.REPORT, batch });
    }
    catch
    {
    // Background asleep or extension reloading — the next flush will retry.
    }
}

try
{
    const observer = new PerformanceObserver((list) =>
    {
        for (const entry of list.getEntries())
        {
            record(entry);
        }
    });
    observer.observe({ type: "resource", buffered: true });
}
catch
{
    // PerformanceObserver with buffered entries is unavailable; fall back to a
    // one-shot read of whatever the timeline already holds.
    for (const entry of performance.getEntriesByType("resource"))
    {
        record(entry);
    }
}

setInterval(flush, 3000);
addEventListener("pagehide", flush);
