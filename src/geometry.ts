export interface Box { x: number; y: number; w: number; h: number }
export type Fit = "fill" | "cover" | "contain" | "none";
export type GlassShape = "rounded-rect" | "circle" | "ellipse" | "superellipse" | "path";
export interface Geometry { shape: GlassShape; curvature: number; path: string; viewBox: readonly [number, number, number, number]; fillRule: CanvasFillRule }
export type GeometryLayer = Partial<Geometry>;
export const geometryDefaults: Geometry = { shape: "rounded-rect", curvature: 4, path: "", viewBox: [0, 0, 100, 100], fillRule: "nonzero" };
export const shapeCodes: Record<GlassShape, number> = { "rounded-rect": 0, ellipse: 1, superellipse: 2, path: 3, circle: 4 };

export function resolveGeometry(...layers: (GeometryLayer | undefined)[]): Geometry {
  const result = { ...geometryDefaults };
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.shape && Object.hasOwn(shapeCodes, layer.shape)) result.shape = layer.shape;
    if (Number.isFinite(layer.curvature)) result.curvature = Math.max(2, Math.min(8, layer.curvature!));
    if (typeof layer.path === "string") {
      if (layer.path.length > 65536 || /[^MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]/.test(layer.path)) throw new TypeError("Expected SVG path data, at most 64 KiB; SVG markup is not accepted.");
      if ((layer.path.match(/[MmLlHhVvCcSsQqTtAaZz]/g)?.length ?? 0) > 4096) throw new RangeError("Path command limit is 4096.");
      const numbers = layer.path.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
      if (numbers.some(value => !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1e6)) throw new RangeError("Path coordinates must be finite and within ±1000000.");
      result.path = layer.path;
    }
    const box = layer.viewBox;
    if (Array.isArray(box) && box.length === 4 && box.every(value => Number.isFinite(value) && Math.abs(value) <= 1e6) && box[2] >= 1e-6 && box[3] >= 1e-6) result.viewBox = [...box] as [number, number, number, number];
    if (layer.fillRule === "evenodd" || layer.fillRule === "nonzero") result.fillRule = layer.fillRule;
  }
  return result;
}

export function readGeometry(element: HTMLElement, base?: GeometryLayer): Geometry {
  const attributes: GeometryLayer = {};
  const shape = element.getAttribute("shape");
  if (shape && Object.hasOwn(shapeCodes, shape)) attributes.shape = shape as GlassShape;
  if (element.hasAttribute("curvature")) attributes.curvature = Number(element.getAttribute("curvature"));
  if (element.hasAttribute("path")) attributes.path = element.getAttribute("path")!;
  const fillRule = element.getAttribute("fill-rule");
  if (fillRule === "evenodd" || fillRule === "nonzero") attributes.fillRule = fillRule;
  const viewBox = element.getAttribute("view-box")?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4) attributes.viewBox = viewBox as [number, number, number, number];
  try { return resolveGeometry(base, (element as HTMLElement & { geometry?: GeometryLayer }).geometry, attributes); }
  catch (error) { console.warn("@edinstvo/glass: invalid geometry; using rounded-rect.", error instanceof Error ? error.message : "Invalid geometry"); return resolveGeometry(); }
}

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
  const soft = lo * (1 + (lo / Math.max(a, b)) ** 2.7) ** (-1 / 2.7) - radius;
  const half = Math.min(halfW, halfH);
  const round = half ? radius / half : 0;
  return soft + (half - soft) * round;
}
