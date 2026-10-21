/**
 * Minimal static server for local testing — mirrors how Cloudflare Pages serves
 * this directory (directory requests resolve to index.html). Dependency-free.
 *
 *   npm run serve        # http://localhost:4173
 *   PORT=5000 npm run serve
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4173;

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

server.listen(PORT, () => {
  console.log(`Serving ${ROOT}\n  http://localhost:${PORT}`);
});
