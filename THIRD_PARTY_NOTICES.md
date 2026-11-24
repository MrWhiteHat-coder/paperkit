# Third-party software

PaperKit ships unmodified copies of these libraries in `public/vendor/`. Each keeps its own license.

| Library | Version | License | Used for |
|---|---|---|---|
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 | MIT | Building and editing PDFs |
| [PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 6.5.438 | Apache-2.0 (see `public/vendor/pdfjs/LICENSE`) | Rendering pages and thumbnails |
| [qpdf-wasm](https://github.com/neslinesli93/qpdf-wasm) / [qpdf](https://github.com/qpdf/qpdf) | 0.3.1 | ISC / Apache-2.0 | Password protect, unlock, lossless compression |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | 7.0.0 | Apache-2.0 | OCR (language data and engine core load from jsDelivr on first use) |
| [heic2any](https://github.com/alexcorvi/heic2any) | 0.0.4 | MIT (bundles libheif, LGPL-3.0) | Reading iPhone HEIC photos |
| [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) | via Fontsource | OFL-1.1 | Display font |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | via Fontsource | OFL-1.1 | Mono font |

`heic2any.min.js` is a separate, replaceable file, so you may swap in your own build of libheif as the LGPL allows.
