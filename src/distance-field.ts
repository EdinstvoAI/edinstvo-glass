import type { Geometry } from "./geometry.js";

const tile = 256;
const extent = tile - 4;

// ── Lower envelopes of parabolas give exact squared grid distances in linear time.
export function distanceTransform(mask: Uint8Array, width: number, height: number, inside: boolean) {
  const data = new Float64Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (mask[i] >= 128) === inside ? 0 : 1e12;
  const n = Math.max(width, height), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const transform = (length: number) => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < length; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k])); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < length; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) f[x] = data[y * width + x]; transform(width); for (let x = 0; x < width; x++) data[y * width + x] = d[x]; }
  for (let x = 0; x < width; x++) { for (let y = 0; y < height; y++) f[y] = data[y * width + x]; transform(height); for (let y = 0; y < height; y++) data[y * width + x] = d[y]; }
  return data;
}

interface PathBox { geometry: Geometry; aspect: number }
export interface PathField { pixels: Uint8Array; width: number; height: number; columns: number; rows: number; version: number }

export class GeometryAtlas {
  private scratch = document.createElement("canvas");
  private key = "";
  private inputs: PathBox[] = [];
  private field: PathField = { pixels: new Uint8Array(), width: 0, height: 0, columns: 1, rows: 1, version: 0 };

  update(boxes: PathBox[]): PathField {
    if (boxes.length === this.inputs.length && boxes.every((box, i) => box.geometry === this.inputs[i].geometry && box.aspect === this.inputs[i].aspect)) return this.field;
    const key = boxes.map(box => box.geometry.shape === "path" ? JSON.stringify([box.geometry, box.aspect]) : "-").join("|");
    this.inputs = boxes.map(box => ({ geometry: box.geometry, aspect: box.aspect }));
    const columns = Math.ceil(Math.sqrt(boxes.length)), rows = Math.ceil(boxes.length / columns);
    if (key === this.key) return this.field;
    const width = columns * tile, height = rows * tile;
    const atlas = new Uint8Array(width * height * 4);
    this.scratch.width = this.scratch.height = tile;
    const c = this.scratch.getContext("2d", { willReadFrequently: true })!;
    boxes.forEach((box, index) => {
      if (box.geometry.shape !== "path") return;
      const { path, viewBox: [x, y, w, h], fillRule } = box.geometry;
      const shapeWidth = extent * Math.min(1, box.aspect), shapeHeight = extent * Math.min(1, 1 / box.aspect);
      c.resetTransform(); c.clearRect(0, 0, tile, tile);
      c.save();
      c.setTransform(shapeWidth / w, 0, 0, shapeHeight / h, (tile - shapeWidth) / 2 - x * shapeWidth / w, (tile - shapeHeight) / 2 - y * shapeHeight / h);
      c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.fillStyle = "#fff";
      let parsed: Path2D;
      try { parsed = new Path2D(path); }
      catch { parsed = new Path2D(); parsed.rect(x, y, w, h); console.warn("@edinstvo/glass: invalid path syntax; using the view box."); }
      c.fill(parsed, fillRule);
      c.restore();
      c.resetTransform();
      const pixels = c.getImageData(0, 0, tile, tile);
      const mask = new Uint8Array(tile * tile);
      for (let i = 0; i < mask.length; i++) mask[i] = pixels.data[i * 4 + 3];
      const toInside = distanceTransform(mask, tile, tile, true), toOutside = distanceTransform(mask, tile, tile, false);
      const signed = new Float64Array(mask.length);
      for (let i = 0; i < signed.length; i++) signed[i] = Math.sqrt(toInside[i]) - Math.sqrt(toOutside[i]) + (mask[i] >= 128 ? 0.5 : -0.5);
      for (let i = 0; i < signed.length; i++) if (mask[i] > 0 && mask[i] < 255) signed[i] = 0.5 - mask[i] / 255;
      const smooth = new Float64Array(mask.length);
      for (let py = 0; py < tile; py++) for (let px = 0; px < tile; px++) {
        let sum = 0;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) sum += signed[Math.max(0, Math.min(tile - 1, py + oy)) * tile + Math.max(0, Math.min(tile - 1, px + ox))];
        smooth[py * tile + px] = sum / 25;
      }
      for (let i = 0; i < signed.length; i++) {
        const encode = (value: number) => Math.round(Math.max(0, Math.min(1, (value + 512) / 1024)) * 65535);
        const raw = encode(signed[i]), soft = encode(smooth[i]);
        pixels.data.set([raw >> 8, raw & 255, soft >> 8, soft & 255], i * 4);
      }
      for (let row = 0; row < tile; row++) atlas.set(pixels.data.subarray(row * tile * 4, (row + 1) * tile * 4), ((Math.floor(index / columns) * tile + row) * width + index % columns * tile) * 4);
    });
    this.key = key;
    Object.assign(this.field, { pixels: atlas, width, height, columns, rows, version: this.field.version + 1 });
    return this.field;
  }

}
