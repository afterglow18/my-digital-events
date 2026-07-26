/**
 * backgroundRemoval.ts
 *
 * Wraps @imgly/background-removal with three fixes needed for iOS Safari / WKWebView:
 *
 * 1. Object.defineProperty — locks ort.env.wasm.proxy = true so imgly's internal
 *    `proxy = false` write is silently ignored. ONNX Runtime then runs inference in
 *    a sub-worker, freeing the main JS thread (no UI freeze).
 *
 * 2. numThreads = 1 — iOS Safari has no SharedArrayBuffer, so WASM multithreading
 *    causes a silent crash. Single-threaded avoids it.
 *
 * 3. Dynamic import() — importing onnxruntime-web at module parse time triggers
 *    Vite's dep pre-bundling mid-session, causing a page reload that corrupts React's
 *    internal dispatcher. Importing it dynamically (inside the function, on first use)
 *    avoids that entirely.
 */

// Run once before the first removeBackground() call.
let ortConfigured = false;
async function configureOrt() {
  if (ortConfigured) return;
  ortConfigured = true;

  // @ts-ignore — types exist at onnxruntime-web/types.d.ts but aren't reachable
  // via the package's exports field; this is a known onnxruntime-web packaging quirk.
  const ort = await import("onnxruntime-web");

  // Lock proxy = true. imgly unconditionally writes `proxy = false` just before
  // creating an inference session (it only enables the proxy when WebGPU is
  // available, which it isn't on iOS Safari). defineProperty with a no-op setter
  // silently blocks that write so the value stays true.
  Object.defineProperty(ort.env.wasm, "proxy", {
    get: () => true,
    set: () => {},      // blocks imgly from resetting it to false
    configurable: true,
  });

  // Single-threaded: iOS Safari lacks SharedArrayBuffer, which WASM multithreading
  // requires. Any value > 1 causes a silent crash.
  ort.env.wasm.numThreads = 1;
}

/**
 * Remove the background from a JPEG/PNG base64 data-URL.
 * Returns a PNG data-URL with transparent background.
 * On first call downloads ~15 MB ONNX model from the imgly CDN (cached after that).
 * Throws on network error or unreadable image — callers should catch and fall back.
 * Inference runs in a Web Worker so the main thread stays responsive.
 */
export async function removeBackground(dataUrl: string): Promise<string> {
  await configureOrt();

  // Dynamic import — deferred until first use to avoid Vite pre-bundling on load.
  const { removeBackground: imglyRemoveBackground } = await import("@imgly/background-removal");

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
