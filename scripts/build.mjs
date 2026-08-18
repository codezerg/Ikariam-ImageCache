// Builds the extension for both browsers:  dist/chrome  and  dist/firefox
//
//   npm run build
//   npm run zip     # same, plus a .zip per target for store upload

import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { die, guard, requireNode } from "./lib.mjs";

requireNode();
guard("build");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const dist = join(root, "dist");
const common = join(dist, "common");

const TARGETS = ["chrome", "firefox"];

let build;
try
{
    ({ build } = await import("vite"));
}
catch
{
    die("Dependencies are not installed.", "Run:  npm install");
}

/** Per-browser manifest differences, applied on top of manifest.base.json. */
function manifestFor(target, base)
{
    const m = structuredClone(base);
    if (target === "chrome")
    {
        m.background = { service_worker: "background.js" };
    }
    else
    {
    // Firefox MV3 uses a non-persistent event page, not a service worker.
        m.background = { scripts: ["background.js"] };
        m.browser_specific_settings = {
            gecko: {
                id: "ikariam-image-cache@codezerg.github.io",
                strict_min_version: "128.0",
            },
        };
    }
    return m;
}

async function bundle()
{
    await rm(dist, { recursive: true, force: true });

    // Pass 1 — extension pages. Vite's own output goes in bundle/ so it never
    // collides with the game images we ship in assets/.
    await build({
        root: src,
        logLevel: "warn",
        build: {
            outDir: common,
            emptyOutDir: true,
            assetsDir: "bundle",
            sourcemap: true,
            rollupOptions: {
                input: {
                    popup: join(src, "popup/index.html"),
                    options: join(src, "options/index.html"),
                },
            },
        },
    });

    // Pass 2 — background and content script, as IIFEs so neither browser needs
    // module support in the background context.
    for (const [entry, file, name] of [
        ["background/index.js", "background.js", "IkariamBackground"],
        ["content/index.js", "content.js", "IkariamContent"],
    ])
    {
        await build({
            root: src,
            logLevel: "warn",
            build: {
                outDir: common,
                emptyOutDir: false,
                sourcemap: true,
                lib: { entry: join(src, entry), formats: ["iife"], name, fileName: () => file },
            },
        });
    }

    // A fresh clone has neither downloaded assets nor a generated ruleset. Ship an
    // empty ruleset so the extension still loads cleanly, rather than redirecting
    // images at files that were never downloaded.
    const rulesFile = join(src, "rules/redirects.json");
    if (!existsSync(rulesFile))
    {
        await mkdir(dirname(rulesFile), { recursive: true });
        await writeFile(rulesFile, "[]\n");
    }

    if (!existsSync(join(src, "icons/icon-128.png")))
    {
        await mkdir(join(src, "icons"), { recursive: true });
        execFileSync(process.execPath, [join(root, "scripts/gen-icons.mjs")], { stdio: "ignore" });
    }

    for (const dir of ["rules", "assets", "icons"])
    {
        if (existsSync(join(src, dir)))
        {
            await cp(join(src, dir), join(common, dir), { recursive: true });
        }
    }
}

/** Every redirect must point at a file that actually shipped. */
async function validate()
{
    const rules = JSON.parse(await readFile(join(common, "rules/redirects.json"), "utf8"));
    const missing = rules.filter((r) => !existsSync(join(common, r.action.redirect.extensionPath.slice(1))));

    if (missing.length > 0)
    {
        die(
            `${missing.length} of ${rules.length} redirect rules point at images that were not downloaded.`,
            "The extension would show broken graphics. Fix it with:\n  npm run scrape",
        );
    }
    return rules.length;
}

async function emitTargets()
{
    const base = JSON.parse(await readFile(join(root, "manifest.base.json"), "utf8"));
    for (const target of TARGETS)
    {
        const out = join(dist, target);
        await cp(common, out, { recursive: true });
        await writeFile(join(out, "manifest.json"), JSON.stringify(manifestFor(target, base), null, 2));
    }
    await rm(common, { recursive: true, force: true });
}

function zip()
{
    for (const target of TARGETS)
    {
        const out = join(dist, `${target}.zip`);
        try
        {
            if (process.platform === "win32")
            {
                execFileSync("powershell", [
                    "-NoProfile", "-Command",
                    `Compress-Archive -Path '${join(dist, target)}/*' -DestinationPath '${out}' -Force`,
                ]);
            }
            else
            {
                execFileSync("zip", ["-qr", out, "."], { cwd: join(dist, target) });
            }
            console.log(`  dist/${target}.zip`);
        }
        catch
        {
            console.log(`  could not create dist/${target}.zip (the unpacked folder still works)`);
        }
    }
}

await mkdir(dist, { recursive: true });
await bundle();
const ruleCount = await validate();
await emitTargets();

console.log(`\n  Built dist/chrome and dist/firefox — ${ruleCount} images served locally.`);

if (ruleCount === 0)
{
    console.log("\n  No images are bundled yet. To add them:");
    console.log("    npm run discover");
    console.log("    npm run scrape");
    console.log("    npm run build");
}

if (process.argv.includes("--zip"))
{
    zip();
}

console.log(`
  Load it:
    Chrome   chrome://extensions -> Developer mode -> Load unpacked -> dist/chrome
    Firefox  about:debugging#/runtime/this-firefox -> Load Temporary Add-on -> dist/firefox/manifest.json

  Firefox also needs permission granted: about:addons -> this extension -> Permissions
  -> allow ikariam.gameforge.com, or the redirects will not fire.
`);
