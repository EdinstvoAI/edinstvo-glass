export interface Material {
  bloom: number;
  light: number;
  lightAngle: number;
  transparency: number;
  refraction: number;
  depth: number;
  dispersion: number;
  frost: number;
  splay: number;
  tint: string;
}

export type NumericKey = Exclude<keyof Material, "tint">;

export const ranges: Record<NumericKey, readonly [number, number]> = {
  bloom: [0, 1],
  light: [0, 1],
  lightAngle: [-180, 180],
  transparency: [0, 1],
  refraction: [0, 1],
  depth: [0, 64],
  dispersion: [0, 1],
  frost: [0, 1],
  splay: [0, 1],
};

export const numericKeys = Object.keys(ranges) as NumericKey[];

export const presets = {
  clear: { bloom: 0.15, light: 0.7, lightAngle: -45, transparency: 0.92, refraction: 0.55, depth: 18, dispersion: 0.2, frost: 0.04, splay: 0.1, tint: "auto" },
  regular: { bloom: 0.25, light: 0.6, lightAngle: -45, transparency: 0.74, refraction: 0.5, depth: 16, dispersion: 0.15, frost: 0.3, splay: 0.15, tint: "auto" },
  frost: { bloom: 0.2, light: 0.45, lightAngle: -45, transparency: 0.6, refraction: 0.3, depth: 12, dispersion: 0.05, frost: 0.75, splay: 0.1, tint: "auto" },
  lens: { bloom: 0.1, light: 0.8, lightAngle: -45, transparency: 0.97, refraction: 0.9, depth: 40, dispersion: 0.35, frost: 0, splay: 0.8, tint: "auto" },
  prism: { bloom: 0.45, light: 0.9, lightAngle: -60, transparency: 0.9, refraction: 0.7, depth: 24, dispersion: 1, frost: 0.08, splay: 0.3, tint: "auto" },
} as const satisfies Record<string, Material>;

export type PresetName = keyof typeof presets;

export const clampValue = (key: NumericKey, value: number) => {
  const [min, max] = ranges[key];
  return Math.min(max, Math.max(min, value));
};

export function resolveMaterial(...layers: (Partial<Material> | undefined)[]): Material {
  const result: Material = { ...presets.regular };
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of numericKeys) {
      const value = layer[key];
      if (typeof value === "number" && Number.isFinite(value)) result[key] = clampValue(key, value);
    }
    if (layer.tint) result.tint = layer.tint;
  }
  return result;
}

export const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
