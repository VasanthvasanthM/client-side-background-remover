/**
 * Removes generated output, leaving only sources.
 *
 * Useful when a locale or a landing slug is renamed: the old folders are no
 * longer written by the build but would otherwise linger in the deploy and,
 * worse, be picked up by the sitemap walker as real pages.
 *
 *   npm run clean
 */

import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { ROOT } from './render-utils.js';

const KEEP_DIRS = new Set(['node_modules', 'src', 'scripts', 'docs', 'marketing', 'assets', '.git', '.wrangler']);
const GENERATED_FILES = ['index.html', 'sitemap.xml', 'robots.txt', '_headers', '_redirects'];

async function isGeneratedPageDir(dir) {
  // A generated page directory is exactly one that holds an index.html this
  // build produced. Testing for the file rather than trusting the name means a
  // directory someone added by hand is never deleted.
  try {
    await stat(path.join(dir, 'index.html'));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  const removed = [];
  const kept = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (KEEP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const dir = path.join(ROOT, entry.name);
      if (await isGeneratedPageDir(dir)) {
        await rm(dir, { recursive: true, force: true });
        removed.push(entry.name);
      } else {
        kept.push(entry.name);
      }
      continue;
    }
    if (GENERATED_FILES.includes(entry.name)) {
      await rm(path.join(ROOT, entry.name), { force: true });
      removed.push(entry.name);
    }
  }

  // Built CSS is generated too, but lives under assets/ which is kept wholesale.
  await rm(path.join(ROOT, 'assets', 'css', 'app.css'), { force: true });

  console.log(`clean — removed ${removed.length} generated paths`);
  if (kept.length) console.log(`  left alone (no index.html): ${kept.join(', ')}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
