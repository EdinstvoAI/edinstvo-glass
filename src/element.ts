import type { GlassSource } from "./backdrop.js";
import { motionKeys } from "./interaction.js";
import { type Material, kebab, numericKeys } from "./material.js";
import { GlassSurface, placeCanvas } from "./surface.js";

const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

const css = `
:host {
  display: inline-block;
  position: relative;
  isolation: isolate;
  border-radius: var(--glass-radius, 24px);
  box-shadow: var(--glass-shadow, 0 8px 32px rgb(0 0 0 / .1));
}
:host(:not([data-engine="webgl"])) {
  background: var(--glass-fallback, rgb(255 255 255 / .22));
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
  backdrop-filter: blur(16px) saturate(1.6);
}
:host([data-grouped]) {
  box-shadow: none;
  background: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
:host([data-grouped]) > canvas {
  display: none;
}
:host([data-glass-group]) {
  display: block;
  box-shadow: none;
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
}
`;

const materialAttributes = new Map(numericKeys.map((key) => [kebab(key), key]));

export class EdinstvoGlass extends Base {
  static observedAttributes = ["source", "live", "tint", "appear", ...motionKeys, ...materialAttributes.keys()];

  protected surface: GlassSurface;
  private group: EdinstvoGlassGroup | null = null;
  private sourceValue: GlassSource | undefined;
  private materialValue: Partial<Material> | undefined;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("part", "glass");
    placeCanvas(canvas);
    const content = document.createElement("span");
    content.className = "content";
    content.setAttribute("part", "content");
    content.append(document.createElement("slot"));
    root.append(style, canvas, content);
    this.surface = new GlassSurface(this, canvas, {}, this.isGroup);
  }

  protected get isGroup() {
    return false;
  }

  connectedCallback() {
    this.group = this.parentElement?.closest<EdinstvoGlassGroup>("[data-glass-group]") ?? null;
    if (this.group) {
      this.dataset.grouped = "";
      this.group.adopt(this);
      return;
    }
    this.sync();
    this.surface.connect();
  }

  disconnectedCallback() {
    if (this.group) {
      this.group.release(this);
      this.group = null;
      delete this.dataset.grouped;
      return;
    }
    this.surface.disconnect();
  }

  show() {
    return this.surface.show();
  }

  hide() {
    return this.surface.hide();
  }

  attributeChangedCallback() {
    if (this.group) this.group.refresh();
    else if (this.isConnected) this.sync();
  }

  get source() {
    return this.sourceValue ?? this.getAttribute("source") ?? "auto";
  }

  set source(value: GlassSource) {
    this.sourceValue = value;
    this.sync();
  }

  get material(): Partial<Material> {
    return this.materialValue ?? {};
  }

  set material(value: Partial<Material>) {
    this.materialValue = value;
    this.sync();
  }

  invalidate() {
    this.surface.invalidate();
  }

  protected sync() {
    const live = this.getAttribute("live");
    this.surface.set({
      material: this.composeMaterial(),
      source: this.source,
      live: live === null ? undefined : live !== "false",
      appear: this.hasAttribute("appear"),
    });
  }

  private composeMaterial(): Partial<Material> {
    const overrides: Partial<Material> = {};
    for (const [attribute, key] of materialAttributes) {
      const value = this.getAttribute(attribute);
      if (value !== null) overrides[key] = parseFloat(value);
    }
    const tint = this.getAttribute("tint");
    if (tint) overrides.tint = tint;
    return { ...this.material, ...overrides };
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
