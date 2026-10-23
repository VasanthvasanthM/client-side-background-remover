/**
 * Minimal static server for local testing — mirrors how Cloudflare Pages serves
 * this directory (directory requests resolve to index.html). Dependency-free.
 *
 *   npm run serve        # http://localhost:4173
 *   PORT=5000 npm run serve   # an explicit port is honoured exactly
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/**
 * This project's own default port.
 *
 * Each site in this series gets a distinct one. Sharing a default is how
 * you end up with a port that answers, serves a *different* project, and
 * sends you debugging a change that was never deployed to the thing you
 * were looking at.
 */
const DEFAULT_PORT = 4178;
const PORT = Number(process.env.PORT) || DEFAULT_PORT;

/** How far to scan upward before giving up. */
const PORT_ATTEMPTS = 20;

/**
 * Parse Cloudflare's _headers format so local testing sees the same CSP and
 * caching rules as production — a CSP that blocks the app should fail here,
 * not after deploy.
 */
async function loadHeaderRules() {
  let text;
  try {
    text = await readFile(path.join(ROOT, '_headers'), 'utf8');
  } catch {
    return [];
  }

  const rules = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
      continue;
    }
    const index = line.indexOf(':');
    if (index > 0 && current) {
      current.headers.push([line.slice(0, index).trim(), line.slice(index + 1).trim()]);
    }
  }
  return rules;
}

/** Cloudflare matches a literal path or a single trailing/sandwiched splat. */
function matchesPattern(pattern, urlPath) {
  if (!pattern.includes('*')) return pattern === urlPath;
  const [head, tail = ''] = pattern.split('*');
  return urlPath.startsWith(head) && urlPath.endsWith(tail);
}

const headerRules = await loadHeaderRules();

function headersFor(urlPath) {
  const out = {};
  for (const rule of headerRules) {
    if (!matchesPattern(rule.pattern, urlPath)) continue;
    for (const [name, value] of rule.headers) out[name] = value;
  }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // A module served as anything but a JavaScript type is refused outright by
  // the browser, and .wasm must be application/wasm for streaming
  // instantiation. Cloudflare gets both right; this server has to as well, or
  // the AI mode appears broken only in local testing.
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.join(ROOT, decoded);

  // Never serve outside the project directory.
  if (!target.startsWith(ROOT)) return null;

  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      const index = path.join(target, 'index.html');
      await stat(index);
      return index;
    }
    return target;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = await resolveFile(req.url || '/');

  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    ...headersFor(urlPath),
  });
  createReadStream(file).pipe(res);
});

/**
 * Listen on the first free port at or above the requested one.
 *
 * Several of these sites get left running at once, so a hard failure on a
 * busy port is a daily annoyance. An explicit PORT is honoured exactly:
 * if you asked for a specific port, silently using a different one would
 * be worse than refusing.
 */
function listen(port, attemptsLeft) {
  server.once('error', (error) => {
    if (error.code !== 'EADDRINUSE') throw error;

    if (process.env.PORT || attemptsLeft <= 0) {
      console.error(`Port ${port} is already in use.`);
      process.exitCode = 1;
      return;
    }
    console.warn(`Port ${port} is busy, trying ${port + 1}…`);
    listen(port + 1, attemptsLeft - 1);
  });

  // No success callback here: server.listen(port, cb) registers cb as a
  // one-time 'listening' listener, and a listen that fails leaves it
  // attached — so after a retry the stale callbacks fire too and report
  // the ports that did not work. One handler reading the real address is
  // both simpler and always right.
  server.listen(port);
}

server.on('listening', () => {
  console.log(`Serving ${ROOT}\n  http://localhost:${server.address().port}`);
});

listen(PORT, PORT_ATTEMPTS);
