/**
 * Escapes text for safe interpolation into HTML — element content and quoted
 * attribute values alike. Use it on everything that is not a compile-time
 * constant when building HTML (emails, PDFs): names, titles, links.
 * Plain-text bodies must NOT be escaped; entities would show up literally.
 */
export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
