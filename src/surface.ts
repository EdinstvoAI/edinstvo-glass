import { type Backdrop, type GlassSource, resolveBackdrop } from "./backdrop.js";
import { resolveTint } from "./color.js";
import { cornerRadius, lightVector, uvTransform } from "./geometry.js";
import { type Interaction, type InteractionName, Motion, interactions } from "./interaction.js";
import { type Material, type PresetName, kebab, numericKeys, presets, resolveMaterial } from "./material.js";
import { Renderer } from "./renderer.js";

export interface GlassOptions {
  material?: PresetName | Partial<Material>;
  interaction?: InteractionName | Interaction;
  source?: GlassSource;
  live?: boolean;
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
  private motion: Motion;
  private resize = new ResizeObserver(() => this.restyle());
  private visibility = new IntersectionObserver(([entry]) => {
    this.visible = entry.isIntersecting;
    if (this.visible) this.invalidate();
  });
  private visible = true;
  private forced = true;
  private moved = false;
  private signature = "";
  private live = false;
  private options: GlassOptions;
  private material = resolveMaterial();
  private interaction: Interaction = interactions.none;
  private tint: readonly [number, number, number] = [1, 1, 1];
  private radius = 0;

  constructor(private host: HTMLElement, private canvas: HTMLCanvasElement, options: GlassOptions = {}) {
    this.context = canvas.getContext("2d")!;
    this.motion = new Motion(host, wake);
    this.options = options;
  }

  connect() {
    listen();
    if (!Renderer.shared) {
      this.fallBack();
      return;
    }
    this.host.dataset.engine = "webgl";
    surfaces.add(this);
    this.resize.observe(this.host);
    this.visibility.observe(this.host);
    this.motion.attach();
    this.restyle();
  }

  disconnect() {
    surfaces.delete(this);
    this.resize.disconnect();
    this.visibility.disconnect();
    this.motion.detach();
  }

  set(options: GlassOptions) {
    this.options = { ...this.options, ...options };
    this.restyle();
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
    const { material = "regular", interaction = "none" } = this.options;
    this.material = typeof material === "string"
      ? resolveMaterial(presets[material] ?? presets.regular, tokens)
      : resolveMaterial(tokens, material);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.interaction = reduced ? interactions.none : typeof interaction === "string" ? (interactions[interaction] ?? interactions.none) : interaction;
    this.tint = resolveTint(this.material.tint);
    this.radius = cornerRadius(style.borderTopLeftRadius, this.host.offsetWidth, this.host.offsetHeight);
    this.invalidate();
  }

  update(dt: number) {
    const { motion, interaction } = this;
    const moving = motion.moving;
    if (moving) motion.step(dt, interaction);
    if (!this.visible) return moving;
    const width = this.host.offsetWidth;
    const height = this.host.offsetHeight;
    if (!width || !height) return moving;

    if (!this.forced && !this.moved && !moving && !this.live) return false;

    const rect = this.host.getBoundingClientRect();
    const backdrop = resolveBackdrop(this.host, rect, this.options.source ?? "auto", () => this.invalidate());
    if (!backdrop) return moving;
    this.live = this.options.live ?? (backdrop.live && backdrop.image instanceof HTMLVideoElement);
    const signature = `${rect.left},${rect.top},${rect.width},${rect.height},${backdrop.map.x},${backdrop.map.y},${backdrop.map.w},${backdrop.map.h}`;
    const skip = !this.forced && !moving && !this.live && signature === this.signature;
    this.moved = false;
    if (skip) return false;

    try {
      this.paint(backdrop, rect, width, height);
    } catch (error) {
      console.warn("@edinstvo/glass: can't read this backdrop, falling back to CSS.", error);
      this.fallBack();
      return false;
    }
    this.forced = false;
    this.signature = signature;
    return moving || motion.moving || this.live;
  }

  private paint(backdrop: Backdrop, rect: DOMRect, width: number, height: number) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const canvasW = Math.round((width + pad * 2) * dpr);
    const canvasH = Math.round((height + pad * 2) * dpr);
    if (this.canvas.width !== canvasW || this.canvas.height !== canvasH) {
      this.canvas.width = canvasW;
      this.canvas.height = canvasH;
    }
    const { origin, perPixel } = uvTransform(rect, backdrop.map, rect.width / width, rect.height / height, dpr);
    const [baseX, baseY] = lightVector(this.material.lightAngle);
    const follow = this.interaction.follow;
    const x = baseX + this.motion.x.value * follow;
    const y = baseY + this.motion.y.value * follow;
    const length = Math.hypot(x, y) || 1;
    Renderer.shared!.draw({
      target: this.context,
      backdrop,
      width: canvasW,
      height: canvasH,
      pad: pad * dpr,
      size: [width * dpr, height * dpr],
      radius: this.radius * dpr,
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
    this.canvas.hidden = true;
    surfaces.delete(this);
  }
}

export function placeCanvas(canvas: HTMLCanvasElement) {
  Object.assign(canvas.style, {
    position: "absolute",
    inset: `-${pad}px`,
    width: `calc(100% + ${pad * 2}px)`,
    height: `calc(100% + ${pad * 2}px)`,
    pointerEvents: "none",
    zIndex: "0",
  });
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
    destroy: () => {
      surface.disconnect();
      canvas.remove();
    },
  };
}
