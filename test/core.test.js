import assert from "node:assert/strict";
import { test } from "node:test";
import { cornerRadius, fitBox, lightVector, softPeak, uvTransform } from "../dist/geometry.js";
import { Spring, motionDefaults, resolveMotion } from "../dist/interaction.js";
import { defaults, numericKeys, ranges, resolveMaterial } from "../dist/material.js";

test("later layers win and values stay in range", () => {
  const material = resolveMaterial(defaults, { frost: 4, refraction: -1, depth: Number.NaN });
  assert.equal(material.frost, 1);
  assert.equal(material.refraction, 0);
  assert.equal(material.depth, defaults.depth);
});

test("defaults sit inside the ranges", () => {
  for (const key of numericKeys) assert.ok(defaults[key] >= ranges[key][0] && defaults[key] <= ranges[key][1], key);
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
