// Extracts every image URL referenced by Ikariam's compiled skin stylesheets and
// writes them to safelist.json.
//
//   npm run discover
//   npm run discover -- --server=https://s12-de.ikariam.gameforge.com --lang=de

import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { DEFAULT_DENY, isDenied, looksLikeImage, normalizeUrl } from "../src/lib/patterns.js";
import { die, guard, requireNode, fetchRetry } from "./lib.mjs";

requireNode();
guard("discover");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const flags = Object.fromEntries(
    process.argv
        .slice(2)
        .filter((a) => a.startsWith("--"))
        .map((a) =>
        {
            const [k, ...rest] = a.slice(2).split("=");
            return [k, rest.join("=")];
        }),
);

const sourcesPath = join(root, "sources.json");
if (!existsSync(sourcesPath))
{
    die("sources.json is missing.", "It should sit next to package.json. Restore it from git.");
}

let cfg;
try
{
    cfg = { ...JSON.parse(await readFile(sourcesPath, "utf8")), ...flags };
}
catch (err)
{
    die(`sources.json is not valid JSON (${err.message}).`);
}

if (!cfg.server || !Array.isArray(cfg.css) || cfg.css.length === 0)
{
    die('sources.json needs a "server" and a non-empty "css" list.');
}

// safelist.json is optional on a first run.
const safelistPath = join(root, "safelist.json");
let existing = { denyPatterns: [], urls: [] };
if (existsSync(safelistPath))
{
    try
    {
        existing = JSON.parse(await readFile(safelistPath, "utf8"));
    }
    catch
    {
        console.log("  safelist.json was unreadable — starting a fresh one.");
    }
}
const deny = existing.denyPatterns || [];

const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

console.log(`\n  Reading stylesheets from ${cfg.server}\n`);

const found = new Set();
let reachable = 0;

for (const template of cfg.css)
{
    const cssUrl = new URL(
        template.replace("{dir}", cfg.dir || "ltr").replace("{lang}", cfg.lang || "en"),
        cfg.server,
    ).toString();
    const name = cssUrl.split("/").pop();

    let css;
    try
    {
        css = await (await fetchRetry(cssUrl)).text();
        reachable++;
    }
    catch (err)
    {
        console.log(`  skip  ${name} — ${err.message}`);
        continue;
    }

    let hits = 0;
    for (const [, , ref] of css.matchAll(URL_RE))
    {
        if (ref.startsWith("data:"))
        {
            continue;
        }
        // Relative refs resolve against the stylesheet, root-relative against the host.
        let abs;
        try
        {
            abs = normalizeUrl(new URL(ref, cssUrl).toString());
        }
        catch
        {
            continue;
        }
        if (!looksLikeImage(abs))
        {
            continue;
        }
        if (isDenied(abs, deny))
        {
            continue;
        }
        found.add(abs);
        hits++;
    }
    console.log(`  ok    ${name} — ${hits} images`);
}

if (reachable === 0)
{
    die(
        `Could not reach any stylesheet on ${cfg.server}.`,
        "Check your internet connection, or point at a server you can reach:\n" +
      "  npm run discover -- --server=https://s74-en.ikariam.gameforge.com --lang=en",
    );
}

// Keep anything the in-game observer picked up that the stylesheets do not list.
const merged = [...new Set([...(existing.urls || []), ...found])].sort();
const added = merged.length - (existing.urls || []).length;

await writeFile(
    safelistPath,
    JSON.stringify(
        {
            $comment: "Image URLs to bundle into the extension. Regenerate with: npm run discover",
            denyPatterns: deny.length > 0 ? deny : DEFAULT_DENY,
            urls: merged,
        },
        null,
        2,
    ) + "\n",
);

console.log(`\n  ${found.size} images found, ${added} new, ${merged.length} in safelist.json`);
console.log("\n  Next:  npm run scrape\n");
