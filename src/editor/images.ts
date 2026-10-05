// Turning picked, pasted or dropped files into compact data URLs.

const MAX_SIDE = 1600;

export interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This file is not an image the browser can read.'));
    img.src = src;
  });
}

function hasTransparency(img: HTMLImageElement): boolean {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;
  ctx.drawImage(img, 0, 0, 48, 48);
  const data = ctx.getImageData(0, 0, 48, 48).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

/** Downscale big pictures (max 1600px) and pick JPEG unless the image has transparency. */
export async function processImage(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const width = img.naturalWidth || 800;
  const height = img.naturalHeight || 600;
  // Vector and animated images are kept as they are.
  if (file.type === 'image/svg+xml' || (file.type === 'image/gif' && file.size < 3_000_000)) return { src: original, width, height };
  const k = Math.min(1, MAX_SIDE / Math.max(width, height));
  if (k === 1 && file.size < 400_000) return { src: original, width, height };
  const c = document.createElement('canvas');
  c.width = Math.round(width * k);
  c.height = Math.round(height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const src = hasTransparency(img) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
  return { src, width: c.width, height: c.height };
}
