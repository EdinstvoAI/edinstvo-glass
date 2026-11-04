export interface Box { x: number; y: number; w: number; h: number }
export type Fit = "fill" | "cover" | "contain" | "none";

export function fitBox(box: Box, naturalW: number, naturalH: number, fit: Fit): Box {
  if (fit === "fill" || !naturalW || !naturalH) return box;
  if (fit === "none") return { x: box.x, y: box.y, w: naturalW, h: naturalH };
  const pick = fit === "cover" ? Math.max : Math.min;
  const scale = pick(box.w / naturalW, box.h / naturalH);
  const w = naturalW * scale;
  const h = naturalH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

export function uvTransform(rect: { left: number; top: number }, map: Box, scaleX: number, scaleY: number, dpr: number) {
  return {
    origin: [(rect.left - map.x) / map.w, (rect.top - map.y) / map.h] as const,
    perPixel: [scaleX / (dpr * map.w), scaleY / (dpr * map.h)] as const,
  };
}

export function cornerRadius(value: string, w: number, h: number) {
  const number = parseFloat(value) || 0;
  const px = value.trim().endsWith("%") ? (number / 100) * Math.min(w, h) : number;
  return Math.min(px, Math.min(w, h) / 2);
}

export function lightVector(angle: number): [number, number] {
  const radians = (angle * Math.PI) / 180;
  return [Math.sin(radians), -Math.cos(radians)];
}

export function softPeak(halfW: number, halfH: number, radius: number) {
  const a = halfW + radius;
  const b = halfH + radius;
  const lo = Math.min(a, b);
  return lo * (1 + (lo / Math.max(a, b)) ** 2.7) ** (-1 / 2.7) - radius;
}
