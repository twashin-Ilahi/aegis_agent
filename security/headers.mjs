// Single source of truth for the web security headers. Used by the Vite build (CSP meta tag),
// public/_headers and deploy/nginx.conf. A unit test fails if those files drift from this.

export const CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://yields.llama.fi https://api.anthropic.com",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
];

/** A <meta> CSP cannot set frame-ancestors, so the header version adds it. */
export const CSP_META = CSP_DIRECTIVES.join('; ');
export const CSP_HEADER = [...CSP_DIRECTIVES, "frame-ancestors 'none'"].join('; ');

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP_HEADER,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
};
