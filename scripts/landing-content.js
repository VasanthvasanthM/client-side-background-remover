/**
 * Content for the generated landing pages.
 *
 * The rule every page here follows: it must say something the other 391
 * cannot. A colour page carries that colour's real Lab coordinates and the
 * tolerance those coordinates imply; a format page carries whether that
 * format can store an alpha channel at all; a use-case page carries the
 * settings that subject actually needs. All of it is computed from the same
 * modules the running tool uses, so the advice cannot drift from the
 * behaviour.
 *
 * Returns escaped HTML fragments plus the plain strings the <head> needs.
 */

import { escapeHtml, fill, fillPlain } from './render-utils.js';
import { TOOL_MODE } from './landing-pages.js';
import { rgbToLab, parseHex, luminance, toleranceToDistance } from '../assets/js/color.js';

/** Section heading plus body, the shape every family renders into. */
function section(heading, body) {
  return [
    `        <h2 class="mt-10 text-xl font-bold">${escapeHtml(heading)}</h2>`,
    body,
  ].join('\n');
}

function paragraph(text) {
  return `        <p class="mt-3 text-pretty leading-relaxed text-ink-700 dark:text-ink-300">${escapeHtml(text)}</p>`;
}

function bullets(items) {
  return [
    '        <ul class="mt-3 space-y-2" role="list">',
    ...items.map(
      (item) =>
        `          <li class="flex gap-2.5 text-ink-700 dark:text-ink-300"><span aria-hidden="true" class="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-cut-500"></span><span>${escapeHtml(item)}</span></li>`,
    ),
    '        </ul>',
  ].join('\n');
}

/** A two-column facts table. Rows are [label, value] pairs. */
function factTable(caption, rows) {
  return [
    '        <div class="mt-4 overflow-x-auto">',
    '          <table class="w-full text-start text-sm">',
    `            <caption class="sr-only">${escapeHtml(caption)}</caption>`,
    '            <tbody>',
    ...rows.map(
      ([label, value]) =>
        '              <tr class="border-b border-ink-200 last:border-0 dark:border-ink-800">' +
        `<th scope="row" class="py-2 pe-4 text-start font-medium text-ink-600 dark:text-ink-300">${escapeHtml(label)}</th>` +
        `<td class="py-2 font-mono tabular-nums text-ink-900 dark:text-ink-100">${escapeHtml(value)}</td></tr>`,
    ),
    '            </tbody>',
    '          </table>',
    '        </div>',
  ].join('\n');
}

/** Settings the page recommends, rendered as a preset the reader can copy. */
function settingsBox(dict, rows) {
  return [
    '        <div class="card mt-4">',
    `          <p class="text-sm font-bold">${escapeHtml(dict['landing.settingsHeading'])}</p>`,
    '          <dl class="mt-3 grid gap-2 sm:grid-cols-2">',
    ...rows.map(
      ([label, value]) =>
        '            <div class="flex items-baseline justify-between gap-3 border-b border-ink-200 pb-1.5 dark:border-ink-800">' +
        `<dt class="text-sm text-ink-600 dark:text-ink-300">${escapeHtml(label)}</dt>` +
        `<dd class="font-mono text-sm font-semibold tabular-nums">${escapeHtml(value)}</dd></div>`,
    ),
    '          </dl>',
    '        </div>',
  ].join('\n');
}

function faqBlock(dict, pairs) {
  if (pairs.length === 0) return '';
  return [
    `        <h2 class="mt-10 text-xl font-bold">${escapeHtml(dict['common.faq'])}</h2>`,
    '        <div class="mt-3 space-y-2">',
    ...pairs.flatMap((pair) => [
      '          <details class="card">',
      `            <summary class="cursor-pointer text-sm font-semibold">${escapeHtml(pair.question)}</summary>`,
      `            <p class="mt-3 border-t border-ink-200 pt-3 text-sm leading-relaxed text-ink-600 dark:border-ink-800 dark:text-ink-300">${escapeHtml(pair.answer)}</p>`,
      '          </details>',
    ]),
    '        </div>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Tool pages
// ---------------------------------------------------------------------------

function toolContent(page, dict) {
  const { tool } = page;
  const name = dict[`tool.${tool}.name`];
  const description = dict[`tool.${tool}.description`];

  const faqs = [1, 2, 3]
    .filter((n) => dict[`tool.${tool}.q${n}`] && dict[`tool.${tool}.a${n}`])
    .map((n) => ({ question: dict[`tool.${tool}.q${n}`], answer: dict[`tool.${tool}.a${n}`] }));

  const body = [
    paragraph(dict[`tool.${tool}.intro`]),
    section(
      dict['tool.whatHeading'],
      bullets([1, 2, 3, 4].map((n) => dict[`tool.${tool}.point${n}`]).filter(Boolean)),
    ),
    section(dict['tool.edgeHeading'], paragraph(dict[`tool.${tool}.edge`])),
    faqBlock(dict, faqs),
  ].join('\n');

  return {
    title: fillPlain(dict['tool.meta.title'], { tool: name }),
    description,
    h1: name,
    body,
    faqs,
    toolQuery: `?mode=${TOOL_MODE[tool]}`,
  };
}

// ---------------------------------------------------------------------------
// Colour pages
// ---------------------------------------------------------------------------

/**
 * A colour page.
 *
 * The numbers are real: the Lab coordinates come from the same conversion the
 * engine runs, and the recommended tolerance is converted through the same
 * curve the slider uses, so "28 means ΔE 4.7" is the truth about this build
 * rather than a plausible-sounding figure.
 */
function colorContent(page, dict) {
  const { color } = page;
  const rgb = parseHex(color.hex);
  const lab = rgbToLab(...rgb);
  const name = dict[`color.${color.id}`];
  const distance = toleranceToDistance(color.tolerance);

  const vars = { color: name, hex: color.hex };

  // Near-neutral colours sit close to everything else that is near-neutral, so
  // they need a tighter tolerance than a saturated colour does. Saying which
  // of the two this is explains the recommended number instead of asserting it.
  const traitKey = `color.trait.${color.trait}`;

  const faqs = [
    {
      question: fillPlain(dict['color.q1'], vars),
      answer: fillPlain(dict['color.a1'], { ...vars, tolerance: color.tolerance }),
    },
    { question: fillPlain(dict['color.q2'], vars), answer: fillPlain(dict['color.a2'], vars) },
    { question: fillPlain(dict['color.q3'], vars), answer: fillPlain(dict['color.a3'], vars) },
  ];

  const body = [
    paragraph(fillPlain(dict['color.intro'], vars)),
    '        <div class="mt-4 flex items-center gap-3">',
    `          <span class="h-12 w-12 flex-none rounded-xl border border-ink-300 dark:border-ink-600" style="background:${color.hex}" aria-hidden="true"></span>`,
    `          <p class="font-mono text-sm text-ink-600 dark:text-ink-300">${escapeHtml(color.hex)} &middot; rgb(${rgb.join(', ')})</p>`,
    '        </div>',
    factTable(fillPlain(dict['color.tableCaption'], vars), [
      [dict['color.hex'], color.hex],
      [dict['color.rgb'], rgb.join(', ')],
      // `+ 0` collapses negative zero: pure white's a* computes to -0,
      // and "a* -0.0" on the highest-traffic colour page reads as a bug.
      [dict['color.lab'], `L* ${(lab[0] + 0).toFixed(1)}  a* ${(lab[1] + 0).toFixed(1)}  b* ${(lab[2] + 0).toFixed(1)}`],
      [dict['color.lightness'], `${Math.round(luminance(...rgb) * 100)}%`],
      [dict['color.deltaE'], `ΔE ${distance.toFixed(1)}`],
    ]),
    section(dict['color.settingsSection'], paragraph(dict[traitKey])),
    settingsBox(dict, [
      [dict['mode.heading'], dict['mode.color']],
      [dict['adjust.tolerance'], String(color.tolerance)],
      [dict['adjust.contiguous'], dict['landing.off']],
      [dict['adjust.decontaminate'], dict['landing.on']],
    ]),
    section(dict['color.whenHeading'], paragraph(fillPlain(dict['color.when'], vars))),
    faqBlock(dict, faqs),
  ].join('\n');

  return {
    title: fillPlain(dict['color.meta.title'], vars),
    description: fillPlain(dict['color.meta.description'], { ...vars, tolerance: color.tolerance }),
    h1: fillPlain(dict['color.h1'], vars),
    body,
    faqs,
    toolQuery: `?mode=color&color=${encodeURIComponent(color.hex)}`,
  };
}

// ---------------------------------------------------------------------------
// Format pages
// ---------------------------------------------------------------------------

/**
 * A format page.
 *
 * The one fact that decides the whole answer is whether the source format can
 * store an alpha channel. A JPEG cannot, which is why "make the background of
 * my JPG transparent" always resolves to "save it as a PNG instead" — and
 * saying so plainly is more useful than a generic how-to.
 */
function formatContent(page, dict) {
  const { format } = page;
  const vars = { format: format.label };

  const alphaKey =
    format.alpha === true ? 'format.alpha.yes' : format.alpha === 'binary' ? 'format.alpha.binary' : 'format.alpha.no';

  const faqs = [
    { question: fillPlain(dict['format.q1'], vars), answer: fillPlain(dict[`${alphaKey}.answer`], vars) },
    { question: fillPlain(dict['format.q2'], vars), answer: fillPlain(dict['format.a2'], vars) },
    { question: fillPlain(dict['format.q3'], vars), answer: fillPlain(dict['format.a3'], vars) },
  ];

  const body = [
    paragraph(fillPlain(dict['format.intro'], vars)),
    factTable(fillPlain(dict['format.tableCaption'], vars), [
      [dict['format.source'], format.label],
      [dict['format.transparency'], dict[alphaKey]],
      [dict['format.compression'], format.lossy ? dict['format.lossy'] : dict['format.lossless']],
      [dict['format.output'], 'PNG'],
    ]),
    section(dict['format.whyHeading'], paragraph(fillPlain(dict[`${alphaKey}.why`], vars))),
    section(dict['format.stepsHeading'], bullets([1, 2, 3, 4].map((n) => fillPlain(dict[`format.step${n}`], vars)))),
    faqBlock(dict, faqs),
  ].join('\n');

  return {
    title: fillPlain(dict['format.meta.title'], vars),
    description: fillPlain(dict['format.meta.description'], vars),
    h1: fillPlain(dict['format.h1'], vars),
    body,
    faqs,
    toolQuery: '',
  };
}

// ---------------------------------------------------------------------------
// Use-case pages
// ---------------------------------------------------------------------------

function useCaseContent(page, dict) {
  const { useCase } = page;
  const name = dict[`use.${useCase.id}.name`];
  const vars = { subject: name };

  const faqs = [
    { question: fillPlain(dict['use.q1'], vars), answer: fillPlain(dict['use.a1'], vars) },
    { question: fillPlain(dict['use.q2'], vars), answer: fillPlain(dict['use.a2'], vars) },
    { question: fillPlain(dict['use.q3'], vars), answer: fillPlain(dict['use.a3'], vars) },
  ];

  const body = [
    paragraph(dict[`use.${useCase.id}.intro`]),
    section(dict['use.settingsHeading'], paragraph(dict[`use.${useCase.id}.why`])),
    settingsBox(dict, [
      [dict['mode.heading'], dict[`mode.${useCase.mode}`]],
      [dict['adjust.tolerance'], String(useCase.tolerance)],
      [dict['adjust.contiguous'], useCase.contiguous ? dict['landing.on'] : dict['landing.off']],
      [dict['out.format'], dict['out.png']],
    ]),
    section(dict['use.stepsHeading'], bullets([1, 2, 3, 4].map((n) => fillPlain(dict[`use.step${n}`], vars)))),
    section(dict['use.watchHeading'], paragraph(dict[`use.${useCase.id}.watch`])),
    faqBlock(dict, faqs),
  ].join('\n');

  return {
    title: fillPlain(dict['use.meta.title'], vars),
    description: fillPlain(dict['use.meta.description'], vars),
    h1: fillPlain(dict['use.h1'], vars),
    body,
    faqs,
    toolQuery: `?mode=${useCase.mode}`,
  };
}

// ---------------------------------------------------------------------------

export function contentFor(page, dict) {
  switch (page.kind) {
    case 'tool':
      return toolContent(page, dict);
    case 'color':
      return colorContent(page, dict);
    case 'format':
      return formatContent(page, dict);
    case 'useCase':
      return useCaseContent(page, dict);
    default:
      throw new Error(`No content generator for page kind "${page.kind}"`);
  }
}

export { fill };
