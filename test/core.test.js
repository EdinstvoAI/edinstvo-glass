import assert from "node:assert/strict";
import { test } from "node:test";
import { cornerRadius, fitBox, lightVector, softPeak, uvTransform } from "../dist/geometry.js";
import { Spring, motionDefaults, resolveMotion } from "../dist/interaction.js";
import { defaults, numericKeys, ranges, readValue, resolveMaterial, sceneLayer, stackLayers } from "../dist/material.js";
import { adaptiveMaterial, contrast, luminance } from "../dist/adaptation.js";
import { resolveGeometry } from "../dist/geometry.js";
import { distanceTransform } from "../dist/distance-field.js";

test("later layers win and values stay in range", () => {
  const material = resolveMaterial(defaults, { frost: 4, refraction: -1, depth: Number.NaN });
  assert.equal(material.frost, 1);
  assert.equal(material.refraction, 0);
  assert.equal(material.depth, defaults.depth);
});

test("defaults sit inside the ranges", () => {
  for (const key of numericKeys) assert.ok(defaults[key] >= ranges[key][0] && defaults[key] <= ranges[key][1], key);
});

test("physical optics settings inherit and validate independently", () => {
  const m = resolveMaterial({ ior: 1.52, dispersionMode: "physical" }, { ior: "inherit", dispersion: 0 });
  assert.equal(m.ior, 1.52); assert.equal(m.dispersionMode, "physical"); assert.equal(m.dispersion, 0);
  assert.equal(resolveMaterial({ ior: -1 }).ior, 1);
  assert.equal(resolveMaterial(m, { dispersionMode: "default" }).dispersionMode, "artistic");
});

test("distance fields match exhaustive Euclidean distances", () => {
  const width = 7, height = 6;
  const mask = Uint8Array.from({ length: width * height }, (_, i) => i % 7 === 2 || i === 31 ? 255 : 0);
  for (const inside of [true, false]) {
    const field = distanceTransform(mask, width, height, inside);
    for (let i = 0; i < mask.length; i++) {
      let expected = Infinity;
      for (let j = 0; j < mask.length; j++) if ((mask[j] >= 128) === inside) expected = Math.min(expected, (i % width - j % width) ** 2 + (Math.floor(i / width) - Math.floor(j / width)) ** 2);
      assert.equal(field[i], expected);
    }
  }
});

test("geometry rejects markup and unbounded paths without accepting prototype keys", () => {
  assert.equal(resolveGeometry({ shape: "constructor" }).shape, "rounded-rect");
  assert.equal(resolveGeometry({ curvature: 100 }).curvature, 8);
  assert.deepEqual(resolveGeometry({ viewBox: [0, 0, -1, 1] }).viewBox, [0, 0, 100, 100]);
  for (const path of ["<svg onload=alert(1)>", "M1e999 0", "M".repeat(65537), "M0 0 ".repeat(4097)]) assert.throws(() => resolveGeometry({ shape: "path", path }));
  const layers = stackLayers(JSON.parse('{"__proto__":{"polluted":true}}'), { frost: 0.2 });
  assert.equal(Object.getPrototypeOf(layers), null);
  assert.equal({}.polluted, undefined);
});

test("adaptive contrast covers the sampled extremes without changing the material", () => {
  const samples = [[0, 0, 0], [1, 1, 1]];
  const base = resolveMaterial({ adaptation: "full", frost: 0.1 });
  const snapshot = { ...base };
  const result = adaptiveMaterial(base, { mean: [0.5, 0.5, 0.5], samples, complexity: 1, dark: false }, [1, 1, 1], null);
  assert.ok(result.contrast >= 4.49);
  assert.ok(result.material.transparency < base.transparency);
  assert.ok(result.material.frost > base.frost);
  assert.deepEqual(base, snapshot);
  assert.equal(luminance([0, 0, 0]), 0);
  assert.equal(luminance([1, 1, 1]), 1);
  assert.equal(contrast([0, 0, 0], [1, 1, 1]), 21);
});

test("adaptation respects manual tint, strength and accessibility preferences", () => {
  const stats = { mean: [1, 1, 1], samples: [[1, 1, 1]], complexity: 0, dark: false };
  const tint = [0.9, 0.8, 0.7];
  const base = resolveMaterial({ adaptation: "contrast", tint: "#e6ccb3" });
  assert.deepEqual(adaptiveMaterial(base, stats, tint, null).tint, tint);
  const strong = adaptiveMaterial(base, stats, tint, null, true, true);
  assert.ok(strong.material.transparency <= 0.2);
  const disabled = adaptiveMaterial({ ...base, adaptationStrength: 0 }, stats, tint, null);
  assert.equal(disabled.material.transparency, base.transparency);
  assert.equal(resolveMaterial({ adaptation: "full" }, { adaptation: "inherit" }).adaptation, "full");
  assert.equal(resolveMaterial({ adaptation: "full" }, { adaptation: "default" }).adaptation, "off");
});

test("thickness inherits independently and accepts local overrides", () => {
  assert.equal(defaults.thickness, 6);
  const material = resolveMaterial({ thickness: 0.8, refraction: 0.4 }, { thickness: "inherit", refraction: 0.7 });
  assert.equal(material.thickness, 0.8);
  assert.equal(material.refraction, 0.7);
});

test("a child can opt out of merging", () => {
  assert.equal(resolveMotion({ merge: 28 }, { merge: 0 }).merge, 0);
  assert.equal(resolveMotion({ morph: 9 }).morph, 1);
  assert.equal(resolveMotion().jelly, motionDefaults.jelly);
});

test("cover fills the box and centres the overflow", () => {
  assert.deepEqual(fitBox({ x: 0, y: 0, w: 100, h: 100 }, 200, 100, "cover"), { x: -50, y: 0, w: 200, h: 100 });
});

test("contain stays inside the box", () => {
  assert.deepEqual(fitBox({ x: 0, y: 0, w: 100, h: 100 }, 200, 100, "contain"), { x: 0, y: 25, w: 100, h: 50 });
});

test("uv follows the element across the source", () => {
  const { origin, perPixel } = uvTransform({ left: 50, top: 25 }, { x: 0, y: 0, w: 100, h: 100 }, 1, 1, 2);
  assert.deepEqual(origin, [0.5, 0.25]);
  assert.deepEqual(perPixel, [0.005, 0.005]);
});

test("corner radius handles percent and caps at a pill", () => {
  assert.equal(cornerRadius("50%", 200, 100), 50);
  assert.equal(cornerRadius("999px", 200, 100), 50);
  assert.equal(cornerRadius("12px", 200, 100), 12);
});

test("light angle zero points up", () => {
  const [x, y] = lightVector(0);
  assert.ok(Math.abs(x) < 1e-9);
  assert.equal(y, -1);
});

test("the element module imports outside a browser", async () => {
  await assert.doesNotReject(import("../dist/element.js"));
});

test("the peak of a pill is its half height", () => {
  assert.ok(softPeak(100, 50, 50) > 30 && softPeak(100, 50, 50) <= 50);
});

test("a spring overshoots, then settles on the target", () => {
  const spring = new Spring(0, 190, 15);
  spring.target = 1;
  let top = 0;
  for (let i = 0; i < 300; i++) {
    spring.step(1 / 60);
    top = Math.max(top, spring.value);
  }
  assert.ok(top > 1);
  assert.equal(spring.value, 1);
});

test("one local light setting leaves the other global ones alone", () => {
  const scene = sceneLayer({ direction: "top-left", intensity: "80%", color: "white", softness: 0.6 });
  const own = resolveMaterial(stackLayers(scene, { light: "inherit", lightColor: "blue" }));
  assert.equal(own.lightAngle, -45);
  assert.equal(own.light, 0.8);
  assert.equal(own.lightSoftness, 0.6);
  assert.equal(own.lightColor, "blue");
});

test("default goes back to the engine value past the scene", () => {
  const scene = sceneLayer({ intensity: 0.9, color: "red" });
  const own = resolveMaterial(stackLayers(scene, { light: "default", lightColor: "default" }));
  assert.equal(own.light, defaults.light);
  assert.equal(own.lightColor, defaults.lightColor);
  assert.equal(resolveMaterial().lightColor, "#fff");
});

test("light values read words and percents", () => {
  assert.equal(readValue("lightAngle", "bottom-right"), 135);
  assert.equal(readValue("light", "40%"), 0.4);
  assert.equal(readValue("light", "inherit"), "inherit");
});

test("new effects stay off by default", () => {
  assert.equal(defaults.reflection, 0);
  assert.equal(defaults.dynamicRefraction, 0);
});
