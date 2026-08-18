// Pure helpers shared by the extension and the Node build scripts.
// Keep this file free of browser/Node APIs so both can import it.

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|avif)$/i;

/**
 * Never bundle these: they are per-player or per-session, so a cached copy would
 * be wrong rather than merely stale. Single source of truth for both the build
 * scripts and the popup's export.
 */
export const DEFAULT_DENY = ["/avatar", "/captcha", "/temp/", "[.]php$"];

/** Strip query string and hash — Ikariam appends cache-busting params we want to ignore. */
export function normalizeUrl(url)
{
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString();
}

export function looksLikeImage(url, initiatorType)
{
    if (initiatorType === "img" || initiatorType === "image")
    {
        return true;
    }
    try
    {
        return IMAGE_EXT.test(new URL(url).pathname);
    }
    catch
    {
        return false;
    }
}

/** True if the URL matches any deny pattern (treated as a case-insensitive regex). */
export function isDenied(url, denyPatterns = [])
{
    return denyPatterns.some((p) =>
    {
        try
        {
            return new RegExp(p, "i").test(url);
        }
        catch
        {
            return url.toLowerCase().includes(p.toLowerCase());
        }
    });
}

/**
 * Where an asset lives inside the extension package.
 *
 * Keyed on the path only, not the host: every Ikariam server serves the same
 * /cdn/... tree, so one bundled copy covers s74-en, s12-de and the rest.
 */
export function localPathFor(url)
{
    const path = new URL(url).pathname.replace(/^\/+/, "").replace(/[^a-zA-Z0-9._/-]/g, "_");
    return `assets/${path}`;
}

/**
 * urlFilter for a DNR rule — a plain substring match on the path, paired with a
 * requestDomains condition. Deliberately not anchored at the end so `foo.png`
 * also matches `foo.png?rev=67450`.
 */
export function urlFilterFor(url)
{
    return new URL(url).pathname;
}
