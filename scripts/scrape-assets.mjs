// Downloads every URL in safelist.json into src/assets/, then regenerates the
// declarativeNetRequest ruleset that points the game at those local copies.
//
//   npm run scrape            # skip files already downloaded (safe to re-run)
//   npm run scrape -- --force # re-download everything

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { isDenied, localPathFor, normalizeUrl, urlFilterFor } from "../src/lib/patterns.js";
import { die, guard, requireNode, fetchRetry, mb, progress } from "./lib.mjs";

requireNode();
guard("scrape");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const CONCURRENCY = 8;

const safelistPath = join(root, "safelist.json");
if (!existsSync(safelistPath))
{
    die("safelist.json is missing.", "Run:  npm run discover");
}

let safelist;
try
{
    safelist = JSON.parse(await readFile(safelistPath, "utf8"));
}
catch (err)
{
    die(`safelist.json is not valid JSON (${err.message}).`, "Regenerate it with:  npm run discover");
}

const deny = safelist.denyPatterns || [];

// Dedupe by local path: every Ikariam server serves the same /cdn/ tree, so two
// URLs differing only by host are the same asset.
const byPath = new Map();
for (const raw of safelist.urls || [])
{
    let url;
    try
    {
        url = normalizeUrl(raw);
    }
    catch
    {
        continue; // Not a usable URL — skip rather than abort the whole run.
    }
    if (isDenied(url, deny))
    {
        continue;
    }
    const path = localPathFor(url);
    if (!byPath.has(path))
    {
        byPath.set(path, url);
    }
}

const jobs = [...byPath]
    .map(([path, url]) => ({ path, url }))
    .sort((a, b) => a.path.localeCompare(b.path));

if (jobs.length === 0)
{
    die("safelist.json contains no image URLs.", "Run:  npm run discover");
}

console.log(`\n  ${jobs.length} images in the safe list. This takes a few minutes the first time.`);
console.log("  Interrupting is fine — re-running resumes where it stopped.\n");

let downloaded = 0;
let skipped = 0;
let bytes = 0;
const failed = [];
const bar = progress("downloading", jobs.length);

async function run({ path, url })
{
    const file = join(root, "src", path);

    // A zero-byte file means an interrupted earlier run — re-fetch it.
    if (existsSync(file) && statSync(file).size > 0 && !force)
    {
        skipped++;
        bytes += statSync(file).size;
        bar.tick();
        return true;
    }

    try
    {
        const res = await fetchRetry(url);
        const body = Buffer.from(await res.arrayBuffer());
        if (body.length === 0)
        {
            throw new Error("empty response");
        }
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, body);
        downloaded++;
        bytes += body.length;
        bar.tick();
        return true;
    }
    catch (err)
    {
        failed.push({ url, reason: err.message });
        bar.tick();
        return false;
    }
}

// Fixed-size worker pool so we do not open 1200 sockets at once.
const queue = [...jobs];
const ok = new Set();
await Promise.all(
    Array.from({ length: CONCURRENCY }, async () =>
    {
        for (let job = queue.shift(); job; job = queue.shift())
        {
            if (await run(job))
            {
                ok.add(job.path);
            }
        }
    }),
);
bar.end();

if (ok.size === 0)
{
    die(
        "Every download failed — nothing was saved.",
        "Check your internet connection, then re-run:  npm run scrape",
    );
}

const rules = jobs
    .filter((j) => ok.has(j.path))
    .map((j, i) => ({
        id: i + 1,
        priority: 1,
        action: { type: "redirect", redirect: { extensionPath: `/${j.path}` } },
        condition: {
            urlFilter: urlFilterFor(j.url),
            requestDomains: ["ikariam.gameforge.com"],
            resourceTypes: ["image", "other"],
        },
    }));

await mkdir(join(root, "src/rules"), { recursive: true });
await writeFile(join(root, "src/rules/redirects.json"), JSON.stringify(rules, null, 2) + "\n");

console.log(`\n  downloaded ${downloaded}, already had ${skipped}, ${mb(bytes)} total`);
console.log(`  ${rules.length} redirect rules written\n`);

const dead = failed.filter((f) => f.reason === "HTTP 404");
const broke = failed.filter((f) => f.reason !== "HTTP 404");

if (dead.length > 0)
{
    console.log(`  ${dead.length} referenced by the game's CSS but missing on its server (normal, skipped):`);
    for (const f of dead.slice(0, 5))
    {
        console.log(`    ${f.url.split("/").pop()}`);
    }
    if (dead.length > 5)
    {
        console.log(`    ...and ${dead.length - 5} more`);
    }
    console.log("");
}

if (broke.length > 0)
{
    console.log(`  ${broke.length} failed to download — re-run "npm run scrape" to retry just these:`);
    for (const f of broke.slice(0, 10))
    {
        console.log(`    ${f.url} (${f.reason})`);
    }
    if (broke.length > 10)
    {
        console.log(`    ...and ${broke.length - 10} more`);
    }
    console.log("");
}

console.log("  Next:  npm run build\n");
