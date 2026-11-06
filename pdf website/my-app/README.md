This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# Adobe OCR setup

Scanned PDFs are processed on the server with Adobe PDF Services Export PDF (OCR to DOCX), then converted back to PDF. This creates visible selectable text and graphics instead of leaving the scan as the page background. The uploaded original stays unchanged. Adobe's DOCX reconstruction can change spacing or layout, and OCR can misread low-quality scans, so check the result against the original.

1. Create PDF Services API credentials in the [Adobe Developer Console](https://developer.adobe.com/console).
2. Copy `.env.example` to `.env.local` and set `PDF_SERVICES_CLIENT_ID` and `PDF_SERVICES_CLIENT_SECRET` there. Keep these values on the server; never add a `NEXT_PUBLIC_` prefix.
3. Restart the Next.js server, then upload and process a PDF.

`PDF_SERVICES_OCR_LOCALE` is optional and defaults to `en-US`. Adobe PDF Services supports PDFs up to 100 MB. Documents are sent to Adobe Document Cloud for OCR and reconstruction; the SDK deletes its temporary assets after the local result is saved.

