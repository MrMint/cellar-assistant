/**
 * "Choose from library" beside the shutter (N04): a picked photo becomes the
 * same thing a capture is — a JPEG data URL no larger than the camera's own
 * 1920 px square — so every `onCapture` consumer takes it unchanged.
 */

/** The longest side a capture has (`CameraCapture`'s `getScreenshot`). */
export const LIBRARY_IMAGE_MAX_SIDE = 1920;

/** `width × height` scaled to fit within `max` on its longest side. */
export const fitWithin = (
  width: number,
  height: number,
  max: number = LIBRARY_IMAGE_MAX_SIDE,
): { width: number; height: number } => {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The photo could not be read."));
    reader.onerror = () =>
      reject(reader.error ?? new Error("The photo could not be read."));
    reader.readAsDataURL(file);
  });

/**
 * A picked image file as a capture-sized JPEG data URL. Where the browser
 * cannot decode it into a canvas, the file's own data URL is used as is —
 * the upload path takes any image data URL — rather than refusing the photo.
 */
export const libraryImageToDataUrl = async (file: File): Promise<string> => {
  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return readAsDataUrl(file);
  }
  try {
    const bitmap = await createImageBitmap(file);
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (context === null) {
      bitmap.close();
      return readAsDataUrl(file);
    }
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return readAsDataUrl(file);
  }
};
