# Evidence Lab

[Open Evidence Lab](https://coolcode.ca/evidencelab/) to investigate selectable text in a local PDF. Try the included synthetic three-page package to see the date index, written section references and repeated page groups.

Choose or drop a PDF, then analyze a range of physical pages. Search for phrases or names, open cited pages in the browser PDF viewer, and keep notes alongside the extracted text. The JSON download includes metadata, page numbers, dates, reference counts and notes. It omits the full extracted text.

The PDF, password and analysis stay in the current browser tab. Notes last for that tab session and clear when another PDF is opened. Very large PDFs can be split into files of 160 MB or less and scanned in smaller page ranges. Image-only pages need a searchable text layer created separately. Section counts refer to written mentions, and date recognition covers ISO and common English spellings. Repeated text can reflect a duplicate page or a standardized form, so check the cited pages.

## Build locally

Run `python3 scripts/build.py` and `python3 -m http.server 8000 --directory dist`. Open [localhost:8000](http://localhost:8000/) in a current browser. Run `node --test tests/analysis.test.mjs` to check the analysis functions.

The build validates and copies the pinned [Mozilla PDF.js](https://github.com/mozilla/pdf.js) distribution, licensed under Apache 2.0. The generated site includes the PDF.js notice, its bundled font notices, and a synthetic PDF. All other application code runs via relative paths. The deployment workflow publishes the generated directory to GitHub Pages.
