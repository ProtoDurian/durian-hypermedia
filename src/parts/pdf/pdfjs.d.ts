// pdf.js ships these builds without types; the view uses them as `any` (it imports the library by its own file names so a
// bundler makes one chunk of each, and so the worker module can run on the main thread).
declare module "pdfjs-dist/build/pdf.min.mjs";
declare module "pdfjs-dist/build/pdf.worker.min.mjs";
