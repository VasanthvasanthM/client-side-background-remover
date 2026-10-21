/**
 * Landing-page runtime.
 *
 * Landing pages are static text — every number on them is computed at build
 * time — so all they need is the shared chrome: theme toggle, language picker,
 * storage notice and the copyright year.
 *
 * Deliberately tiny and deliberately separate from app.js. A landing page
 * never loads the editor, the worker or the engine, which is why these pages
 * are a few kilobytes of JavaScript rather than the whole tool.
 */

import { initChrome } from './chrome.js';

initChrome();
