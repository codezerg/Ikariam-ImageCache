// Shared helpers for the build scripts. Everything here exists to turn a crash
// into a sentence that tells you what to do next.

const MIN_NODE = 18;

/** Print a plain-English error and stop. No stack traces. */
export function die(message, hint) {
  console.error(`\n  ERROR  ${message}`);
  if (hint) console.error(`\n  ${hint}`);
  console.error('');
  process.exit(1);
}

/** Node 18+ is required for global fetch. */
export function requireNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE) {
    die(
      `Node ${MIN_NODE} or newer is required. You are running Node ${process.versions.node}.`,
      'Install the current LTS from https://nodejs.org and try again.'
    );
  }
}

/** Turn any unexpected crash into a readable message instead of a stack dump. */
export function guard(name) {
  process.on('unhandledRejection', (err) => {
    die(`${name} failed: ${err?.message || err}`, 'Re-run the command; it picks up where it left off.');
  });
}

/**
 * fetch with retries. Ikariam's servers close every connection and occasionally
 * drop one, so a single failure means nothing.
 */
export async function fetchRetry(url, { attempts = 3, timeoutMs = 30000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      // 404s are permanent — the game's own CSS references a few dead files.
      if (res.status === 404) throw Object.assign(new Error('HTTP 404'), { permanent: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastError = err;
      if (err.permanent || attempt === attempts) break;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastError;
}

/** Human-readable byte count. */
export function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A single-line progress counter that does not spam CI logs. */
export function progress(label, total) {
  let done = 0;
  const tty = process.stdout.isTTY;
  return {
    tick(n = 1) {
      done += n;
      if (tty) {
        process.stdout.write(`\r  ${label}: ${done}/${total}   `);
      } else if (done % 200 === 0 || done === total) {
        console.log(`  ${label}: ${done}/${total}`);
      }
    },
    end() {
      if (tty) process.stdout.write(`\r  ${label}: ${done}/${total}   \n`);
    },
  };
}
