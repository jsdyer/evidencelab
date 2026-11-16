import { getDocument, GlobalWorkerOptions } from './vendor/pdf.mjs';
import { analyzePage, collectFindings, excerpt, extractPageText, normalize } from './analysis.mjs';

const $ = (id) => document.getElementById(id);
const vendor = (path) => new URL(`./vendor/${path}`, import.meta.url).href;
GlobalWorkerOptions.workerSrc = vendor('pdf.worker.mjs');

const maximumBytes = 160 * 1024 * 1024;
const pageSize = 25;
const dateSize = 30;
let version = 0;
let task;
let pdf;
let originalUrl;
let documentName;
let metadata = {};
let pages = new Map();
let notes = new Map();
let index;
let pageOffset = 0;
let dateCount = dateSize;
let selectedPage;
let unlock;
let scanning = false;
let stopped = false;

function formatNumber(value) {
  return value.toLocaleString('en-CA');
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, action) {
  const node = element('button', text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function setStatus(id, message, error = false) {
  $(id).textContent = message;
  $(id).classList.toggle('error', error);
}

function hidePassword() {
  unlock = undefined;
  $('password-row').hidden = true;
  $('password').value = '';
}

async function openFile(filePromise, autoScan = false) {
  const active = ++version;
  $('detail').close();
  $('workbench').hidden = true;
  $('results').hidden = true;
  hidePassword();
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  if (task) task.destroy().catch(() => {});
  task = undefined;
  pdf = undefined;
  originalUrl = undefined;
  metadata = {};
  pages = new Map();
  notes = new Map();
  index = undefined;
  pageOffset = 0;
  dateCount = dateSize;
  selectedPage = undefined;
  scanning = false;
  stopped = false;
  $('metadata').open = false;
  $('search').value = '';
  $('filter').value = 'all';
  setStatus('scan-status', '');
  setStatus('status', 'Opening PDF…');

  try {
    const file = await filePromise;
    if (!file.size) throw new Error('The PDF is empty.');
    if (file.size > maximumBytes) throw new Error('This PDF exceeds the 160 MB browser limit. Split it into smaller files and try again.');
    const data = new Uint8Array(await file.arrayBuffer());
    if (active !== version) return;

    task = getDocument({
      data,
      cMapUrl: vendor('cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: vendor('standard_fonts/'),
      useWasm: false,
      isEvalSupported: false,
      enableXfa: false,
    });
    task.onPassword = (update, reason) => {
      if (active !== version) return;
      unlock = update;
      $('password-row').hidden = false;
      $('password').focus();
      setStatus('status', reason === 2 ? 'That password did not unlock the PDF.' : 'This PDF requires a password.', reason === 2);
    };
    const opened = await task.promise;
    if (active !== version) return;
    pdf = opened;
    hidePassword();
    documentName = file.name;
    originalUrl = URL.createObjectURL(file);
    $('open-original').href = originalUrl;
    $('document-name').textContent = documentName;
    $('start').max = pdf.numPages;
    $('end').max = pdf.numPages;
    $('start').value = 1;
    $('end').value = pdf.numPages;
    syncScanControls();
    $('workbench').hidden = false;
    setStatus('status', `Opened ${formatNumber(pdf.numPages)} pages. Choose the range to analyze.`);
    if (autoScan) scan();

    const attributes = await opened.getMetadata().catch(() => ({}));
    if (active !== version) return;
    for (const [key, label] of Object.entries({
      Title: 'Title', Author: 'Author', Subject: 'Subject', Creator: 'Creator', Producer: 'Producer',
      CreationDate: 'Creation date', ModDate: 'Modification date', PDFFormatVersion: 'PDF version',
    })) {
      const value = attributes.info?.[key];
      if (typeof value === 'string' && value.trim()) metadata[label] = value.trim();
    }
    $('metadata-list').replaceChildren(...Object.entries(metadata).flatMap(([label, value]) => [
      element('dt', label), element('dd', value),
    ]));
    if (!Object.keys(metadata).length) {
      $('metadata-list').append(element('dt', 'Fields'), element('dd', 'No document metadata was extracted.'));
    }
  } catch (error) {
    if (active !== version) return;
    hidePassword();
    setStatus('status', error.message || 'The browser could not read this file as a PDF.', true);
  }
}

function syncScanControls() {
  $('start').disabled = scanning;
  $('end').disabled = scanning;
  $('scan').disabled = scanning;
  $('stop').hidden = !scanning;
  $('progress').hidden = !scanning;
}

async function scan() {
  if (!pdf || scanning) return;
  const start = Number($('start').value);
  const end = Number($('end').value);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || start > end || end > pdf.numPages) {
    setStatus('scan-status', `Choose a start and end page between 1 and ${formatNumber(pdf.numPages)}.`, true);
    return;
  }

  const active = version;
  const source = pdf;
  const total = end - start + 1;
  const progress = $('progress');
  progress.max = total;
  progress.value = 0;
  scanning = true;
  stopped = false;
  syncScanControls();

  for (let number = start; number <= end; number++) {
    if (active !== version || stopped) break;
    if (!pages.has(number) || pages.get(number).error) {
      let page;
      try {
        page = await source.getPage(number);
        const { items } = await page.getTextContent();
        if (active !== version) return;
        pages.set(number, analyzePage(number, extractPageText(items)));
      } catch {
        if (active !== version) return;
        pages.set(number, analyzePage(number, '', 'Could not extract text from this page.'));
      } finally {
        page?.cleanup();
      }
    }
    progress.value = number - start + 1;
    if (number === start || number % 10 === 0) {
      setStatus('scan-status', `Analyzing page ${formatNumber(number)} of ${formatNumber(end)}…`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (active !== version) return;
  const all = [...pages.values()].sort((a, b) => a.number - b.number);
  index = collectFindings(all);
  scanning = false;
  syncScanControls();
  const withText = all.filter(({ text }) => text).length;
  const failures = all.filter(({ error }) => error).length;
  const messages = [
    stopped ? 'Analysis stopped.' : 'Analysis complete.',
    `${formatNumber(all.length)} pages analyzed; ${formatNumber(withText)} with selectable text.`,
  ];
  if (failures) messages.push(`${formatNumber(failures)} pages could not be read.`);
  if (all.length && !withText) messages.push('Try a copy with a searchable text layer.');
  setStatus('scan-status', messages.join(' '), all.length > 0 && !withText);
  $('results').hidden = !all.length;
  renderStats(all);
  renderIndexes();
  renderPages(true);
}

function renderStats(all) {
  const counts = [
    [all.length, 'Analyzed pages'],
    [index.dates.length, 'Distinct dates'],
    [index.sections.reduce((total, { count }) => total + count, 0), 'Section mentions'],
    [index.repeats.length, 'Repeated page groups'],
  ];
  $('stats').replaceChildren(...counts.map(([count, label]) => {
    const card = element('div', '', 'stat');
    card.append(element('strong', formatNumber(count)), element('span', label));
    return card;
  }));
}

function renderIndex(container, entries, missing) {
  container.replaceChildren();
  if (!entries.length) {
    container.append(element('p', missing, 'muted'));
    return;
  }
  for (const { key, count, pages: pageNumbers } of entries) {
    const line = element('div', '', 'index-line');
    const links = element('div', '', 'row');
    const more = pageNumbers.length > 12;
    const visiblePages = more ? pageNumbers.slice(0, 12) : pageNumbers;
    const pageButton = (number) => button(`p. ${number}`, () => showPage(number));
    links.append(...visiblePages.map(pageButton));
    if (more) {
      const expand = button(`+${pageNumbers.length - 12} pages`, () => {
        expand.replaceWith(...pageNumbers.slice(12).map(pageButton));
      });
      links.append(expand);
    }
    line.append(element('strong', key), element('small', count ? `${count} mention${count === 1 ? '' : 's'}` : ''), links);
    container.append(line);
  }
}

function renderIndexes() {
  renderIndex($('dates'), index.dates.slice(0, dateCount), 'No dates were recognized in these pages.');
  $('more-dates').hidden = dateCount >= index.dates.length;
  renderIndex($('sections'), index.sections, 'No written section references were recognized.');
  renderIndex($('repeats'), index.repeats.map((pages) => ({ key: `${pages.length} matching pages`, pages })), 'No matching page text was found.');
}

function renderPages(reset = false) {
  if (!index) return;
  if (reset) pageOffset = 0;
  const query = normalize($('search').value).toLocaleLowerCase();
  const filter = $('filter').value;
  const repeats = new Set(index.repeats.flat());
  const filters = {
    sections: (page) => Object.keys(page.sections).length,
    dates: (page) => Object.keys(page.dates).length,
    repeats: (page) => repeats.has(page.number),
    empty: (page) => !page.text,
    saved: (page) => notes.has(page.number),
    all: () => true,
  };
  const matches = [...pages.values()]
    .filter((page) => filters[filter](page) && (!query || page.searchable.includes(query)))
    .sort((a, b) => a.number - b.number);
  if (pageOffset >= matches.length) pageOffset = Math.max(0, Math.floor((matches.length - 1) / pageSize) * pageSize);
  const visible = matches.slice(pageOffset, pageOffset + pageSize);
  $('pages').replaceChildren(...visible.map((page) => {
    const item = element('li');
    const heading = element('div', '', 'row');
    heading.append(button(`Page ${page.number}`, () => showPage(page.number)));
    if (repeats.has(page.number)) heading.append(element('span', 'Repeated text', 'chip'));
    if (notes.has(page.number)) heading.append(element('span', 'Saved note', 'chip'));
    item.append(heading, element('p', page.error || excerpt(page, query) || 'No selectable text on this page.', 'muted'));
    return item;
  }));
  setStatus('page-status', matches.length
    ? `Showing ${formatNumber(pageOffset + 1)}–${formatNumber(pageOffset + visible.length)} of ${formatNumber(matches.length)} matching pages.`
    : 'No pages match the current filters.');
  $('pager').hidden = matches.length <= pageSize;
  $('previous').disabled = !pageOffset;
  $('next').disabled = pageOffset + pageSize >= matches.length;
}

function showPage(number) {
  const page = pages.get(number);
  if (!page) return;
  selectedPage = number;
  $('detail-title').textContent = `PDF page ${number}`;
  $('citation').textContent = `${documentName}, PDF p. ${number}`;
  $('open-page').href = `${originalUrl}#page=${number}`;
  $('detail-text').textContent = page.error || page.text || 'No selectable text on this page.';
  $('note').value = notes.get(number) || '';
  $('copy-status').textContent = '';
  $('note-status').textContent = '';
  $('detail').showModal();
}

function exportFindings() {
  if (!index) return;
  const results = {
    file: documentName,
    totalPages: pdf.numPages,
    metadata,
    dates: index.dates,
    sectionReferences: index.sections,
    repeatedPageText: index.repeats,
    analyzedPages: [...pages.keys()].sort((a, b) => a - b),
    notes: [...notes.entries()].sort(([a], [b]) => a - b).map(([page, text]) => ({
      page, citation: `${documentName}, PDF p. ${page}`, text,
    })),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' }));
  const link = element('a');
  link.download = 'evidence-findings.json';
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('choose').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', () => {
  const [file] = $('file').files;
  if (file) openFile(Promise.resolve(file));
  $('file').value = '';
});
$('sample').addEventListener('click', () => {
  openFile(fetch('./sample.pdf').then(async (response) => {
    if (!response.ok) throw new Error('The example PDF could not be loaded.');
    return new File([await response.blob()], 'CoolCode example.pdf', { type: 'application/pdf' });
  }), true);
});
$('unlock').addEventListener('click', () => {
  if (!unlock) return;
  const submit = unlock;
  const value = $('password').value;
  hidePassword();
  submit(value);
});
$('password').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('unlock').click();
});

for (const id of ['dragover', 'dragenter']) $('drop').addEventListener(id, (event) => {
  event.preventDefault();
  $('drop').classList.add('active');
});
$('drop').addEventListener('dragleave', () => $('drop').classList.remove('active'));
$('drop').addEventListener('drop', (event) => {
  event.preventDefault();
  $('drop').classList.remove('active');
  const [file] = event.dataTransfer.files;
  if (file) openFile(Promise.resolve(file));
});

$('scan').addEventListener('click', scan);
$('stop').addEventListener('click', () => { stopped = true; });
$('search').addEventListener('input', () => renderPages(true));
$('filter').addEventListener('change', () => renderPages(true));
$('previous').addEventListener('click', () => { pageOffset -= pageSize; renderPages(); });
$('next').addEventListener('click', () => { pageOffset += pageSize; renderPages(); });
$('more-dates').addEventListener('click', () => { dateCount += dateSize; renderIndexes(); });
$('close-detail').addEventListener('click', () => $('detail').close());
$('copy-citation').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('citation').textContent);
    $('copy-status').textContent = 'Citation copied.';
  } catch {
    $('copy-status').textContent = 'Clipboard unavailable. Select and copy the citation above.';
  }
});
$('save-note').addEventListener('click', () => {
  const value = $('note').value.trim();
  if (value) notes.set(selectedPage, value);
  else notes.delete(selectedPage);
  $('note-status').textContent = value ? 'Saved for this session.' : 'Note cleared.';
  renderPages();
});
$('export').addEventListener('click', exportFindings);
