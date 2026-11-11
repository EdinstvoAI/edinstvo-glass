import { defaults, ranges, motionDefaults, motionRanges, resolveMaterial, resolveMotion, getSceneMaterial, resolveGeometry } from "/dist/index.js";
import { readGeometry } from "/dist/geometry.js";

export function inspectScene(root, controls) {
  let selected;
  const title = document.createElement("strong");
  const note = document.createElement("p");
  const editGroup = document.createElement("button");
  const bar = document.createElement("div");
  bar.className = "inspector-heading inspector-top";
  const label = document.createElement("span"); label.textContent = "Inspector";
  const theme = document.createElement("button"); theme.type = "button";
  const updateTheme = () => { theme.textContent = document.documentElement.dataset.theme === "dark" ? "Light" : "Dark"; };
  theme.addEventListener("click", () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; updateTheme(); });
  updateTheme(); bar.append(label, theme);
  title.setAttribute("aria-live", "polite");
  title.className = note.className = editGroup.className = "inspector-heading";
  editGroup.textContent = "Edit group material";
  controls.append(bar, title, note, editGroup);
  const inputs = new Map();
  const observer = new MutationObserver(() => refresh());
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
      for (const key of ["adaptation", "foreground", "tint", "lightColor", "dispersionMode"]) {
        const raw = el.getAttribute(kebab(key));
        if (raw !== null) material[key] = raw;
      }
      chain.unshift({ material, motion });
    }
    return { ...resolveMaterial(getSceneMaterial(), ...chain.map(layer => layer.material)), ...resolveMotion(...chain.map(layer => layer.motion)) };
  }

  function refresh() {
    if (!selected) return;
    const current = values();
    title.textContent = selected.getAttribute("aria-label");
    note.textContent = selected.dataset.engine === "css"
      ? "WebGL is unavailable. CSS fallback only blurs the backdrop."
      : grouped() ? "Shared material · shape and motion are individual." : "Click an element to inspect it.";
    editGroup.hidden = !grouped();
    adaptation.value = current.adaptation;
    adaptation.disabled = grouped();
    dispersionMode.value = current.dispersionMode;
    dispersionMode.disabled = grouped();
    const geometry = readGeometry(selected);
    shape.value = geometry.shape;
    curvature.value = geometry.curvature;
    curveRow.hidden = geometry.shape !== "superellipse";
    pathRow.hidden = geometry.shape !== "path";
    path.value = geometry.path;
    viewBox.value = geometry.viewBox.join(" ");
    for (const [key, { input, output }] of inputs) {
      input.value = current[key] ?? defaults[key] ?? motionDefaults[key];
      output.value = Number(input.value).toFixed(2);
      input.disabled = grouped() && !isMotion(key);
    }
  }

  function choice(name, options, change) {
    const label = document.createElement("label");
    const select = document.createElement("select");
    select.id = `setting-${name}`; label.htmlFor = select.id; label.textContent = name;
    for (const [value, text] of options) select.add(new Option(text, value));
    select.addEventListener("change", () => { change(select.value); refresh(); });
    controls.append(label, select);
    return select;
  }
  const adaptation = choice("adaptation", [["off", "Off"], ["tint", "Tint"], ["contrast", "Contrast"], ["full", "Full"]], value => selected.setAttribute("adaptation", value));
  const dispersionMode = choice("dispersionMode", [["artistic", "Artistic"], ["physical", "Physical approximation"]], value => selected.setAttribute("dispersion-mode", value));
  const shape = choice("shape", [["rounded-rect", "Rounded rectangle"], ["circle", "Circle"], ["ellipse", "Ellipse"], ["superellipse", "Superellipse"], ["path", "SVG path"]], value => {
    if (value === "path" && !selected.getAttribute("path") && !selected.geometry.path) selected.setAttribute("path", "M50 0L100 50L50 100L0 50Z");
    selected.setAttribute("shape", value);
  });
  const curveRow = document.createElement("div"); curveRow.className = "inspector-heading geometry-row";
  const curveLabel = document.createElement("label"); curveLabel.textContent = "curvature";
  const curvature = Object.assign(document.createElement("input"), { type: "range", min: 2, max: 8, step: 0.1, id: "setting-curvature" });
  curveLabel.htmlFor = curvature.id; curveRow.append(curveLabel, curvature); controls.append(curveRow);
  curvature.addEventListener("input", () => selected.setAttribute("curvature", curvature.value));
  const pathRow = document.createElement("div"); pathRow.className = "inspector-heading path-editor";
  const path = document.createElement("textarea"); path.rows = 3; path.setAttribute("aria-label", "SVG path data");
  const viewBox = document.createElement("input"); viewBox.setAttribute("aria-label", "SVG view box");
  pathRow.append(path, viewBox); controls.append(pathRow);
  path.addEventListener("change", () => {
    try { resolveGeometry({ path: path.value }); path.setCustomValidity(""); selected.setAttribute("path", path.value); }
    catch (error) { path.setCustomValidity(error.message); path.reportValidity(); }
  });
  viewBox.addEventListener("change", () => {
    const values = viewBox.value.trim().split(/[\s,]+/).map(Number);
    if (values.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) { viewBox.setCustomValidity("Use x y width height, with positive width and height."); viewBox.reportValidity(); return; }
    viewBox.setCustomValidity(""); selected.setAttribute("view-box", values.join(" "));
  });

  function select(element) {
    selected?.removeAttribute("data-selected");
    selected = element;
    selected.setAttribute("data-selected", "");
    observer.disconnect();
    observer.observe(selected, { attributes: true, attributeFilter: [...Object.keys(ranges), ...Object.keys(motionRanges)].map(kebab).concat(["shape", "curvature", "path", "view-box", "adaptation", "dispersion-mode", "data-grouped", "data-engine"]) });
    refresh();
  }

  for (const [key, [min, max]] of Object.entries({ ...ranges, ...motionRanges })) {
    const label = document.createElement("label");
    label.textContent = key;
    const input = Object.assign(document.createElement("input"), { id: `setting-${key}`, type: "range", min, max, step: max - min > 2 ? 1 : 0.01 });
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
  select(root.querySelector("#card"));
}
