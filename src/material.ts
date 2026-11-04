export interface Material {
  bloom: number;
  light: number;
  glint: number;
  rim: number;
  lift: number;
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
  glint: [0, 1],
  rim: [0, 1],
  lift: [0, 1],
  lightAngle: [-180, 180],
  transparency: [0, 1],
  refraction: [0, 1],
  depth: [0, 96],
  dispersion: [0, 1],
  frost: [0, 1],
  splay: [0, 1],
};

export const numericKeys = Object.keys(ranges) as NumericKey[];

export const defaults: Material = { bloom: 0.2, light: 0.3, glint: 0, rim: 0.35, lift: 0.15, lightAngle: -45, transparency: 0.85, refraction: 0.3, depth: 6, dispersion: 0.2, frost: 0.7, splay: 0, tint: "auto" };

export const clampValue = (key: NumericKey, value: number) => {
  const [min, max] = ranges[key];
  return Math.min(max, Math.max(min, value));
};

export function resolveMaterial(...layers: (Partial<Material> | undefined)[]): Material {
  const result: Material = { ...defaults };
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
