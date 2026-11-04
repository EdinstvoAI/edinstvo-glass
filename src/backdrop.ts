import { parseColor, prefersDark } from "./color.js";
import { type Box, type Fit, fitBox } from "./geometry.js";

export type GlassImage = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap | OffscreenCanvas;
export type GlassSource = "auto" | string | GlassImage;

export interface Backdrop {
  image: GlassImage;
  width: number;
  height: number;
  map: Box;
  live: boolean;
}

const viewport = (): Box => ({ x: 0, y: 0, w: innerWidth, h: innerHeight });
const images = new Map<string, HTMLImageElement>();
const solids = new Map<string, HTMLCanvasElement>();

function naturalSize(image: GlassImage): [number, number] {
  if (image instanceof HTMLImageElement) return image.complete ? [image.naturalWidth, image.naturalHeight] : [0, 0];
  if (image instanceof HTMLVideoElement) return image.readyState >= 2 ? [image.videoWidth, image.videoHeight] : [0, 0];
  return [image.width, image.height];
}

function whenReady(image: GlassImage, onReady: () => void) {
  if (image instanceof HTMLImageElement) image.addEventListener("load", onReady, { once: true });
  if (image instanceof HTMLVideoElement) image.addEventListener("loadeddata", onReady, { once: true });
}

function solid(color: string): Backdrop {
  let canvas = solids.get(color);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    solids.set(color, canvas);
  }
  return { image: canvas, width: 1, height: 1, map: viewport(), live: false };
}

function fromImage(image: GlassImage, onReady: () => void): Backdrop | null {
  const [width, height] = naturalSize(image);
  if (!width || !height) {
    whenReady(image, onReady);
    return null;
  }
  let map = viewport();
  if (image instanceof Element && image.isConnected) {
    const rect = image.getBoundingClientRect();
    const fit = getComputedStyle(image).objectFit as Fit;
    if (rect.width && rect.height) map = fitBox({ x: rect.left, y: rect.top, w: rect.width, h: rect.height }, width, height, image instanceof HTMLCanvasElement && fit === "fill" ? "fill" : fit);
  }
  const live = image instanceof HTMLVideoElement ? !image.paused : image instanceof HTMLCanvasElement || image instanceof OffscreenCanvas;
  return { image, width, height, map, live };
}

function loadImage(url: string, onReady: () => void) {
  let image = images.get(url);
  if (!image) {
    image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    images.set(url, image);
  }
  if (!image.complete) image.addEventListener("load", onReady, { once: true });
  return image;
}

function fromBackground(element: Element, onReady: () => void): Backdrop | null | undefined {
  const style = getComputedStyle(element);
  const url = /url\(["']?(.+?)["']?\)/.exec(style.backgroundImage)?.[1];
  if (url) {
    const image = loadImage(url, onReady);
    if (!image.complete || !image.naturalWidth) return null;
    const rect = element.getBoundingClientRect();
    const page = element === document.body || element === document.documentElement;
    const box = style.backgroundAttachment === "fixed" || page ? viewport() : { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
    const fit: Fit = style.backgroundSize === "cover" ? "cover" : style.backgroundSize === "contain" ? "contain" : style.backgroundSize === "100% 100%" ? "fill" : "none";
    return { image, width: image.naturalWidth, height: image.naturalHeight, map: fitBox(box, image.naturalWidth, image.naturalHeight, fit), live: false };
  }
  if (parseColor(style.backgroundColor)[3] > 0.99) return solid(style.backgroundColor);
  return undefined;
}

function discover(host: HTMLElement, rect: DOMRect, onReady: () => void): Backdrop | null {
  const stack = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  for (const element of stack) {
    if (element === host || host.contains(element) || element.hasAttribute("data-engine")) continue;
    if (element instanceof HTMLImageElement || element instanceof HTMLCanvasElement || element instanceof HTMLVideoElement) {
      const found = fromImage(element, onReady);
      if (found) return found;
      continue;
    }
    const found = fromBackground(element, onReady);
    if (found !== undefined) return found;
  }
  return solid(prefersDark() ? "#000" : "#fff");
}

export function resolveBackdrop(host: HTMLElement, rect: DOMRect, source: GlassSource, onReady: () => void): Backdrop | null {
  if (source === "auto") return discover(host, rect, onReady);
  if (typeof source === "string") {
    const element = document.querySelector(source);
    if (element instanceof HTMLImageElement || element instanceof HTMLCanvasElement || element instanceof HTMLVideoElement) return fromImage(element, onReady);
    return element ? (fromBackground(element, onReady) ?? null) : null;
  }
  return fromImage(source, onReady);
}
