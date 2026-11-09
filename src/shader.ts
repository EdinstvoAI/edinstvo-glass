export const vertex = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const fragment = `#version 300 es
precision highp float;

const int MAX_SHAPES = 64;
const float SOFTNESS = 2.7;

uniform sampler2D uBackdrop, uFrosted, uPathField;
uniform vec4 uBoxes[MAX_SHAPES];
uniform vec4 uForms[MAX_SHAPES];
uniform vec2 uPathGrid;
uniform float uIor;
uniform bool uPhysicalDispersion;
uniform int uDiagnostic;
uniform int uCount;
uniform vec2 uCanvas, uUvOrigin, uUvPerPx, uTexSize, uLightDir;
uniform vec3 uTint, uTouch, uLightColor;
uniform float uStrokeThickness;
uniform float uViewY, uPad, uDpr, uPeak, uAppear, uLight, uTransparency, uThickness, uRefraction, uDepth, uDispersion, uFrost, uSplay, uBloom, uGlint, uRim, uLift, uLightSoftness, uLightDiffusion, uReflection, uFlow;
out vec4 outColor;

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float softMin(float a, float b) {
  float lo = min(a, b);
  return lo * pow(1.0 + pow(lo / max(a, b), SOFTNESS), -1.0 / SOFTNESS);
}

float blend(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

vec2 shapeDistance(vec2 p, vec2 b, int index) {
  float kind = uForms[index].z;
  if (kind < 0.5) return vec2(roundedBox(p, b, uForms[index].x), 0.0);
  if (kind > 3.5) { float d = length(p) - min(b.x, b.y); return vec2(d, -d); }
  if (kind > 2.5) {
    float aspect = max(uForms[index].w, 0.001);
    vec2 local = p / b * vec2(min(1.0, aspect), min(1.0, 1.0 / aspect)) * 126.0 + 128.0;
    vec2 safe = clamp(local, vec2(0.5), vec2(255.5));
    vec2 cell = vec2(mod(float(index), uPathGrid.x), floor(float(index) / uPathGrid.x));
    vec4 fieldValue = texture(uPathField, (cell * 256.0 + safe) / (uPathGrid * 256.0));
    float scale = max(b.x, b.y) / 126.0;
    float extra = length(local - safe) * scale;
    float raw = (dot(fieldValue.rg, vec2(65280.0, 255.0)) / 65535.0 * 1024.0 - 512.0) * scale + extra;
    float smoothDistance = (dot(fieldValue.ba, vec2(65280.0, 255.0)) / 65535.0 * 1024.0 - 512.0) * scale + extra;
    return vec2(raw, -smoothDistance);
  }
  vec2 q = abs(p) / b;
  float power = kind < 1.5 ? 2.0 : uForms[index].w;
  float sum = pow(q.x, power) + pow(q.y, power);
  float radial = pow(sum, 1.0 / power);
  if (radial < 0.0001) return vec2(-min(b.x, b.y), min(b.x, b.y));
  vec2 gradient = pow(q, vec2(power - 1.0)) / b / pow(sum, (power - 1.0) / power);
  float distance = (radial - 1.0) / max(length(gradient), 0.0001);
  return vec2(distance, -distance);
}

// ── x is the distance to the merged outline, y how deep the point sits inside it, without creases
vec2 field(vec2 p) {
  float joined = 1e5;
  float apart = 1e5;
  float smoothJoined = 1e5;
  float smoothApart = 1e5;
  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i >= uCount) break;
    vec2 c = p - uBoxes[i].xy;
    vec2 b = uBoxes[i].zw;
    float r = uForms[i].x;
    vec2 shape = shapeDistance(c, b, i);
    float own = shape.x;
    float smoothOwn = own;
    if (own < 0.0) {
      float interior = shape.y;
      if (uForms[i].z < 0.5) {
        vec2 edges = max(b - sqrt(c * c + vec2(0.01)), 0.0) + r + 0.001;
        float round = r / min(b.x, b.y);
        round *= round;
        interior = mix(softMin(edges.x, edges.y) - r, -own, round * round);
      }
      smoothOwn = mix(own, -max(interior, 0.0), smoothstep(0.0, max(2.0 * uDpr, uPeak * 0.15), -own));
    }
    if (uForms[i].y > 0.0) { joined = blend(joined, own, uForms[i].y); smoothJoined = blend(smoothJoined, smoothOwn, uForms[i].y); }
    else { apart = min(apart, own); smoothApart = min(smoothApart, smoothOwn); }
  }
  float d = min(joined, apart);
  float interior = -min(smoothJoined, smoothApart);
  float transition = smoothstep(0.0, max(2.0 * uDpr, uPeak * 0.15), -d);
  return vec2(d, max(mix(-d, interior, transition), 0.0));
}

vec2 toUv(vec2 px) {
  return uUvOrigin + px * uUvPerPx;
}

vec3 pick(vec2 px, float lod) {
  return uFrost > 0.0 ? texture(uFrosted, toUv(px)).rgb : textureLod(uBackdrop, toUv(px), lod).rgb;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uCanvas.y - (gl_FragCoord.y - uViewY));
  vec2 f = field(px);
  float d = f.x;
  float texels = max(uUvPerPx.x * uTexSize.x, uUvPerPx.y * uTexSize.y);
  float haloLod = log2(max(28.0 * uDpr * texels, 1.0));
  vec3 halo = textureLod(uBackdrop, toUv(px), haloLod).rgb;

  float mask = 1.0 - smoothstep(-0.75, 0.75, d);
  float spill = exp(-max(d, 0.0) / (uPad * 0.3)) * uBloom * 0.4 * uLight;
  vec3 spillColor = mix(halo, vec3(1.0), 0.6);

  float band = min(mix(max(uDepth * uDpr, 1.0), uPeak, uSplay * uSplay), uPeak);
  float s = 1.0 - clamp(f.y / band, 0.0, 1.0);
  float height = sqrt(max(1.0 - s * s, 0.0));
  float e = uDpr;
  vec2 slope = vec2(field(px - vec2(e, 0.0)).y - field(px + vec2(e, 0.0)).y, field(px - vec2(0.0, e)).y - field(px + vec2(0.0, e)).y);
  vec2 gradient = slope / (2.0 * e);
  vec2 g = gradient / sqrt(dot(gradient, gradient) + 0.04);
  float bevelHeight = min(uThickness * uDpr * 0.5, band);
  vec3 n = normalize(vec3(gradient * s / sqrt(max(1.0 - s * s, 0.0025)) * bevelHeight / band, 1.0));

  vec3 ray = refract(vec3(0.0, 0.0, -1.0), n, 1.0 / uIor);
  float opticalPath = uThickness * uDpr - bevelHeight * (1.0 - height);
  vec2 refractionShift = ray.xy / max(-ray.z, 0.25) * opticalPath * uRefraction * uAppear;
  vec2 shift = refractionShift;

  if (uFlow > 0.0) {
    float reachOut = 32.0 * uDpr;
    float blurred = haloLod;
    vec2 lean = vec2(
      dot(vec3(0.6, 0.15, 0.25), textureLod(uBackdrop, toUv(px + vec2(reachOut, 0.0)), blurred).rgb - textureLod(uBackdrop, toUv(px - vec2(reachOut, 0.0)), blurred).rgb),
      dot(vec3(0.6, 0.15, 0.25), textureLod(uBackdrop, toUv(px + vec2(0.0, reachOut)), blurred).rgb - textureLod(uBackdrop, toUv(px - vec2(0.0, reachOut)), blurred).rgb)
    );
    lean /= 1.0 + length(lean) * 1.5;
    shift += lean * opticalPath * uFlow * 1.6 * uAppear;
  }

  vec2 fromTouch = px - uTouch.xy;
  float reach = 90.0 * uDpr;
  float touch = exp(-dot(fromTouch, fromTouch) / (reach * reach)) * uTouch.z;
  shift -= fromTouch * touch * 0.12;
  if (uDiagnostic == 1) { outColor = vec4((n * 0.5 + 0.5) * mask, mask); return; }
  if (uDiagnostic == 2) { outColor = vec4(vec3(shift / max(uThickness * uDpr, 1.0) * 0.5 + 0.5, 0.5) * mask, mask); return; }

  vec2 at = px + shift;
  float squeeze = log2(max(max(length(dFdx(at)), length(dFdy(at))) * texels, 1.0));
  vec3 col;
  if (uDispersion <= 0.0) col = pick(at, squeeze);
  else if (uPhysicalDispersion) {
    float redIor = max(1.0, uIor + uDispersion * 0.004 * (1.0 / (0.610 * 0.610) - 1.0 / (0.550 * 0.550)));
    float blueIor = uIor + uDispersion * 0.004 * (1.0 / (0.460 * 0.460) - 1.0 / (0.550 * 0.550));
    vec3 redRay = refract(vec3(0,0,-1), n, 1.0 / redIor);
    vec3 blueRay = refract(vec3(0,0,-1), n, 1.0 / blueIor);
    vec2 factor = vec2(opticalPath * uRefraction * uAppear);
    vec2 redShift = redRay.xy / max(-redRay.z, 0.25) * factor;
    vec2 blueShift = blueRay.xy / max(-blueRay.z, 0.25) * factor;
    col = vec3(pick(at + redShift - refractionShift, squeeze).r, pick(at, squeeze).g, pick(at + blueShift - refractionShift, squeeze).b);
  } else {
    float k = uDispersion * 0.3;
    col = vec3(pick(at - shift * k, squeeze).r, pick(at, squeeze).g, pick(at + shift * k, squeeze).b);
  }

  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 1.08);
  col = mix(uTint, col, uTransparency);
  col = col * (1.0 + uLift) + uLift * 0.12;
  col += halo * uBloom * 0.22 * s;

  float facing = dot(n.xy, uLightDir);
  vec2 centered = (px - uCanvas * 0.5) / (uCanvas * 0.5);
  float lit = max((facing + uLightSoftness) / (1.0 + uLightSoftness), 0.0);
  col *= mix(vec3(1.0), uLightColor, uLight * 0.35);
  float aimed = 1.0 - uLightDiffusion * 0.6;
  col += uLight * uLightColor * ((lit * 0.3 + dot(centered, uLightDir) * 0.03) * aimed + uLightDiffusion * 0.1);
  col *= 1.0 - uLight * max(-facing, 0.0) * 0.2 * (1.0 - uLightSoftness) * (1.0 - uLightDiffusion);

  float toward = dot(g, uLightDir);
  float sharp = mix(6.0, 2.0, uLightSoftness);
  col += uGlint * uLightColor * pow(s, 5.0) * (pow(max(toward, 0.0), sharp) + pow(max(-toward, 0.0), sharp) * 0.4);

  if (uReflection > 0.0) {
    vec3 around = textureLod(uBackdrop, toUv(px + g * (2.0 * f.y + band)), haloLod * 0.35).rgb;
    float shine = 0.8 + uLight * (0.2 + 0.6 * toward);
    vec3 mirrored = clamp(around * mix(vec3(1.0), uLightColor, 0.6) * shine, 0.0, 1.0);
    float cosI = max(n.z, 0.00001);
    float cosT = sqrt(max(0.0, 1.0 - (1.0 - cosI * cosI) / (uIor * uIor)));
    float parallel = (uIor * cosI - cosT) / max(uIor * cosI + cosT, 0.00001);
    float perpendicular = (cosI - uIor * cosT) / max(cosI + uIor * cosT, 0.00001);
    float fresnel = uIor <= 1.00001 ? 0.0 : (parallel * parallel + perpendicular * perpendicular) * 0.5;
    col = mix(col, mirrored, uReflection * fresnel);
  }

  float stroke = max(uStrokeThickness * uDpr, 0.001);
  float line = smoothstep(-1.6 * stroke, -0.6 * stroke, d) * step(0.001, uStrokeThickness);
  col += uRim * uLightColor * line * (0.18 + 0.82 * toward * toward);
  col += touch * (0.16 + halo * 0.3);

  vec3 inside = clamp(col, 0.0, 1.0) * mask;
  float rest = (1.0 - mask) * spill;
  outColor = vec4(inside + spillColor * rest, mask + rest) * uAppear;
}`;

const weights = Array.from({ length: 9 }, (_, i) => Math.exp(-i * i / 18));
const weightSum = weights[0] + 2 * weights.slice(1).reduce((a, b) => a + b, 0);

export const blurFragment = `#version 300 es
precision highp float;

uniform sampler2D uSource;
uniform vec2 uStep, uInvSize;
uniform float uLod;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy * uInvSize;
  vec3 sum = textureLod(uSource, uv, uLod).rgb * ${(weights[0] / weightSum).toFixed(9)};
  ${[1, 2, 3, 4, 5, 6, 7, 8].map(i => {
    return `sum += (textureLod(uSource, uv + uStep * ${i.toFixed(1)}, uLod).rgb + textureLod(uSource, uv - uStep * ${i.toFixed(1)}, uLod).rgb) * ${(weights[i] / weightSum).toFixed(9)};`;
  }).join("\n  ")}
  outColor = vec4(sum, 1.0);
}`;
