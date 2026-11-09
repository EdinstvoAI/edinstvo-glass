import { defaults, ranges, motionDefaults, motionRanges, resolveMaterial, resolveMotion } from "/dist/index.js";

export function inspectScene(root, controls) {
  let selected;
  const title = document.createElement("strong");
  const note = document.createElement("p");
  const editGroup = document.createElement("button");
  const rotateLabel = document.createElement("label");
  rotateLabel.className = "inspector-heading";
  const rotate = Object.assign(document.createElement("input"), { type: "checkbox" });
  rotateLabel.append(rotate, " Drag to rotate");
  const resetRotation = document.createElement("button");
  resetRotation.className = "inspector-heading";
  resetRotation.textContent = "Reset rotation";
  title.setAttribute("aria-live", "polite");
  title.className = note.className = editGroup.className = "inspector-heading";
  editGroup.textContent = "Edit group material";
  controls.append(title, note, editGroup, rotateLabel, resetRotation);
  const inputs = new Map();
  const kebab = key => key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
  const isMotion = key => key in motionRanges;
  const grouped = () => selected?.hasAttribute("data-grouped");
  const parentGroup = () => selected?.parentElement.closest("edinstvo-glass-group");

  function values() {
    const chain = [];
    for (let el = selected; el; el = el.parentElement) {
      if (!el.matches("edinstvo-glass, edinstvo-glass-group")) continue;
      const style = getComputedStyle(el);
      const material = { ...el.material }, motion = {};
      for (const key of Object.keys(ranges)) {
        const raw = el.getAttribute(kebab(key)) ?? style.getPropertyValue(`--glass-${kebab(key)}`).trim();
        if (!raw) continue;
        material[key] = raw === "inherit" || raw === "default" ? raw : raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
      }
      for (const key of Object.keys(motionRanges)) {
        const raw = el.getAttribute(key);
        if (raw !== null) motion[key] = Number(raw);
      }
      chain.unshift({ material, motion });
    }
    return { ...resolveMaterial(...chain.map(layer => layer.material)), ...resolveMotion(...chain.map(layer => layer.motion)) };
  }

  function refresh() {
    if (!selected) return;
    const current = values();
    title.textContent = `Editing: ${selected.getAttribute("aria-label")}`;
    note.textContent = grouped() ? "Merged shapes share a material. Motion settings apply to this shape." : "Click a glass element to edit it.";
    editGroup.hidden = !grouped();
    rotate.checked = selected.hasAttribute("rotatable") && selected.getAttribute("rotatable") !== "false";
    rotate.disabled = grouped();
    resetRotation.disabled = grouped();
    for (const [key, { input, output }] of inputs) {
      input.value = current[key] ?? defaults[key] ?? motionDefaults[key];
      output.value = Number(input.value).toFixed(2);
      input.disabled = grouped() && !isMotion(key);
    }
  }

  function select(element) {
    selected?.removeAttribute("data-selected");
    selected = element;
    selected.setAttribute("data-selected", "");
    refresh();
  }

  for (const [key, [min, max]] of Object.entries({ ...ranges, ...motionRanges })) {
    const label = document.createElement("label");
    label.textContent = key;
    const input = Object.assign(document.createElement("input"), { id: `setting-${key}`, type: "range", min, max, step: max > 1 ? 1 : 0.01 });
    label.htmlFor = input.id;
    const output = document.createElement("output");
    output.htmlFor = input.id;
    input.addEventListener("input", () => {
      output.value = Number(input.value).toFixed(2);
      selected.setAttribute(kebab(key), input.value);
      refresh();
    });
    controls.append(label, input, output);
    inputs.set(key, { input, output });
  }
  for (const [index, element] of [...root.querySelectorAll("edinstvo-glass, edinstvo-glass-group")].entries()) {
    element.tabIndex = 0;
    element.setAttribute("aria-label", element.id === "card" ? "Card" : element.id === "group" ? "Glass group" : element.classList.contains("pill") ? "Pill" : `Shape ${element.id || index}`);
  }
  for (const event of ["pointerdown", "focusin"]) root.addEventListener(event, e => {
    const element = e.target.closest("edinstvo-glass, edinstvo-glass-group");
    if (element && root.contains(element)) select(element);
  });
  editGroup.addEventListener("click", () => { const group = parentGroup(); if (group) select(group); });
  rotate.addEventListener("change", () => selected.toggleAttribute("rotatable", rotate.checked));
  resetRotation.addEventListener("click", () => {
    selected.setAttribute("rotation-x", "0");
    selected.setAttribute("rotation-y", "0");
    refresh();
  });
  root.addEventListener("glass-rotate", refresh);
  select(root.querySelector("#card"));
}
