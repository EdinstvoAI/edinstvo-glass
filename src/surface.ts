import { type Backdrop, type GlassSource, resolveBackdrop } from "./backdrop.js";
import { resolveTint, prefersDark } from "./color.js";
import { BackdropAnalyzer, adaptiveMaterial, type BackdropAnalysis, type Rgb } from "./adaptation.js";
import { AdaptiveTransition, type AdaptiveAppearance } from "./adaptive-transition.js";
import { cornerRadius, lightVector, softPeak, uvTransform, readGeometry, shapeCodes, type GeometryLayer } from "./geometry.js";
import { GeometryAtlas } from "./distance-field.js";
import { type Motion, Shape, type ShapeBox, Spring, motionKeys, resolveMotion, still } from "./interaction.js";
import { type Material, type MaterialLayer, type SceneLight, kebab, numericKeys, readValue, resolveMaterial, sceneLayer, stackLayers } from "./material.js";
import { Renderer, maxShapes } from "./renderer.js";

export interface GlassOptions {
  material?: MaterialLayer;
  motion?: Partial<Motion>;
  source?: GlassSource;
  live?: boolean;
  appear?: boolean;
  geometry?: GeometryLayer;
}

const pad = 32;
const surfaces = new Set<GlassSurface>();
let scene: MaterialLayer = {};
let sceneMaterial: MaterialLayer = {};
export function getSceneMaterial() { return resolveMaterial(sceneMaterial, scene); }

export function setSceneMaterial(material: MaterialLayer | null) {
  sceneMaterial = material ? { ...material } : {};
  for (const surface of surfaces) surface.restyle();
}

export function setSceneLight(light: SceneLight | null) {
  scene = light ? stackLayers(scene, sceneLayer(light)) : {};
  for (const surface of surfaces) {
    surface.restyle();
    surface.invalidate();
  }
}
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

export function readMotion(element: HTMLElement) {
  const style = getComputedStyle(element);
  const motion: Partial<Motion> = {};
  for (const key of motionKeys) {
    const value = element.getAttribute(key) ?? style.getPropertyValue(`--glass-${key}`);
    if (value) motion[key] = parseFloat(value);
  }
  return motion;
}

interface Frame { left: number; top: number; right: number; bottom: number }

const overlap = (a: Frame, b: Frame) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

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
  for (const query of ["(prefers-contrast: more)", "(prefers-reduced-transparency: reduce)", "(forced-colors: active)"]) matchMedia(query).addEventListener("change", restyleAll);
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
  private lightColor: readonly [number, number, number] = [1, 1, 1];
  private reduced = false;
  private frame: Frame | null = null;
  private stack: HTMLCanvasElement | null = null;
  private tint: readonly [number, number, number] = [1, 1, 1];
  private appear = new Spring(1, 120, 15);
  private settle: (() => void) | null = null;
  private boxes = new Float32Array(maxShapes * 4);
  private forms = new Float32Array(maxShapes * 4);
  private geometryAtlas: GeometryAtlas | null = null;
  private layer = 0;
  private analyzer: BackdropAnalyzer | null = null;
  private moreContrast = false;
  private reduceTransparency = false;
  private forcedColors = false;
  private adaptationTransition: AdaptiveTransition | null = null;
  private adaptationTarget: { base: Material; analysis: BackdropAnalysis; value: ReturnType<typeof adaptiveMaterial> } | null = null;
  private naturalForeground: Rgb | null = null;

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
    this.adaptationTransition = null; this.adaptationTarget = null; this.naturalForeground = null;
    delete this.host.dataset.glassAdapting;
    this.analyzer?.destroy(); this.analyzer = null;
    this.host.style.removeProperty("--glass-foreground");
    delete this.host.dataset.glassContrast;
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
    const tokens: Record<string, unknown> = {};
    for (const key of numericKeys) {
      const value = style.getPropertyValue(`--glass-${kebab(key)}`);
      if (value) tokens[key] = readValue(key, value);
    }
    const tint = style.getPropertyValue("--glass-tint").trim();
    if (tint) tokens.tint = tint;
    const lightColor = style.getPropertyValue("--glass-light-color").trim();
    if (lightColor) tokens.lightColor = lightColor;
    const foreground = style.getPropertyValue("--glass-text-color").trim();
    const adaptation = style.getPropertyValue("--glass-adaptation").trim();
    const dispersionMode = style.getPropertyValue("--glass-dispersion-mode").trim();
    if (foreground) tokens.foreground = foreground;
    if (adaptation) tokens.adaptation = adaptation;
    if (dispersionMode) tokens.dispersionMode = dispersionMode;
    this.material = resolveMaterial(stackLayers(sceneMaterial, scene, tokens as MaterialLayer, this.options.material));
    this.moreContrast = matchMedia("(prefers-contrast: more)").matches;
    this.reduceTransparency = matchMedia("(prefers-reduced-transparency: reduce)").matches;
    this.forcedColors = matchMedia("(forced-colors: active)").matches;
    this.canvas.hidden = this.forcedColors;
    if (this.material.adaptation === "off" || !this.material.adaptationStrength) {
      this.analyzer?.destroy(); this.analyzer = null;
      delete this.host.dataset.glassContrast;
      this.adaptationTarget = null;
      if (!this.adaptationTransition && this.material.foreground === "auto") this.host.style.removeProperty("--glass-foreground");
    }
    if (!this.adaptationTransition) {
      if (this.material.foreground !== "auto") this.host.style.setProperty("--glass-foreground", this.material.foreground);
      else if (this.material.adaptation === "tint") this.host.style.removeProperty("--glass-foreground");
    }
    this.layer = parseInt(style.zIndex) || 0;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.tint = resolveTint(this.material.tint);
    this.lightColor = resolveTint(this.material.lightColor);
    const base = resolveMotion(this.options.motion, readMotion(this.host));
    for (const shape of this.shapes.values()) {
      const { element } = shape;
      shape.motion = this.reduced ? still : element === this.host ? base : resolveMotion(base, readMotion(element));
      shape.radius = cornerRadius(getComputedStyle(element).borderTopLeftRadius, element.offsetWidth, element.offsetHeight);
      shape.geometry = readGeometry(element, this.options.geometry);
      shape.aspect = element.offsetWidth / Math.max(1, element.offsetHeight);
    }
    this.invalidate();
  }

  private get moving() {
    if (this.adaptationTransition?.moving) return true;
    if (!this.appear.settled) return true;
    for (const shape of this.shapes.values()) if (shape.moving || shape.pressed) return true;
    return false;
  }

  update(dt: number) {
    if (this.forcedColors) return false;
    if (!this.visible) return false;
    if (!this.forced && !this.moved && !this.live && !this.moving) return false;

    const rect = this.host.getBoundingClientRect();
    const grow = this.signature !== "";
    for (const shape of this.shapes.values()) {
      shape.read(shape.element.getBoundingClientRect(), this.moved, grow);
      shape.step(dt);
    }
    if (this.reduced) this.appear.snap(this.appear.target);
    else this.appear.step(dt);
    this.host.style.setProperty("--glass-appear", this.appear.value.toFixed(3));
    if (this.appear.settled && this.settle) {
      this.settle();
      this.settle = null;
    }

    const list = this.layout();
    if (!list.length) return false;
    let backdrop: Backdrop | null;
    try {
      backdrop = resolveBackdrop(this.host, rect, this.options.source ?? "auto", () => this.invalidate());
    } catch (error) {
      console.warn("@edinstvo/glass: can't read this backdrop, falling back to CSS.", error);
      this.fallBack();
      return false;
    }
    if (!backdrop) return this.moving;
    this.live = this.options.live ?? (backdrop.live && backdrop.image instanceof HTMLVideoElement);

    const moving = this.moving;
    const signature = `${rect.left},${rect.top},${rect.width},${rect.height},${backdrop.map.x},${backdrop.map.y},${backdrop.map.w},${backdrop.map.h}`;
    const skip = !this.forced && !moving && !this.live && signature === this.signature;
    this.moved = false;
    if (skip) return false;

    try {
      this.paint(backdrop, rect, list, dt);
    } catch (error) {
      console.warn("@edinstvo/glass: can't read this backdrop, falling back to CSS.", error);
      this.fallBack();
      return false;
    }
    this.forced = false;
    this.signature = signature;
    return this.moving || this.live;
  }

  private layout() {
    const scale = 0.84 + 0.16 * this.appear.value;
    const list: ShapeBox[] = [];
    for (const shape of this.shapes.values()) {
      const box = shape.box(scale);
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

  private above(other: GlassSurface) {
    if (this.layer !== other.layer) return this.layer > other.layer;
    return Boolean(other.host.compareDocumentPosition(this.host) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  private layered(backdrop: Backdrop, frame: Frame, dpr: number): Backdrop {
    const under = [...surfaces].filter((other) => other !== this && other.frame && overlap(other.frame, frame) && this.above(other));
    if (!under.length) return backdrop;
    const width = Math.round((frame.right - frame.left) * dpr);
    const height = Math.round((frame.bottom - frame.top) * dpr);
    this.stack ??= document.createElement("canvas");
    if (this.stack.width !== width || this.stack.height !== height) {
      this.stack.width = width;
      this.stack.height = height;
    }
    const context = this.stack.getContext("2d")!;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { map } = backdrop;
    context.drawImage(backdrop.image, map.x - frame.left, map.y - frame.top, map.w, map.h);
    for (const other of under) {
      const f = other.frame!;
      context.drawImage(other.canvas, f.left - frame.left, f.top - frame.top, f.right - f.left, f.bottom - f.top);
    }
    return { image: this.stack, width, height, live: true, map: { x: frame.left, y: frame.top, w: frame.right - frame.left, h: frame.bottom - frame.top } };
  }

  private paint(source: Backdrop, rect: DOMRect, list: ShapeBox[], dt: number) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const left = Math.floor(Math.min(...list.map((b) => b.x - b.halfW))) - pad;
    const top = Math.floor(Math.min(...list.map((b) => b.y - b.halfH))) - pad;
    const right = Math.ceil(Math.max(...list.map((b) => b.x + b.halfW))) + pad;
    const bottom = Math.ceil(Math.max(...list.map((b) => b.y + b.halfH))) + pad;
    const frame = { left, top, right, bottom };
    const backdrop = this.layered(source, frame, dpr);
    let material = this.material, tint = this.tint;
    const adaptive = material.adaptation !== "off" && material.adaptationStrength > 0;
    if (adaptive || this.adaptationTransition) this.naturalForeground ??= resolveTint(getComputedStyle(this.host).color);
    const baseAppearance: AdaptiveAppearance = { tint, transparency: material.transparency, frost: material.frost, foreground: material.foreground === "auto" ? this.naturalForeground ?? [0, 0, 0] : resolveTint(material.foreground) };
    let target = baseAppearance;
    if (adaptive) {
      this.analyzer ??= new BackdropAnalyzer(() => this.invalidate());
      const analysis = this.analyzer.sample(backdrop, rect, prefersDark());
      if (analysis) {
        if (this.adaptationTarget?.base !== material || this.adaptationTarget.analysis !== analysis) this.adaptationTarget = { base: material, analysis, value: adaptiveMaterial(material, analysis, tint, material.foreground === "auto" ? null : resolveTint(material.foreground), this.moreContrast, this.reduceTransparency) };
        const result = this.adaptationTarget.value;
        target = { tint: result.tint, transparency: result.material.transparency, frost: result.material.frost, foreground: material.adaptation === "tint" ? baseAppearance.foreground : result.foreground };
        this.host.dataset.glassContrast = result.contrast.toFixed(2);
      }
    }
    if (adaptive) this.adaptationTransition ??= new AdaptiveTransition(baseAppearance);
    if (this.adaptationTransition) {
      const value = this.adaptationTransition.step(target, dt, this.reduced ? 0 : material.adaptationDuration);
      tint = value.tint;
      material = { ...material, transparency: value.transparency, frost: value.frost };
      this.host.style.setProperty("--glass-foreground", `rgb(${value.foreground.map(c => Math.round(c * 255)).join(" ")})`);
      this.host.toggleAttribute("data-glass-adapting", this.adaptationTransition.moving);
      if (!adaptive && !this.adaptationTransition.moving) {
        this.adaptationTransition = null; this.naturalForeground = null;
        if (material.foreground === "auto") this.host.style.removeProperty("--glass-foreground");
      }
    }
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

    const shade = this.host.shadowRoot?.querySelector<HTMLElement>(".shade");
    if (shade && list.length === 1) {
      const [box] = list;
      shade.hidden = box.geometry.shape === "path" || box.geometry.shape === "superellipse";
      shade.style.borderRadius = box.geometry.shape === "circle" || box.geometry.shape === "ellipse" ? "50%" : "";
      Object.assign(shade.style, {
        inset: "auto",
        left: `${box.x - box.halfW - rect.left}px`,
        top: `${box.y - box.halfH - rect.top}px`,
        width: `${box.halfW * 2}px`,
        height: `${box.halfH * 2}px`,
      });
      if (box.geometry.shape === "circle") {
        const half = Math.min(box.halfW, box.halfH);
        Object.assign(shade.style, { left: `${box.x - half - rect.left}px`, top: `${box.y - half - rect.top}px`, width: `${half * 2}px`, height: `${half * 2}px` });
      }
    }

    let peak = Infinity;
    list.forEach((box, index) => {
      this.boxes.set([(box.x - left) * dpr, (box.y - top) * dpr, box.halfW * dpr, box.halfH * dpr], index * 4);
      const geometry = box.geometry;
      this.forms.set([box.radius * dpr, box.join * dpr, shapeCodes[geometry.shape], geometry.shape === "path" ? box.aspect : geometry.curvature], index * 4);
      peak = Math.min(peak, (geometry.shape === "rounded-rect" ? softPeak(box.halfW, box.halfH, box.radius) : Math.min(box.halfW, box.halfH)) * dpr);
    });
    const paths = list.some(box => box.geometry.shape === "path") ? (this.geometryAtlas ??= new GeometryAtlas()).update(list) : undefined;

    const shape = this.active();
    const follow = shape?.motion.follow ?? 0;
    const [baseX, baseY] = lightVector(this.material.lightAngle);
    const x = baseX + (shape?.pointerX.value ?? 0) * follow;
    const y = baseY + (shape?.pointerY.value ?? 0) * follow;
    const length = Math.hypot(x, y) || 1;
    const strength = (shape?.glow.value ?? 0) * (shape?.motion.glow ?? 0) * 2;
    const { origin, perPixel } = uvTransform({ left, top }, backdrop.map, 1, 1, dpr);

    Renderer.shared!.draw({
      target: this.context,
      backdrop,
      width: canvasW,
      height: canvasH,
      pad: pad * dpr,
      boxes: this.boxes,
      forms: this.forms,
      paths,
      count: list.length,
      peak: Math.max(peak, 1),
      appear: Math.max(this.appear.value, 0),
      touch: [((shape?.touchX ?? 0) - left) * dpr, ((shape?.touchY ?? 0) - top) * dpr, strength],
      dpr,
      uvOrigin: origin,
      uvPerPixel: perPixel,
      lightDir: [x / length, y / length],
      tint,
      lightColor: this.lightColor,
      material,
    });
    this.frame = frame;
    for (const other of surfaces) {
      if (other !== this && other.frame && overlap(other.frame, frame) && other.above(this)) other.invalidate();
    }
  }

  private fallBack() {
    this.analyzer?.destroy(); this.analyzer = null;
    this.adaptationTransition = null; this.adaptationTarget = null; this.naturalForeground = null;
    delete this.host.dataset.glassAdapting;
    delete this.host.dataset.glassContrast;
    if (this.material.foreground === "auto") this.host.style.removeProperty("--glass-foreground");
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
