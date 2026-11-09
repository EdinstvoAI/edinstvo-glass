import { defaults } from "/dist/index.js";

const fragment = `#version 300 es
precision highp float;
uniform sampler2D backdrop;
uniform vec2 viewport, sceneSize, sceneCenter, size, rotation, lightDirection;
uniform float thickness, bevel, radius, refraction, frost, transparency, light, reflection;
out vec4 color;

mat3 orientation() {
  float a = rotation.x, b = rotation.y;
  return mat3(cos(b),0,-sin(b), 0,1,0, sin(b),0,cos(b)) *
    mat3(1,0,0, 0,cos(a),sin(a), 0,-sin(a),cos(a));
}

float distanceToGlass(vec3 p) {
  float edge = min(bevel, thickness * 0.48);
  float r = max(radius - edge, 0.0);
  vec2 q = abs(p.xy) - (size * 0.5 - edge) + r;
  float outline = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  vec2 slab = vec2(outline, abs(p.z) - thickness * 0.5 + edge);
  return length(max(slab, 0.0)) + min(max(slab.x, slab.y), 0.0) - edge;
}

vec3 normalAt(vec3 p) {
  float e = 0.03;
  return normalize(vec3(
    distanceToGlass(p + vec3(e,0,0)) - distanceToGlass(p - vec3(e,0,0)),
    distanceToGlass(p + vec3(0,e,0)) - distanceToGlass(p - vec3(0,e,0)),
    distanceToGlass(p + vec3(0,0,e)) - distanceToGlass(p - vec3(0,0,e))));
}

vec3 environment(vec2 p, float lod) {
  return textureLod(backdrop, (sceneCenter + vec2(p.x, -p.y)) / sceneSize, lod).rgb;
}

void main() {
  vec2 px = (gl_FragCoord.xy / viewport - 0.5) * vec2(viewport.x / viewport.y, 1.0) * 340.0;
  mat3 model = orientation();
  mat3 inverseModel = transpose(model);
  vec3 origin = inverseModel * vec3(px, 500.0);
  vec3 direction = inverseModel * vec3(0,0,-1);
  float travel = 0.0;
  bool hit = false;
  vec3 entry;
  for (int i = 0; i < 80; i++) {
    entry = origin + direction * travel;
    float d = distanceToGlass(entry);
    if (d < 0.025) { hit = true; break; }
    travel += max(d, 0.025);
    if (travel > 900.0) break;
  }
  if (!hit || thickness < 0.01) { color = vec4(environment(px, 0.0), 1.0); return; }

  vec3 normal = normalAt(entry);
  vec3 internalRay = refract(direction, normal, 1.0 / 1.5);
  vec3 exitPoint = entry + internalRay * 0.08;
  bool exited = false;
  for (int i = 0; i < 96; i++) {
    float d = distanceToGlass(exitPoint);
    if (d > -0.015) { exited = true; break; }
    exitPoint += internalRay * max(-d, 0.02);
  }
  vec3 exitNormal = normalAt(exitPoint);
  vec3 outgoing = refract(internalRay, -exitNormal, 1.5);
  bool totalReflection = dot(outgoing, outgoing) < 0.01 || !exited;
  if (totalReflection) outgoing = reflect(internalRay, -exitNormal);
  vec3 worldExit = model * exitPoint;
  vec3 worldRay = model * outgoing;
  float backdropZ = -180.0;
  float t = max((backdropZ - worldExit.z) / min(worldRay.z, -0.05), 0.0);
  vec2 through = (worldExit + worldRay * t).xy;
  vec3 transmitted = environment(mix(px, through, refraction), frost * 6.0);
  float pathLength = length(exitPoint - entry);
  transmitted *= exp(-pathLength * 0.0012);
  transmitted = mix(vec3(0.92), transmitted, transparency);
  vec3 n = model * normal;
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(n.z, 0.0), 5.0);
  vec3 reflected = environment(px + n.xy * 190.0, frost * 3.0);
  float lightAmount = max(dot(n, normalize(vec3(lightDirection, 0.8))), 0.0);
  vec3 result = mix(transmitted, reflected, totalReflection ? 1.0 : fresnel * reflection);
  result += lightAmount * light * 0.18;
  color = vec4(result, 1.0);
}`;

export function volumePreview(card, controls, scene) {
  const panel = document.createElement("section");
  panel.className = "volume-view";
  panel.hidden = true;
  const canvas = document.createElement("canvas");
  const caption = document.createElement("p");
  caption.textContent = "3D optical study · drag to rotate · thickness changes the solid";
  panel.append(canvas, caption);
  document.body.append(panel);
  const button = document.createElement("button");
  button.textContent = "Inspect in 3D";
  button.style.gridColumn = "1 / -1";
  controls.prepend(button);
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
  if (!gl) { button.disabled = true; return; }
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, `#version 300 es
    void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0, 1); }`], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const u = Object.fromEntries(["viewport", "sceneSize", "sceneCenter", "size", "rotation", "lightDirection", "thickness", "bevel", "radius", "refraction", "frost", "transparency", "light", "reflection"].map(name => [name, gl.getUniformLocation(program, name)]));
  let x = -0.3, y = 0.65, pointer = null, pending = false;
  function draw() {
    pending = false;
    if (panel.hidden) return;
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform2f(u.viewport, width, height);
    gl.uniform2f(u.sceneSize, innerWidth, innerHeight);
    const rect = card.getBoundingClientRect();
    gl.uniform2f(u.sceneCenter, rect.left + rect.width / 2, rect.top + rect.height / 2);
    gl.uniform2f(u.size, card.offsetWidth, card.offsetHeight);
    gl.uniform2f(u.rotation, x, y);
    gl.uniform1f(u.radius, Math.min(parseFloat(getComputedStyle(card).borderRadius) || 0, card.offsetHeight / 2));
    const get = key => Number(card.getAttribute(key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)) ?? defaults[key]);
    for (const name of ["thickness", "refraction", "frost", "transparency", "light", "reflection"]) gl.uniform1f(u[name], get(name));
    gl.uniform1f(u.bevel, get("depth"));
    const angle = get("lightAngle") * Math.PI / 180;
    gl.uniform2f(u.lightDirection, Math.sin(angle), Math.cos(angle));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function invalidate() {
    if (!pending && !panel.hidden) { pending = true; requestAnimationFrame(draw); }
  }
  button.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    button.textContent = panel.hidden ? "Inspect in 3D" : "Back to scene";
    button.setAttribute("aria-pressed", String(!panel.hidden));
    const supported = new Set(["thickness", "depth", "reflection", "refraction", "frost", "transparency", "light", "lightAngle"]);
    for (const label of controls.querySelectorAll("label")) {
      const disabled = !panel.hidden && !supported.has(label.textContent);
      label.nextElementSibling.disabled = disabled;
      label.title = disabled ? "Available in scene view" : "";
      label.style.opacity = disabled ? "0.4" : "1";
    }
    invalidate();
  });
  canvas.addEventListener("pointerdown", e => { pointer = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => {
    if (!pointer) return;
    y += (e.clientX - pointer[0]) * 0.01;
    x += (e.clientY - pointer[1]) * 0.01;
    pointer = [e.clientX, e.clientY];
    invalidate();
  });
  const release = () => { pointer = null; };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  controls.addEventListener("input", invalidate);
  addEventListener("resize", invalidate);
}
