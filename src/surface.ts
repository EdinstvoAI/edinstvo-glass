import { type Backdrop, type GlassSource, resolveBackdrop } from "./backdrop.js";
import { resolveTint } from "./color.js";
import { cornerRadius, lightVector, softPeak, uvTransform } from "./geometry.js";
import { type Interaction, type InteractionName, Shape, type ShapeBox, Spring, interactions } from "./interaction.js";
import { type Material, type PresetName, kebab, numericKeys, presets, resolveMaterial } from "./material.js";
import { Renderer, maxShapes } from "./renderer.js";

export interface GlassOptions {
  material?: PresetName | Partial<Material>;
  interaction?: InteractionName | Interaction;
  source?: GlassSource;
  live?: boolean;
  merge?: number;
  appear?: boolean;
}

const pad = 32;
const surfaces = new Set<GlassSurface>();
let pending = 0;
let lastTick = 0;
let listening = false;

function wake() {
  pending ||= requestAnimationFrame(tick);
}

function tick(now: number) {
  pending = 0;
  const dt = Math.min((now - lastTick) / 1000, 1 / 30);
  lastTick = now;
  Renderer.shared?.nextFrame();
  let again = false;
  for (const surface of surfaces) again = surface.update(dt) || again;
  if (again) wake();
}

function nudgeAll() {
  for (const surface of surfaces) surface.nudge();
}

function restyleAll() {
  for (const surface of surfaces) surface.restyle();
}

function listen() {
  if (listening) return;
  listening = true;
  addEventListener("scroll", nudgeAll, { capture: true, passive: true });
  addEventListener("resize", nudgeAll, { passive: true });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", restyleAll);
  new MutationObserver(restyleAll).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (Renderer.shared) Renderer.shared.onRestore = restyleAll;
}

export class GlassSurface {
  private context: CanvasRenderingContext2D;
  private shapes = new Map<HTMLElement, Shape>();
  private resize = new ResizeObserver(() => this.restyle());
  private visibility = new IntersectionObserver(([entry]) => {
    this.visible = entry.isIntersecting;
    if (this.visible) this.invalidate();
  });
  private visible = true;
  private forced = true;
  private moved = false;
  private live = false;
  private connected = false;
  private signature = "";
  private material = resolveMaterial();
  private interaction: Interaction = interactions.none;
  private tint: readonly [number, number, number] = [1, 1, 1];
  private appear = new Spring(1, 120, 15);
  private settle: (() => void) | null = null;
  private boxes = new Float32Array(maxShapes * 4);
  private radii = new Float32Array(maxShapes);

  constructor(private host: HTMLElement, private canvas: HTMLCanvasElement, private options: GlassOptions = {}, private group = false) {
    this.context = canvas.getContext("2d")!;
  }

  connect() {
    listen();
    if (!Renderer.shared) {
      this.fallBack();
      return;
    }
    this.host.dataset.engine = "webgl";
    this.connected = true;
    surfaces.add(this);
    this.visibility.observe(this.host);
    if (!this.group) this.track(this.host);
    if (this.options.appear) {
      this.appear.value = 0;
      this.appear.target = 1;
    }
    this.restyle();
  }

  disconnect() {
    this.connected = false;
    surfaces.delete(this);
    this.resize.disconnect();
    this.visibility.disconnect();
    for (const shape of this.shapes.values()) shape.detach();
    this.shapes.clear();
  }

  track(element: HTMLElement) {
    if (this.shapes.has(element) || this.shapes.size >= maxShapes) return;
    const shape = new Shape(element, wake);
    shape.attach();
    this.shapes.set(element, shape);
    this.resize.observe(element);
    element.dataset.engine = this.host.dataset.engine ?? "webgl";
    if (this.connected) this.restyle();
  }

  untrack(element: HTMLElement) {
    this.shapes.get(element)?.detach();
    this.shapes.delete(element);
    this.resize.unobserve(element);
    this.invalidate();
  }

  set(options: GlassOptions) {
    this.options = { ...this.options, ...options };
    if (this.connected) this.restyle();
  }

  show() {
    return this.fade(1);
  }

  hide() {
    return this.fade(0);
  }

  private fade(target: number) {
    this.appear.target = target;
    this.invalidate();
    return new Promise<void>((resolve) => {
      this.settle = resolve;
    });
  }

  invalidate() {
    this.forced = true;
    wake();
  }

  nudge() {
    this.moved = true;
    wake();
  }

  restyle() {
    const style = getComputedStyle(this.host);
    const tokens: Partial<Material> = {};
    for (const key of numericKeys) {
      const value = style.getPropertyValue(`--glass-${kebab(key)}`);
      if (value) tokens[key] = parseFloat(value);
    }
    const tint = style.getPropertyValue("--glass-tint").trim();
    if (tint) tokens.tint = tint;
    const { material = "regular", interaction = this.group ? "lively" : "none" } = this.options;
    this.material = typeof material === "string"
      ? resolveMaterial(presets[material] ?? presets.regular, tokens)
      : resolveMaterial(tokens, material);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.interaction = reduced ? interactions.none : typeof interaction === "string" ? (interactions[interaction] ?? interactions.none) : interaction;
    this.tint = resolveTint(this.material.tint);
    for (const shape of this.shapes.values()) {
      const { element } = shape;
      shape.radius = cornerRadius(getComputedStyle(element).borderTopLeftRadius, element.offsetWidth, element.offsetHeight);
    }
    this.invalidate();
  }

  private get moving() {
    if (!this.appear.settled) return true;
    for (const shape of this.shapes.values()) if (shape.moving || shape.pressed) return true;
    return false;
  }

  update(dt: number) {
    const animate = this.interaction !== interactions.none;
    if (!this.visible) return false;
    if (!this.forced && !this.moved && !this.live && !this.moving) return false;

    const rect = this.host.getBoundingClientRect();
    const grow = this.signature !== "";
    for (const shape of this.shapes.values()) {
      shape.read(shape.element.getBoundingClientRect(), this.moved, animate, grow);
      if (animate) shape.step(dt);
    }
    if (animate) this.appear.step(dt);
    else this.appear.snap(this.appear.target);
    this.host.style.setProperty("--glass-appear", this.appear.value.toFixed(3));
    if (this.appear.settled && this.settle) {
      this.settle();
      this.settle = null;
    }

    const list = this.layout();
    if (!list.length) return false;
    const backdrop = resolveBackdrop(this.host, rect, this.options.source ?? "auto", () => this.invalidate());
    if (!backdrop) return this.moving;
    this.live = this.options.live ?? (backdrop.live && backdrop.image instanceof HTMLVideoElement);

    const moving = this.moving;
    const signature = `${rect.left},${rect.top},${rect.width},${rect.height},${backdrop.map.x},${backdrop.map.y},${backdrop.map.w},${backdrop.map.h}`;
    const skip = !this.forced && !moving && !this.live && signature === this.signature;
    this.moved = false;
    if (skip) return false;

    try {
      this.paint(backdrop, rect, list);
    } catch (error) {
      console.warn("@edinstvo/glass: can't read this backdrop, falling back to CSS.", error);
      this.fallBack();
      return false;
    }
    this.forced = false;
    this.signature = signature;
    return moving || this.live;
  }

  private layout() {
    const scale = 0.84 + 0.16 * this.appear.value;
    const list: ShapeBox[] = [];
    for (const shape of this.shapes.values()) {
      const box = shape.box(this.interaction, scale);
      if (box.halfW > 0.5 && box.halfH > 0.5) list.push(box);
    }
    return list;
  }

  private active() {
    let best: Shape | null = null;
    for (const shape of this.shapes.values()) {
      if (!best || Math.abs(shape.pointerX.value) + Math.abs(shape.pointerY.value) + shape.glow.value > Math.abs(best.pointerX.value) + Math.abs(best.pointerY.value) + best.glow.value) best = shape;
    }
    return best;
  }

  private paint(backdrop: Backdrop, rect: DOMRect, list: ShapeBox[]) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const left = Math.floor(Math.min(...list.map((b) => b.x - b.halfW))) - pad;
    const top = Math.floor(Math.min(...list.map((b) => b.y - b.halfH))) - pad;
    const right = Math.ceil(Math.max(...list.map((b) => b.x + b.halfW))) + pad;
    const bottom = Math.ceil(Math.max(...list.map((b) => b.y + b.halfH))) + pad;
    const canvasW = Math.round((right - left) * dpr);
    const canvasH = Math.round((bottom - top) * dpr);
    if (this.canvas.width !== canvasW || this.canvas.height !== canvasH) {
      this.canvas.width = canvasW;
      this.canvas.height = canvasH;
    }
    Object.assign(this.canvas.style, {
      left: `${left - rect.left}px`,
      top: `${top - rect.top}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
    });

    let peak = Infinity;
    list.forEach((box, index) => {
      this.boxes.set([(box.x - left) * dpr, (box.y - top) * dpr, box.halfW * dpr, box.halfH * dpr], index * 4);
      this.radii[index] = box.radius * dpr;
      peak = Math.min(peak, softPeak(box.halfW, box.halfH, box.radius) * dpr);
    });

    const shape = this.active();
    const follow = this.interaction.follow;
    const [baseX, baseY] = lightVector(this.material.lightAngle);
    const x = baseX + (shape?.pointerX.value ?? 0) * follow;
    const y = baseY + (shape?.pointerY.value ?? 0) * follow;
    const length = Math.hypot(x, y) || 1;
    const strength = (shape?.glow.value ?? 0) * Math.min(this.interaction.press, 1);
    const { origin, perPixel } = uvTransform({ left, top }, backdrop.map, 1, 1, dpr);

    Renderer.shared!.draw({
      target: this.context,
      backdrop,
      width: canvasW,
      height: canvasH,
      pad: pad * dpr,
      boxes: this.boxes,
      radii: this.radii,
      count: list.length,
      merge: (this.options.merge ?? 0) * dpr,
      peak: Math.max(peak, 1),
      appear: Math.max(this.appear.value, 0),
      touch: [((shape?.touchX ?? 0) - left) * dpr, ((shape?.touchY ?? 0) - top) * dpr, strength],
      dpr,
      uvOrigin: origin,
      uvPerPixel: perPixel,
      lightDir: [x / length, y / length],
      tint: this.tint,
      material: this.material,
    });
  }

  private fallBack() {
    this.host.dataset.engine = "css";
    for (const element of this.shapes.keys()) element.dataset.engine = "css";
    this.canvas.hidden = true;
    surfaces.delete(this);
  }
}

export function placeCanvas(canvas: HTMLCanvasElement) {
  Object.assign(canvas.style, { position: "absolute", pointerEvents: "none", zIndex: "0" });
}

export function attachGlass(host: HTMLElement, options: GlassOptions = {}) {
  const canvas = document.createElement("canvas");
  placeCanvas(canvas);
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.style.isolation = "isolate";
  host.prepend(canvas);
  const surface = new GlassSurface(host, canvas, options);
  surface.connect();
  return {
    set: (next: GlassOptions) => surface.set(next),
    invalidate: () => surface.invalidate(),
    show: () => surface.show(),
    hide: () => surface.hide(),
    destroy: () => {
      surface.disconnect();
      canvas.remove();
    },
  };
}
