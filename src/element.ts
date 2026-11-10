import type { GlassSource } from "./backdrop.js";
import { motionKeys } from "./interaction.js";
import { type MaterialLayer, kebab, numericKeys, readValue, stackLayers } from "./material.js";
import { GlassSurface, placeCanvas, readMotion } from "./surface.js";
import { readGeometry, resolveGeometry, type GeometryLayer } from "./geometry.js";

const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

const css = `
:host {
  display: inline-block;
  position: relative;
  isolation: isolate;
  border-radius: var(--glass-radius, 24px);
}
.shade {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  box-shadow: var(--glass-shadow, 0 8px 32px rgb(0 0 0 / .1));
  pointer-events: none;
}
:host([data-grouped]) .shade,
:host([data-glass-group]) .shade {
  display: none;
}
:host(:not([data-engine="webgl"])) {
  background: var(--glass-fallback, rgb(255 255 255 / .22));
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
  backdrop-filter: blur(16px) saturate(1.6);
}
:host([data-grouped]) {
  background: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
:host([data-grouped]) > canvas {
  display: none;
}
:host([data-glass-group]) {
  display: block;
  border-radius: 0;
  background: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
.content {
  display: block;
  position: relative;
  z-index: 1;
  border-radius: inherit;
  scale: var(--glass-scale, 1);
  opacity: var(--glass-appear, 1);
  color: var(--glass-foreground, inherit);
}
@media (forced-colors: active) {
  :host { background: Canvas; border: 1px solid CanvasText; }
  canvas, .shade { display: none; }
  .content { color: CanvasText; }
}
`;

const materialAttributes = new Map(numericKeys.map((key) => [kebab(key), key]));

export class EdinstvoGlass extends Base {
  static observedAttributes = ["source", "live", "tint", "light-color", "adaptation", "foreground", "dispersion-mode", "shape", "curvature", "path", "view-box", "fill-rule", "appear", "layer", ...motionKeys, ...materialAttributes.keys()];

  protected surface: GlassSurface;
  private group: EdinstvoGlassGroup | null = null;
  private parentGroup: EdinstvoGlassGroup | null = null;
  private standing = false;
  private ready = false;
  private sourceValue: GlassSource | undefined;
  private materialValue: MaterialLayer | undefined;
  private geometryValue: GeometryLayer | undefined;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("part", "glass");
    placeCanvas(canvas);
    const shade = document.createElement("i");
    shade.className = "shade";
    const content = document.createElement("span");
    content.className = "content";
    content.setAttribute("part", "content");
    content.append(document.createElement("slot"));
    root.append(style, shade, canvas, content);
    this.surface = new GlassSurface(this, canvas, {}, this.isGroup);
  }

  protected get isGroup() {
    return false;
  }

  connectedCallback() {
    this.parentGroup = this.parentElement?.closest<EdinstvoGlassGroup>("[data-glass-group]") ?? null;
    this.ready = true;
    this.place();
  }

  disconnectedCallback() {
    this.ready = false;
    if (this.group) this.leave();
    if (this.standing) this.surface.disconnect();
    this.standing = false;
  }

  private leave() {
    this.group?.release(this);
    this.group = null;
    delete this.dataset.grouped;
  }

  place() {
    const parent = this.parentGroup;
    const reach = parent ? parseFloat(this.getAttribute("merge") ?? parent.getAttribute("merge") ?? "0") : 0;
    if (parent && reach > 0) {
      if (this.standing) this.surface.disconnect();
      this.standing = false;
      if (!this.group) {
        this.dataset.grouped = "";
        parent.adopt(this);
        this.group = parent;
      }
      parent.refresh();
      return;
    }
    if (this.group) this.leave();
    this.sync();
    if (!this.standing) this.surface.connect();
    this.standing = true;
  }

  show() {
    return this.surface.show();
  }

  hide() {
    return this.surface.hide();
  }

  attributeChangedCallback() {
    if (this.ready) this.place();
  }

  get source() {
    return this.sourceValue ?? this.getAttribute("source") ?? "auto";
  }

  set source(value: GlassSource) {
    this.sourceValue = value;
    this.sync();
  }

  get material(): MaterialLayer {
    return this.materialValue ?? {};
  }

  get geometry(): GeometryLayer { return this.geometryValue ?? {}; }
  set geometry(value: GeometryLayer) {
    resolveGeometry(value);
    this.geometryValue = { ...value, ...(value.viewBox ? { viewBox: [...value.viewBox] as [number, number, number, number] } : {}) };
    if (this.ready) this.place();
  }

  set material(value: MaterialLayer) {
    this.materialValue = value;
    this.sync();
  }

  invalidate() {
    this.surface.invalidate();
  }

  protected sync() {
    const live = this.getAttribute("live");
    const layer = this.getAttribute("layer");
    if (layer !== null) this.style.zIndex = layer;
    this.surface.set({
      material: this.composeMaterial(),
      geometry: readGeometry(this),
      motion: this.parentGroup ? readMotion(this.parentGroup) : undefined,
      source: this.source,
      live: live === null ? undefined : live !== "false",
      appear: this.hasAttribute("appear"),
    });
  }

  composeMaterial(): MaterialLayer {
    const overrides: Record<string, unknown> = {};
    for (const [attribute, key] of materialAttributes) {
      const value = this.getAttribute(attribute);
      if (value !== null) overrides[key] = readValue(key, value);
    }
    const tint = this.getAttribute("tint");
    if (tint) overrides.tint = tint;
    const color = this.getAttribute("light-color");
    if (color) overrides.lightColor = color;
    for (const key of ["adaptation", "foreground", "dispersionMode"] as const) {
      const value = this.getAttribute(kebab(key));
      if (value) overrides[key] = value;
    }
    return stackLayers(this.parentGroup?.composeMaterial(), this.material, overrides);
  }
}

export class EdinstvoGlassGroup extends EdinstvoGlass {
  protected get isGroup() {
    return true;
  }

  connectedCallback() {
    this.dataset.glassGroup = "";
    super.connectedCallback();
  }

  place() {
    super.place();
    for (const child of this.querySelectorAll<EdinstvoGlass>("[data-engine]")) {
      if (child instanceof EdinstvoGlass) child.place();
    }
  }

  adopt(child: EdinstvoGlass) {
    this.surface.track(child);
  }

  release(child: EdinstvoGlass) {
    this.surface.untrack(child);
  }

  refresh() {
    this.surface.restyle();
  }
}

export function defineGlass(tag = "edinstvo-glass") {
  if (!customElements.get(`${tag}-group`)) customElements.define(`${tag}-group`, class extends EdinstvoGlassGroup {});
  if (!customElements.get(tag)) customElements.define(tag, class extends EdinstvoGlass {});
}
