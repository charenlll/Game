interface AlphaMask {
  width: number;
  height: number;
  pixels: Uint8Array;
}

const alphaMasks = new Map<string, AlphaMask | null>();

function alphaMaskFor(image: HTMLImageElement): AlphaMask | null {
  const key = `${image.currentSrc || image.src}:${image.naturalWidth}x${image.naturalHeight}`;
  if (alphaMasks.has(key)) return alphaMasks.get(key) ?? null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixels = new Uint8Array(canvas.width * canvas.height);
    let hasVisiblePixel = false;
    for (let index = 0; index < pixels.length; index++) {
      pixels[index] = rgba[index * 4 + 3]!;
      if (pixels[index]! > 24) hasVisiblePixel = true;
    }
    // naturalWidth can be available before the browser finishes decoding the PNG.
    // An empty readback at that point must not poison the cache for this image.
    if (!hasVisiblePixel) return null;
    const mask = { width: canvas.width, height: canvas.height, pixels };
    alphaMasks.set(key, mask);
    return mask;
  } catch {
    alphaMasks.set(key, null);
    return null;
  }
}

function positionOffset(value: string | undefined, freeSpace: number, end: string): number {
  if (value === end) return freeSpace;
  if (value === 'center') return freeSpace / 2;
  if (value?.endsWith('%')) return freeSpace * Number.parseFloat(value) / 100;
  if (value?.endsWith('px')) return Number.parseFloat(value);
  return 0;
}

/** Match a viewport point to the current PNG pixel, including stage scaling and portrait animation. */
export function isOpaqueImagePixel(image: HTMLImageElement, clientX: number, clientY: number): boolean {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return false;
  const parent = image.offsetParent;
  if (!(parent instanceof HTMLElement) || !parent.offsetWidth || !parent.offsetHeight) return false;

  const parentRect = parent.getBoundingClientRect();
  const scaleX = parentRect.width / parent.offsetWidth;
  const scaleY = parentRect.height / parent.offsetHeight;
  if (!scaleX || !scaleY) return false;

  const style = getComputedStyle(image);
  const [originX, originY] = style.transformOrigin.split(' ').map(Number.parseFloat);
  const x = (clientX - parentRect.left) / scaleX - image.offsetLeft - (originX ?? 0);
  const y = (clientY - parentRect.top) / scaleY - image.offsetTop - (originY ?? 0);
  let local: DOMPoint;
  try {
    const transform = style.transform === 'none' ? new DOMMatrix() : new DOMMatrix(style.transform);
    local = new DOMPoint(x, y).matrixTransform(transform.inverse());
  } catch {
    return false;
  }
  const localX = local.x + (originX ?? 0);
  const localY = local.y + (originY ?? 0);
  const boxWidth = image.offsetWidth;
  const boxHeight = image.offsetHeight;
  if (localX < 0 || localY < 0 || localX >= boxWidth || localY >= boxHeight) return false;

  const containScale = Math.min(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight);
  const fitScale = style.objectFit === 'cover'
    ? Math.max(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight)
    : style.objectFit === 'none' ? 1
      : style.objectFit === 'scale-down' ? Math.min(1, containScale) : containScale;
  const drawnWidth = style.objectFit === 'fill' ? boxWidth : image.naturalWidth * fitScale;
  const drawnHeight = style.objectFit === 'fill' ? boxHeight : image.naturalHeight * fitScale;
  const [positionX, positionY] = style.objectPosition.split(' ');
  const drawnX = positionOffset(positionX, boxWidth - drawnWidth, 'right');
  const drawnY = positionOffset(positionY, boxHeight - drawnHeight, 'bottom');
  const pixelX = Math.floor((localX - drawnX) / drawnWidth * image.naturalWidth);
  const pixelY = Math.floor((localY - drawnY) / drawnHeight * image.naturalHeight);
  if (pixelX < 0 || pixelY < 0 || pixelX >= image.naturalWidth || pixelY >= image.naturalHeight) return false;

  const mask = alphaMaskFor(image);
  return !!mask && mask.pixels[pixelY * mask.width + pixelX]! > 24;
}
