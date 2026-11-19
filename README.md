# Evidence Lab

[Open Evidence Lab](https://coolcode.ca/evidencelab/) to investigate selectable text in a local PDF. The built-in case opens the full, unaltered [Nova Scotia release 2020-00906-TIR](https://openinformation.novascotia.ca/d/8psg-54u5), a public response about the latest provincial bridge inspections as of June 1, 2020. The source document is © Crown copyright, Province of Nova Scotia. [Original PDF](https://openinformation.novascotia.ca/api/views/8psg-54u5/files/d1162ffb-acd0-4911-8983-5074ef4c8bd9?download=true&filename=2020-00906-TIR_PublicPackage.pdf) · [Reproduction terms](https://www.novascotia.ca/copyright).

<!-- coolcode:guide -->
Choose the Allain Creek question to find the April 20, 2020 Level 1 and July 16, 2019 Level 2 inspection dates on physical PDF page 2. Choose Annapolis Tidal Gate for page 3. Inspect the rows, pin the supporting lines, add your own note and download a Markdown brief with the release record and physical page citations.
<!-- /coolcode:guide -->

Choose or drop a PDF, then analyze a range of physical pages. Search for phrases or names, open cited pages in the browser PDF viewer, and keep notes alongside the extracted text.

Pin pages from the search results or the page detail. Select text in the detail and choose **Pin highlighted text** to attach an excerpt. A page can hold one pinned excerpt, which you can replace or remove. Open the **Evidence brief** to review pinned citations, excerpts and saved notes, then copy or download the Markdown. Unpinning clears the excerpt and keeps the saved research note. The separate JSON download continues to include metadata, page numbers, dates, reference counts and notes without PDF text.

The PDF, password and analysis stay in the current browser tab. Pins and notes last for that tab session and clear when another PDF is opened. Very large PDFs can be split into files of 160 MB or less and scanned in smaller page ranges. Image-only pages need a searchable text layer created separately. Section counts refer to written mentions, and date recognition covers ISO and common English spellings. Repeated text can reflect a duplicate page or a standardized form, so check the cited pages.

## Build locally

Run `python3 scripts/build.py` and `python3 -m http.server 8000 --directory dist`. Open [localhost:8000](http://localhost:8000/) in a current browser. Run `node --test tests/analysis.test.mjs` to check the analysis functions.

The build validates and copies the pinned [Mozilla PDF.js](https://github.com/mozilla/pdf.js) distribution, licensed under Apache 2.0. The generated site includes the PDF.js notice, its bundled font notices, and the 230-page original release. The build verifies the SHA-256 of the PDF against the reviewed copy. The initial analysis covers physical pages 2–4. Set another page range to inspect the rest. All other application code runs via relative paths. The deployment workflow publishes the generated directory to GitHub Pages.
