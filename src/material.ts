export interface Material {
  thickness: number;
  strokeThickness: number;
  bloom: number;
  light: number;
  glint: number;
  rim: number;
  lift: number;
  lightAngle: number;
  lightColor: string;
  lightSoftness: number;
  lightDiffusion: number;
  reflection: number;
  dynamicRefraction: number;
  transparency: number;
  refraction: number;
  depth: number;
  dispersion: number;
  frost: number;
  splay: number;
  tint: string;
  adaptation: "off" | "tint" | "contrast" | "full";
  adaptationStrength: number;
  foreground: string;
}

export type TextKey = "tint" | "lightColor" | "adaptation" | "foreground";
export type NumericKey = Exclude<keyof Material, TextKey>;
export type MaterialLayer = { [K in keyof Material]?: Material[K] | "inherit" | "default" };

export interface SceneLight {
  direction?: number | string;
  intensity?: number | string;
  color?: string;
  softness?: number | string;
  diffusion?: number | string;
}

export const ranges: Record<NumericKey, readonly [number, number]> = {
  thickness: [0, 96],
  strokeThickness: [0, 8],
  bloom: [0, 1],
  light: [0, 1],
  glint: [0, 1],
  rim: [0, 1],
  lift: [0, 1],
  lightAngle: [-180, 180],
  lightSoftness: [0, 1],
  lightDiffusion: [0, 1],
  reflection: [0, 1],
  dynamicRefraction: [0, 1],
  transparency: [0, 1],
  refraction: [0, 1],
  depth: [0, 96],
  dispersion: [0, 1],
  frost: [0, 1],
  splay: [0, 1],
  adaptationStrength: [0, 1],
};

export const numericKeys = Object.keys(ranges) as NumericKey[];

export const defaults: Material = { thickness: 6, strokeThickness: 1, bloom: 0.2, light: 0.3, glint: 0, rim: 0.35, lift: 0.15, lightAngle: -45, transparency: 0.85, refraction: 0.3, depth: 6, dispersion: 0.2, frost: 0.7, splay: 0, tint: "auto", lightColor: "#fff", lightSoftness: 0, lightDiffusion: 0, reflection: 0, dynamicRefraction: 0, adaptation: "off", adaptationStrength: 1, foreground: "auto" };

export const clampValue = (key: NumericKey, value: number) => {
  const [min, max] = ranges[key];
  return Math.min(max, Math.max(min, value));
};

const directions: Record<string, number> = { top: 0, "top-right": 45, right: 90, "bottom-right": 135, bottom: 180, "bottom-left": -135, left: -90, "top-left": -45 };

export function readValue(key: NumericKey, raw: string | number) {
  if (typeof raw === "number") return raw;
  const text = raw.trim();
  if (text === "inherit" || text === "default") return text;
  if (key === "lightAngle" && text in directions) return directions[text];
  return text.endsWith("%") ? parseFloat(text) / 100 : parseFloat(text);
}

export function sceneLayer(light: SceneLight): MaterialLayer {
  const layer: MaterialLayer = {};
  if (light.direction !== undefined) layer.lightAngle = readValue("lightAngle", light.direction);
  if (light.intensity !== undefined) layer.light = readValue("light", light.intensity);
  if (light.color !== undefined) layer.lightColor = light.color;
  if (light.softness !== undefined) layer.lightSoftness = readValue("lightSoftness", light.softness);
  if (light.diffusion !== undefined) layer.lightDiffusion = readValue("lightDiffusion", light.diffusion);
  return layer;
}

export function stackLayers(...layers: (MaterialLayer | undefined)[]) {
  const result: Record<string, unknown> = Object.create(null);
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer ?? {})) {
      if (value !== undefined && value !== "inherit") result[key] = value;
    }
  }
  return result as MaterialLayer;
}

export function resolveMaterial(...layers: (MaterialLayer | undefined)[]): Material {
  const result: Material = { ...defaults };
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of numericKeys) {
      const value = layer[key];
      if (value === "default") result[key] = defaults[key];
      else if (typeof value === "number" && Number.isFinite(value)) result[key] = clampValue(key, value);
    }
    for (const key of ["tint", "lightColor", "foreground"] as const) {
      const value = layer[key];
      if (value === "default") result[key] = defaults[key];
      else if (value && value !== "inherit") result[key] = value;
    }
    const adaptation = layer.adaptation;
    if (adaptation === "default") result.adaptation = defaults.adaptation;
    else if (adaptation === "off" || adaptation === "tint" || adaptation === "contrast" || adaptation === "full") result.adaptation = adaptation;
  }
  return result;
}

export const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
