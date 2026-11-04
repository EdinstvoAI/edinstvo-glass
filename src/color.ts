export type Rgba = readonly [number, number, number, number];

const cache = new Map<string, Rgba>();
let probe: CanvasRenderingContext2D | null = null;

export function parseColor(color: string): Rgba {
  const known = cache.get(color);
  if (known) return known;
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return [1, 1, 1, 1];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#fff";
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  const rgba: Rgba = a ? [r / a, g / a, b / a, a / 255] : [0, 0, 0, 0];
  cache.set(color, rgba);
  return rgba;
}

export function prefersDark() {
  const theme = document.documentElement.dataset.theme;
  if (theme) return theme === "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTint(tint: string): readonly [number, number, number] {
  const [r, g, b] = parseColor(tint === "auto" ? (prefersDark() ? "#1c1c1e" : "#f9f9f9") : tint);
  return [r, g, b];
}
