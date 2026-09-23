/**
 * Save a response body the browser has already downloaded as a named file.
 *
 * Used for the server-rendered PDFs. A plain <a href> cannot be used for these:
 * the request needs the Authorization header that apiClient attaches, so the
 * bytes arrive in JavaScript and have to be handed to the browser from there.
 */
export function saveBlob(data: BlobPart, filename: string, type = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a delay: Safari aborts the download if the URL dies immediately.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
