import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

/**
 * Remove the background from a JPEG/PNG base64 data-URL.
 * Returns a PNG data-URL with transparent background.
 * On first ever call downloads ~15 MB ONNX model from imgly CDN (cached after that).
 * Throws on network error or unreadable image — callers should catch and fall back.
 */
export async function removeBackground(dataUrl: string): Promise<string> {
  const sourceBlob = await dataUrlToBlob(dataUrl);
  const resultBlob = await imglyRemoveBackground(sourceBlob, {
    model: "isnet_fp16", // valid: "isnet" | "isnet_fp16" | "isnet_quint8" — NOT "small"/"medium"
    output: { format: "image/png", quality: 0.9 },
    // publicPath omitted → uses static imgly CDN automatically
  });
  return blobToDataUrl(resultBlob);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * Compress a PNG data-URL (e.g. the result of removeBackground) to ≤ maxPx on
 * the longest edge. Preserves transparency. Returns a PNG data-URL.
 */
export async function compressPng(dataUrl: string, maxPx = 1200): Promise<string> {
  const blob = await dataUrlToBlob(dataUrl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const w      = Math.round(img.naturalWidth  * scale);
      const h      = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to compress PNG")); };
    img.src = url;
  });
}
