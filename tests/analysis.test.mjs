import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePage, collectFindings, excerpt, extractPageText } from '../web/analysis.mjs';

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
