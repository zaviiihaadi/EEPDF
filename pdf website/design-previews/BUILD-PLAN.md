# ClearPDF — design review and build plan

## Design direction

- Working name: **ClearPDF**. Simple document mark, white workspace, charcoal type, quiet borders, and a restrained red accent for PDF cues. This is a visual direction only; no Adobe logo or copied product assets.
- Desktop workspace uses a compact top toolbar, page thumbnails on the left, document canvas in the center, and document/OCR details on the right. Panels collapse on smaller screens; on mobile, page thumbnails and details become slide-over drawers.
- Original and Clean View share the same navigation and page position. Clean View uses OCR structure and normalized layout, with uncertain text clearly marked and always compared against the original.
- The supplied screens are static design previews for feedback. No application code or processing flow has been built yet.

## Implementation plan after design approval

1. **Frontend foundation:** Create a Next.js App Router + TypeScript application, responsive design tokens, reusable toolbar/sidebar/document components, dashboard, upload state, and processing workspace. Implement navigation, viewer controls, page selection, search/highlighting, panels, and clear loading/empty/error states.
2. **PDF display and clean export:** Render original PDFs with Mozilla PDF.js. Build Clean View from extracted structure and generate a separate selectable-text PDF; preserve every source file and never alter its bytes. Keep uncertain OCR text visibly marked.
3. **Server and storage:** Add server-only upload/document endpoints, PDF signature/type and size validation, private file storage, document metadata and job status persistence, access checks, idempotent jobs, retry/error handling, and cleanup controls. A production deployment should use PostgreSQL plus private object storage and a durable worker queue; local development can use SQLite and a private local storage directory.
4. **Adobe processing:** Use the official Adobe PDF Services Node SDK on the server. Run OCR to create a searchable PDF and Extract PDF to obtain structured text, reading order, page geometry, and table data. Keep Adobe credentials in server environment variables only. OCR/extraction is not treated as proof that a value is correct; uncertain text remains marked for verification.
5. **History and security:** Persist upload date, file size, page count, processing result, errors, and original/clean output references. Add secure document retrieval, delete confirmation, deduplication, and progress updates.
6. **Verification:** Exercise upload, OCR states, both views, page navigation, zoom, search, retry, export, and history with representative searchable, scanned, rotated, multipage, table, invoice, and shipping PDFs. Do not claim test coverage until Adobe credentials and representative PDFs are available.

## Current Adobe constraints to account for

- Adobe documents server-side use of its SDK and requires server-held credentials. Current Node.js guidance lists Node 18+ and `@adobe/pdfservices-node-sdk`; the documented credentials are client ID and client secret environment variables.
- Adobe PDF Extract returns structured JSON with text, reading order, layout, and table cells for native and scanned PDFs. Adobe's published current limits list 100 MB per document; Extract/PDF-to-Markdown is limited to 400 pages, with scanned Extract/PDF-to-Markdown limited to 150 pages (large table counts can lower page limits). The app should validate conservatively and show clear errors.
- Links: [Adobe OCR PDF guide](https://developer.adobe.com/document-services/docs/overview/pdf-services-api/howtos/ocr-pdf), [Adobe PDF Extract overview](https://developer.adobe.com/document-services/docs/overview/pdf-extract-api/), [Adobe authentication / getting started](https://developer.adobe.com/document-services/docs/overview/pdf-extract-api/gettingstarted), [Adobe usage limits](https://developer.adobe.com/document-services/docs/overview/limits).
