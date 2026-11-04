import type { GlassSource } from "./backdrop.js";
import type { Interaction, InteractionName } from "./interaction.js";
import { type Material, type PresetName, kebab, numericKeys, presets } from "./material.js";
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
.content {
  display: block;
  position: relative;
  z-index: 1;
  border-radius: inherit;
}
`;

const materialAttributes = new Map(numericKeys.map((key) => [kebab(key), key]));

export class EdinstvoGlass extends Base {
  static observedAttributes = ["material", "interaction", "source", "live", "tint", ...materialAttributes.keys()];

  private surface: GlassSurface;
  private sourceValue: GlassSource | undefined;
  private materialValue: PresetName | Partial<Material> | undefined;
  private interactionValue: InteractionName | Interaction | undefined;

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
    this.surface = new GlassSurface(this, canvas);
  }

  connectedCallback() {
    this.sync();
    this.surface.connect();
  }

  disconnectedCallback() {
    this.surface.disconnect();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.sync();
  }

  get source() {
    return this.sourceValue ?? this.getAttribute("source") ?? "auto";
  }

  set source(value: GlassSource) {
    this.sourceValue = value;
    this.sync();
  }

  get material(): PresetName | Partial<Material> {
    return this.materialValue ?? ((this.getAttribute("material") ?? "regular") as PresetName);
  }

  set material(value: PresetName | Partial<Material>) {
    this.materialValue = value;
    this.sync();
  }

  get interaction(): InteractionName | Interaction {
    return this.interactionValue ?? ((this.getAttribute("interaction") ?? "none") as InteractionName);
  }

  set interaction(value: InteractionName | Interaction) {
    this.interactionValue = value;
    this.sync();
  }

  invalidate() {
    this.surface.invalidate();
  }

  private sync() {
    const live = this.getAttribute("live");
    this.surface.set({
      material: this.composeMaterial(),
      interaction: this.interaction,
      source: this.source,
      live: live === null ? undefined : live !== "false",
    });
  }

  private composeMaterial(): PresetName | Partial<Material> {
    const overrides: Partial<Material> = {};
    for (const [attribute, key] of materialAttributes) {
      const value = this.getAttribute(attribute);
      if (value !== null) overrides[key] = parseFloat(value);
    }
    const tint = this.getAttribute("tint");
    if (tint) overrides.tint = tint;
    if (!Object.keys(overrides).length) return this.material;
    const base = this.material;
    return typeof base === "string" ? { ...presetOf(base), ...overrides } : { ...base, ...overrides };
  }
}

const presetOf = (name: PresetName) => presets[name] ?? presets.regular;

export function defineGlass(tag = "edinstvo-glass") {
  if (!customElements.get(tag)) customElements.define(tag, class extends EdinstvoGlass {});
}
