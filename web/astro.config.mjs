// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Public address, used for canonical links and link-preview images. Set SITE_URL
  // in the hosting dashboard (e.g. a custom domain); defaults to the Pages address.
  site: process.env.SITE_URL || 'https://uganda-data.pages.dev',
  trailingSlash: 'ignore',
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  // Content-Security-Policy as a <meta> tag: Astro hashes every inline script it
  // emits, so only our own code can run. Headers that can't live in <meta>
  // (frame-ancestors, HSTS, ...) are in public/_headers.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      // Charts and layout set inline style attributes (heights, marker positions).
      // Style injection can't run code, so allowing inline styles is an accepted trade-off.
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
