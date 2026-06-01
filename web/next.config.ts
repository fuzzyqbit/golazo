import type { NextConfig } from 'next';

const config: NextConfig = {
  // Plan 03 will add hostname enforcement here OR via instrumentation.ts.
  // Plan 04 will add font configuration only if next/font/local's
  // file-relative resolution proves insufficient — current intent is to
  // configure fonts entirely via `next/font/local` at the layout.tsx
  // call site, so no next.config.ts changes for Plan 04.
};

export default config;
