import type { Backdrop } from "./backdrop.js";
import type { Material } from "./material.js";

export type Rgb = readonly [number, number, number];
export interface BackdropAnalysis { mean: Rgb; samples: Rgb[]; complexity: number; dark: boolean }

export function luminance(rgb: Rgb) {
  const linear = rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrast(a: Rgb, b: Rgb) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function adaptiveMaterial(base: Material, analysis: BackdropAnalysis, tint: Rgb, foreground: Rgb | null, moreContrast = false, reduceTransparency = false) {
  const strength = base.adaptationStrength;
  const automatic: Rgb = analysis.dark ? [0.045, 0.045, 0.055] : [0.985, 0.985, 0.98];
  const targetTint = base.tint === "auto" ? mix(automatic, analysis.mean, 0.025) : tint;
  const effectiveTint = mix(tint, targetTint, strength);
  const behind = mix(effectiveTint, analysis.mean, base.transparency);
  const textBasis = base.adaptation === "tint" ? behind : effectiveTint;
  const text: Rgb = foreground ?? (contrast([0, 0, 0], textBasis) >= contrast([1, 1, 1], textBasis) ? [0, 0, 0] : [1, 1, 1]);
  const material = { ...base };
  const worstContrast = (transparency: number) => Math.min(...analysis.samples.map(sample => contrast(text, mix(effectiveTint, sample, transparency))));
  if (base.adaptation === "contrast" || base.adaptation === "full") {
    const target = moreContrast ? 7 : 4.5;
    let low = 0, high = base.transparency;
    if (worstContrast(high) >= target) low = high;
    else for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      if (worstContrast(mid) >= target) low = mid;
      else high = mid;
    }
    if (reduceTransparency) low = Math.min(low, 0.2);
    if (base.adaptation === "full" && !moreContrast && !reduceTransparency) low = Math.max(low, base.transparency - 0.18);
    material.transparency = base.transparency * (1 - strength) + low * strength;
    if (base.adaptation === "full") material.frost = Math.min(1, base.frost + analysis.complexity * 0.18 * strength);
  }
  return { material, tint: effectiveTint, foreground: text, contrast: worstContrast(material.transparency) };
}

export class BackdropAnalyzer {
  private canvas = document.createElement("canvas");
  private context: CanvasRenderingContext2D;
  private stamp = -Infinity;
  private key = "";
  private image: Backdrop["image"] | null = null;
  private analysis: BackdropAnalysis | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private invalidate: () => void) {
    this.canvas.width = this.canvas.height = 12;
    this.context = this.canvas.getContext("2d", { willReadFrequently: true })!;
  }

  sample(source: Backdrop, rect: DOMRect, dark: boolean) {
    const { map } = source;
    const key = `${rect.left},${rect.top},${rect.width},${rect.height},${map.x},${map.y},${map.w},${map.h},${dark}`;
    if (source.image === this.image && key === this.key && !source.live) return this.analysis;
    const elapsed = performance.now() - this.stamp;
    if (this.analysis && elapsed < 150) {
      this.timer ??= setTimeout(() => { this.timer = null; this.invalidate(); }, 150 - elapsed);
      return this.analysis;
    }
    const c = this.context;
    c.fillStyle = dark ? "#18181b" : "#fff";
    c.fillRect(0, 0, 12, 12);
    c.drawImage(source.image, (rect.left - map.x) / map.w * source.width, (rect.top - map.y) / map.h * source.height, rect.width / map.w * source.width, rect.height / map.h * source.height, 0, 0, 12, 12);
    const pixels = c.getImageData(0, 0, 12, 12).data;
    const samples: Rgb[] = [];
    const mean = [0, 0, 0];
    let sum = 0, squares = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb: Rgb = [pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255];
      samples.push(rgb);
      for (let j = 0; j < 3; j++) mean[j] += rgb[j] / 144;
      const l = luminance(rgb); sum += l; squares += l * l;
    }
    const average = sum / 144;
    this.analysis = { mean: mean as unknown as Rgb, samples, complexity: Math.min(1, Math.sqrt(Math.max(0, squares / 144 - average * average)) * 2), dark: average < (this.analysis?.dark ? 0.42 : 0.28) };
    this.image = source.image; this.key = key; this.stamp = performance.now();
    return this.analysis;
  }

  destroy() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
