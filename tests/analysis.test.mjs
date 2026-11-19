import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePage, collectFindings, evidenceBriefMarkdown, excerpt, extractPageText, pageCitation } from '../web/analysis.mjs';

test('recognizes calendar dates across supported formats and skips impossible dates', () => {
  const page = analyzePage(3, '15 May 2021; Sep. 4, 2022; 2024-02-29; February 29 2023; 03/04/2025.');
  assert.deepEqual(page.dates, { '2024-02-29': 1, '2022-09-04': 1, '2021-05-15': 1 });
});

test('aggregates written references and duplicate page text with physical citations', () => {
  const text = 'The disclosure refers to section 19 ( 1 ) and s. 21(1)(a), and refers again to s. 19(1).';
  const pages = [analyzePage(1, text), analyzePage(3, text.replace(' and s.', ' and\n s.')), analyzePage(4, '')];
  const findings = collectFindings(pages);
  assert.deepEqual(findings.sections[0], { key: '19(1)', count: 4, pages: [1, 3] });
  assert.deepEqual(findings.repeats, [[1, 3]]);
  assert.equal(pages[2].searchable, '');
});

test('preserves PDF line breaks in details and gives query context in results', () => {
  const text = extractPageText([{ str: 'Archive', hasEOL: true }, { type: 'endMarkedContent' }, { str: 'Alice Morgan' }]);
  const page = analyzePage(2, text);
  assert.equal(text, 'Archive\nAlice Morgan');
  assert.equal(excerpt(page, 'alice'), 'Archive Alice Morgan');
});

test('builds every selected page citation with optional excerpt and note', () => {
  const report = evidenceBriefMarkdown('Disclosure.pdf', [
    { page: 1, quote: 'Exact\npassage', note: 'Reviewed 2026-11-16.' },
    { page: 7, quote: '', note: '' },
    { page: 24, quote: 'Another cited passage.', note: '' },
  ]);
  assert.equal(pageCitation('Disclosure.pdf', 7), 'Disclosure.pdf, PDF p. 7');
  assert.match(report, /Disclosure\.pdf, PDF p\. 1/);
  assert.match(report, /Disclosure\.pdf, PDF p\. 7/);
  assert.match(report, /Disclosure\.pdf, PDF p\. 24/);
  assert.equal(report.split('### Selected excerpt').length - 1, 2);
  assert.match(report, /Exact\npassage/);
  assert.match(report, /### Research note[\s\S]*Reviewed 2026-11-16\./);
});

test('preserves hostile formatting as Markdown literals', () => {
  const quote = 'first\n```\n<img src=x>\n````';
  const note = '![Do not fetch](https://example.invalid)\n```\nsecond';
  const report = evidenceBriefMarkdown('name``\n## heading.pdf', [{ page: 8, quote, note }]);
  assert.ok(report.includes('Source PDF · ``` name`` ## heading.pdf ```'));
  assert.ok(report.includes('`````text\n' + quote + '\n`````'));
  assert.ok(report.includes('````text\n' + note + '\n````'));
});

test('includes the release link for public cases and omits it for local files',()=>{
  const url='https://openinformation.novascotia.ca/d/8psg-54u5';
  assert.ok(evidenceBriefMarkdown('sample.pdf',[],url).includes(url));
  assert.ok(!evidenceBriefMarkdown('local.pdf',[]).includes('Public release record'));
});
