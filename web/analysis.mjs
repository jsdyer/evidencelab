const months = 'january february march april may june july august september october november december'.split(' ');
const monthPattern = months.map((month) => month.length === 3 ? month : `${month.slice(0, 3)}(?:${month.slice(3)})?`).join('|');
const day = '(\\d{1,2})(?:st|nd|rd|th)?';
const year = '((?:18|19|20|21)\\d{2})';
const monthFirst = new RegExp(`\\b(${monthPattern})\\.? +${day}(?:,? +)${year}\\b`, 'gi');
const dayFirst = new RegExp(`\\b${day} +(${monthPattern})\\.? +${year}\\b`, 'gi');
const isoDate = /\b((?:18|19|20|21)\d{2})-(\d{2})-(\d{2})\b/g;
const reference = /\b(?:sections?|subsections?|articles?|paragraphs?|ss?\.|art\.)\s*(\d{1,3}(?:\.\d{1,2})?(?:\s*\(\s*[a-z0-9]{1,4}\s*\))*)(?!\d|\.\d)/gi;

export function normalize(text) {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function asDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== Number(day)) return null;
  return date.toISOString().slice(0, 10);
}

function monthNumber(name) {
  return months.findIndex((month) => month.startsWith(name.toLowerCase().slice(0, 3))) + 1;
}

function summarizeMatches(values) {
  const counts = new Map();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Object.fromEntries(counts);
}

export function analyzePage(number, text, error = '') {
  const normalized = normalize(text);
  const dates = summarizeMatches([
    ...Array.from(normalized.matchAll(isoDate), ([, y, m, d]) => asDate(y, Number(m), d)),
    ...Array.from(normalized.matchAll(monthFirst), ([, m, d, y]) => asDate(y, monthNumber(m), d)),
    ...Array.from(normalized.matchAll(dayFirst), ([, d, m, y]) => asDate(y, monthNumber(m), d)),
  ]);
  const sections = summarizeMatches(Array.from(normalized.matchAll(reference),
    ([, clause]) => clause.replace(/\s/gu, '').toLowerCase()));
  return { number, text, normalized, searchable: normalized.toLocaleLowerCase(), dates, sections, error };
}

export function collectFindings(pages) {
  const dates = new Map();
  const sections = new Map();
  const duplicates = new Map();
  function add(index, key, page, count) {
    const entry = index.get(key) || { key, count: 0, pages: [] };
    entry.count += count;
    entry.pages.push(page);
    index.set(key, entry);
  }
  for (const page of pages) {
    for (const [key, count] of Object.entries(page.dates)) add(dates, key, page.number, count);
    for (const [key, count] of Object.entries(page.sections)) add(sections, key, page.number, count);
    if (page.normalized.length >= 40) add(duplicates, page.normalized, page.number, 1);
  }
  return {
    dates: [...dates.values()].sort((a, b) => a.key.localeCompare(b.key)),
    sections: [...sections.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'en', { numeric: true })),
    repeats: [...duplicates.values()].filter((group) => group.pages.length > 1).map(({ pages }) => pages),
  };
}

export function extractPageText(items) {
  let text = '';
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    text += item.str + (item.hasEOL ? '\n' : ' ');
  }
  return text.trim();
}

export function excerpt(page, query) {
  const point = query ? Math.max(0, page.searchable.indexOf(query)) : 0;
  const start = Math.max(0, point - 55);
  const end = Math.min(page.normalized.length, point + 160);
  return (start ? '…' : '') + page.normalized.slice(start, end) + (end < page.normalized.length ? '…' : '');
}

export function pageCitation(filename, page) {
  return `${filename}, PDF p. ${page}`;
}

function backtickFence(text, minimum) {
  const length = [...text.matchAll(/`+/g)].reduce((longest, [run]) => Math.max(longest, run.length + 1), minimum);
  return '`'.repeat(length);
}

function codeSpan(text) {
  const fence = backtickFence(text, 1);
  return `${fence} ${text.replace(/[\r\n]+/g, ' ')} ${fence}`;
}

function textBlock(text) {
  const fence = backtickFence(text, 3);
  return [fence + 'text', text, fence].join('\n');
}

export function evidenceBriefMarkdown(filename, entries, releaseUrl) {
  const parts = ['# Evidence brief', `Source PDF · ${codeSpan(filename)}`, 'Page references use the physical order in the PDF.'];
  if (releaseUrl) parts.push('Public release record · ' + releaseUrl);
  for (const { page, quote, note } of entries) {
    parts.push(`## PDF page ${page}`, codeSpan(pageCitation(filename, page)));
    if (quote) parts.push('### Selected excerpt', textBlock(quote));
    if (note) parts.push('### Research note', textBlock(note));
  }
  return parts.join('\n\n') + '\n';
}
