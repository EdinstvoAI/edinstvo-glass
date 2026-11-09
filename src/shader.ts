export const vertex = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const fragment = `#version 300 es
precision highp float;

const int MAX_SHAPES = 64;
const float SOFTNESS = 2.7;

uniform sampler2D uBackdrop, uFrosted;
uniform vec4 uBoxes[MAX_SHAPES];
uniform vec2 uForms[MAX_SHAPES];
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

// ── x is the distance to the merged outline, y how deep the point sits inside it, without creases
vec2 field(vec2 p) {
  float joined = 1e5;
  float apart = 1e5;
  float inset = -1e5;
  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i >= uCount) break;
    vec2 c = p - uBoxes[i].xy;
    vec2 b = uBoxes[i].zw;
    float r = uForms[i].x;
    float own = roundedBox(c, b, r);
    if (uForms[i].y > 0.0) joined = blend(joined, own, uForms[i].y);
    else apart = min(apart, own);
    if (own < 0.0) {
      vec2 edges = max(b - sqrt(c * c + vec2(0.01)), 0.0) + r + 0.001;
      float round = r / min(b.x, b.y);
      round *= round;
      inset = max(inset, mix(softMin(edges.x, edges.y) - r, -own, round * round));
    }
  }
  float d = min(joined, apart);
  float interior = max(inset, 0.0);
  float transition = smoothstep(0.0, max(2.0 * uDpr, uPeak * 0.15), -d);
  return vec2(d, inset < -1e4 ? max(-d, 0.0) : mix(max(-d, 0.0), interior, transition));
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
  vec3 n = normalize(vec3(g * s * s / sqrt(1.02 - s * s), 1.0));

  vec3 ray = refract(vec3(0.0, 0.0, -1.0), n, 1.0 / 1.5);
  float opticalPath = uThickness * uDpr * (0.35 + height);
  vec2 shift = ray.xy / max(-ray.z, 0.5) * opticalPath * uRefraction * 1.2 * uAppear;

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

  vec2 at = px + shift;
  float squeeze = log2(max(max(length(dFdx(at)), length(dFdy(at))) * texels, 1.0));
  float k = 0.04 + uDispersion * 0.3;
  vec3 col = vec3(
    pick(at - shift * k, squeeze).r,
    pick(at, squeeze).g,
    pick(at + shift * k, squeeze).b
  );

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
    col = mix(col, 1.0 - (1.0 - col) * (1.0 - mirrored), uReflection * s * s);
  }

  float stroke = max(uStrokeThickness * uDpr, 0.001);
  float line = smoothstep(-1.6 * stroke, -0.6 * stroke, d) * step(0.001, uStrokeThickness);
  col += uRim * uLightColor * line * (0.18 + 0.82 * toward * toward);
  col += touch * (0.16 + halo * 0.3);

  vec3 inside = clamp(col, 0.0, 1.0) * mask;
  float rest = (1.0 - mask) * spill;
  outColor = vec4(inside + spillColor * rest, mask + rest) * uAppear;
}`;

export const blurFragment = `#version 300 es
precision highp float;

uniform sampler2D uSource;
uniform vec2 uStep, uInvSize;
uniform float uLod;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy * uInvSize;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = -8; i <= 8; i++) {
    float x = float(i);
    float weight = exp(-x * x / 18.0);
    sum += textureLod(uSource, uv + uStep * x, uLod).rgb * weight;
    total += weight;
  }
  outColor = vec4(sum / total, 1.0);
}`;
