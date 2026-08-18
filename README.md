# Ikariam Image Cache

Makes Ikariam load faster by keeping its graphics on your computer.

Ikariam has about 1200 small images — buttons, backgrounds, icons, the city
view. Its server hands them over slowly, and makes your browser fetch them all
over again roughly once a day. That is the flicker, and the waiting.

This extension keeps its own copy of those images and gives them to the game
instantly, straight from your disk. Nothing is downloaded while you play.

One codebase, two builds: **Chrome** (and Edge) and **Firefox**.

> No game artwork is stored in this repository. `npm run scrape` downloads the
> images from your own game server at build time, into a gitignored directory.

## Why it is slow in the first place

Two separate problems, and they compound.

**Every image costs a new connection.** Normally a browser opens one connection
and reuses it for many images. Ikariam's server refuses that, so each image pays
the full setup cost — about 0.79 seconds — and the browser can only do six at a
time. For 1200 images that is roughly **160 seconds** of waiting on connections
alone.

**The images expire every day.** Once a day the browser throws them all away and
starts over, which triggers the whole 160 seconds again.

The extension sidesteps both: the images never expire and never travel over the
network, because they are already on your disk.

<details>
<summary>The measurements behind that</summary>

Measured against `s74-en.ikariam.gameforge.com`:

```
s74-en.ikariam.gameforge.com   ALPN -> http/1.1   (h2 offered, refused)
lobby.ikariam.gameforge.com    ALPN -> h2
```

Every response carries `Connection: close`, so nothing is reused — back-to-back
requests each open a fresh connection. Per image:

| | |
|---|---|
| TCP connect | 0.26s |
| TLS handshake | 0.53s |
| **total** | **~0.79s** |

HTTP/1.1 limits browsers to roughly 6 parallel connections per host, and each
one pays that handshake again:

```
1219 images / 6 parallel * 0.79s  ~=  160 seconds of pure handshake overhead
```

**A 24-hour cache lifetime** on top of that:

```
Cache-Control: max-age=86400, public, max-age=86400
```

Once a day, every image expires at once. Those revalidations are *not* cheap
304s — a 304 saves the bytes but still pays the full handshake, because the
connection closed. So each expiry detonates into another few minutes of
connection churn, as does any cache eviction.

</details>

## How it works

The images are stored inside the extension. Whenever the game asks for one, the
extension quietly hands over its own copy instead of letting the request reach
the internet.

Because the request never leaves your computer, there is nothing to expire and
nothing to wait for.

<details>
<summary>The technical version</summary>

A `declarativeNetRequest` ruleset redirects each game image request to the
packaged copy:

```
https://s74-en.ikariam.gameforge.com/cdn/all/both/layout/bg_contentBox01.png
  -> /assets/cdn/all/both/layout/bg_contentBox01.png   (inside the extension)
```

The redirect happens in the network layer, before any request leaves the
browser. It does not depend on the HTTP cache, so nothing expires and no
handshake happens.

Rules match on path plus `requestDomains: ikariam.gameforge.com`, so one build
works on every server and language — s74-en, s12-de, and the rest.

### Why not just rewrite the cache headers?

That was the first thing tried. It does not work reliably: DNR rules
[do not apply to requests already served from the HTTP cache][dnr-cache], and a
rewritten `Cache-Control` is not guaranteed to change what Chromium *stores*.
Redirecting to a packaged file sidesteps the cache entirely.

[dnr-cache]: https://github.com/GoogleChrome/developer.chrome.com/issues/3748

</details>

## Build

You need [Node.js](https://nodejs.org) 18 or newer. Nothing else.

```bash
npm install
npm run setup
```

That is the whole thing. `setup` reads the game's stylesheets, downloads ~1200
images (a few minutes), and writes `dist/chrome` and `dist/firefox`. It prints
what to do next at every step.

**It is safe to interrupt.** Re-running `npm run setup` picks up where it
stopped — already-downloaded images are skipped.

### Individual steps

`setup` just runs these in order; use them directly if you need to.

```bash
npm run discover   # read the game's compiled CSS -> safelist.json
npm run scrape     # download images -> src/assets/ + generate DNR rules
npm run build      # -> dist/chrome and dist/firefox
npm run zip        # same as build, plus a .zip per target for store upload
npm run icons      # regenerate placeholder icons
```

`safelist.json` is committed, so `discover` is optional — `scrape` alone is
enough for a first build. Re-run both when Gameforge updates the skin.

Point discovery at a different server or language:

```bash
npm run discover -- --server=https://s12-de.ikariam.gameforge.com --lang=de
```

### What cannot go wrong

- **Build before downloading anything** — produces a working extension with an
  empty ruleset, not one that redirects at files that do not exist.
- **A half-finished download** — `build` refuses to produce a broken extension
  and tells you to run `scrape`. Zero-byte files from an interrupted run are
  detected and re-fetched.
- **A flaky connection** — every download retries three times with backoff.
  Whatever still fails is listed by name at the end, and re-running retries only
  those.
- **Dead images** — the game's own CSS references three files that 404 on its
  server. They are reported as normal and skipped, not treated as errors.
- **Missing icons** — generated automatically during `build` if absent.

## Install

- **Chrome** — `chrome://extensions`, enable Developer mode, *Load unpacked*, pick `dist/chrome`.
- **Firefox** — `about:debugging#/runtime/this-firefox`, *Load Temporary Add-on*, pick `dist/firefox/manifest.json`.

> **Firefox only:** MV3 host permissions are opt-in. After installing, open the
> extension in `about:addons` -> Permissions and allow access to
> `ikariam.gameforge.com`, or the redirect rules will not fire. Chrome grants
> host permissions at install.

### Verifying it works

Right-click any game graphic -> *Open image in new tab*. A `chrome-extension://`
or `moz-extension://` URL means the redirect is live. In DevTools, filter the
Network tab to **Img** and hard-reload: redirected images show near-zero time.

The toolbar popup reports how many images are bundled, and lists any image the
game loaded that is *not* covered — those still pay the ~0.79s.

### If images still load from the network

In order of likelihood:

1. **Firefox: permission not granted.** See the note above. This is the single
   most common cause on Firefox.
2. **The browser is serving its own cached copies**, which masks the redirect.
   Hard-reload with Ctrl+Shift+R, or tick *Disable cache* in DevTools' Network
   tab while it is open.
3. **The ruleset was rejected.** Chrome discards the *entire* static ruleset if
   any single rule is malformed — it is all-or-nothing. Check
   `chrome://extensions` for a red **Errors** button, and the *Service worker*
   link for console output.
4. **The image is not in the safe list.** Some graphics are injected by the
   game's JavaScript and never appear in its stylesheets. The popup lists every
   image it saw; anything without `yes` in the Cached column is uncovered. Click
   **Download safe list**, save it over `safelist.json`, and re-run
   `npm run scrape && npm run build`.

## How images are discovered

Ikariam declares its whole skin in four compiled stylesheets:

| stylesheet | `url()` refs |
|---|---|
| `/skin/compiled-ltr-common_0.css` | 907 |
| `/skin/compiled-ltr-common_1.css` | 261 |
| `/skin/compiled-en-city.css` | 318 |
| `/skin/compiled-en-island.css` | 223 |

`npm run discover` fetches them, extracts every `url(...)`, resolves it, and
writes the deduped list to `safelist.json` — 1222 unique images, of which 3 are
404 on Gameforge's side and get dropped during scrape. The `?rev=` parameter is
not required to fetch the stylesheets, and the image URLs themselves carry no
version parameter, so they are stable.

The extension also carries a content script that records every image the game
loads at runtime, catching assets the stylesheets never declare (JS-injected
ones). The popup lists them and exports an updated `safelist.json` via
**Download safe list**; drop it in the repo root and re-run `scrape` + `build`.

## Replacing images

Because the game loads these files from the extension package, editing anything
under `src/assets/` changes what the game renders. Keep the pixel dimensions
identical — Ikariam positions most of these as CSS sprites, so a resized file
will shift the sprite window.

## Layout

```
manifest.base.json     shared manifest; build.mjs applies per-browser diffs
sources.json           which server and stylesheets discovery reads
safelist.json          the image list (committed)
src/
  background/          message router + recorded-image stats
  content/             PerformanceObserver, records image loads
  popup/  options/     UI
  lib/                 helpers shared with the Node scripts
  rules/redirects.json DNR ruleset (generated, gitignored)
  assets/              bundled images (downloaded, gitignored)
scripts/
  discover.mjs         CSS -> safelist.json
  scrape-assets.mjs    safelist.json -> assets + rules
  build.mjs            vite build -> dist/chrome, dist/firefox
  gen-icons.mjs        placeholder PNG icons
```

## Cross-browser differences

All handled by `scripts/build.mjs`; the source is identical for both targets.

| | Chrome | Firefox |
|---|---|---|
| Background | `service_worker` | `scripts` (event page) |
| Manifest extras | — | `browser_specific_settings.gecko.id` |
| Host permissions | granted at install | user must opt in |

API calls go through `webextension-polyfill`, so the source uses promise-based
`browser.*` on both.

## License

Source code is MIT — see [LICENSE](LICENSE).

**This license covers this repository's code only.** It grants no rights to any
Ikariam game asset. No game artwork is distributed here; `npm run scrape`
downloads images from your own game server at build time, into a gitignored
directory, for your own use.

Not affiliated with, endorsed by, or sponsored by Gameforge. "Ikariam" is a
trademark of Gameforge AG.

Modifying the game client may conflict with Ikariam's Terms of Service. Use at
your own risk.
