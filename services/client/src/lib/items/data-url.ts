/**
 * A camera capture, as something the presigned upload path can send.
 *
 * `CameraCapture` (react-webcam) hands back `getScreenshot()`'s base64 data
 * URL, as it did at `82450ad1`. The old wizard posted that string to a server
 * action (4.5 MB limit and a file-handling defect — E2d/E2f,
 * `ui-parity-inventory.md` §7); uploads now go browser → presigned PUT → `verifyUpload`
 * (`lib/api/files.ts`), which takes a `Blob`. So the capture is decoded here,
 * in the browser, and never leaves it as base64.
 *
 * `null` for anything that is not a base64 `data:` URL — a capture that
 * produced nothing usable is skipped rather than uploaded as garbage.
 */
export const dataUrlToFile = (dataUrl: string, name: string): File | null => {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (match === null) return null;
  const [, mimeType = "application/octet-stream", body = ""] = match;
  let binary: string;
  try {
    binary = atob(body);
  } catch {
    return null;
  }
  if (binary.length === 0) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], name, { type: mimeType });
};
