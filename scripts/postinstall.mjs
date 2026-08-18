// Printed after `npm install` so the next step is never a guess.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ready = existsSync(join(root, "src/rules/redirects.json"));

console.log("");
if (ready)
{
    console.log("  Installed. Rebuild with:  npm run build");
}
else
{
    console.log("  Installed. Now run:  npm run setup");
    console.log("");
    console.log("  That downloads ~1200 game images (a few minutes) and builds");
    console.log("  dist/chrome and dist/firefox. Safe to interrupt and re-run.");
}
console.log("");
