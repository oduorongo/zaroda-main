// Helpers for the print windows that build HTML from strings in the browser.

/** Escape a value for interpolation into HTML text or a quoted attribute. */
export const escapeHtml = (s: any) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** A school badge is only ever an embedded image. Anything else (a URL, an SVG,
 *  a javascript: link) is dropped rather than put into an <img src>. */
export const safeImageSrc = (src: any) =>
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(String(src ?? '')) ? String(src) : '';
