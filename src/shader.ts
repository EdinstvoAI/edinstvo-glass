export const vertex = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const fragment = `#version 300 es
precision highp float;

uniform sampler2D uBackdrop;
uniform vec2 uCanvas, uSize, uUvOrigin, uUvPerPx, uTexSize, uLightDir;
uniform vec3 uTint;
uniform float uViewY, uPad, uRadius, uDpr, uLight, uTransparency, uRefraction, uDepth, uDispersion, uFrost, uSplay, uBloom, uGlint;
out vec4 outColor;

const float SOFTNESS = 2.7;

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float softMin(float a, float b) {
  float lo = min(a, b);
  return lo * pow(1.0 + pow(lo / max(a, b), SOFTNESS), -1.0 / SOFTNESS);
}

float noise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

vec2 toUv(vec2 px) {
  return uUvOrigin + px * uUvPerPx;
}

vec3 frosted(vec2 px, float radius, float lod, float spin) {
  vec2 a = vec2(cos(spin), sin(spin)) * radius;
  vec2 b = vec2(-a.y, a.x);
  return (
    textureLod(uBackdrop, toUv(px + a), lod).rgb +
    textureLod(uBackdrop, toUv(px - a), lod).rgb +
    textureLod(uBackdrop, toUv(px + b), lod).rgb +
    textureLod(uBackdrop, toUv(px - b), lod).rgb
  ) * 0.25;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uCanvas.y - (gl_FragCoord.y - uViewY)) - uPad;
  vec2 half_ = uSize * 0.5;
  vec2 c = px - half_;
  float d = roundedBox(c, half_, uRadius);
  float texels = max(uUvPerPx.x * uTexSize.x, uUvPerPx.y * uTexSize.y);
  float haloLod = log2(max(28.0 * uDpr * texels, 1.0));
  vec3 halo = textureLod(uBackdrop, toUv(px), haloLod).rgb;

  float mask = 1.0 - smoothstep(-0.75, 0.75, d);
  float spill = exp(-max(d, 0.0) / (uPad * 0.3)) * uBloom * 0.4 * uLight;
  vec3 spillColor = mix(halo, vec3(1.0), 0.6);
  if (mask <= 0.0) {
    outColor = vec4(spillColor * spill, spill);
    return;
  }

  // ── a p-norm of the edge distances: smooth everywhere inside, and p = 2.7 lands on the rounded corner
  vec2 edges = max(half_ - abs(c), 0.0) + uRadius + 0.001;
  float soft = softMin(edges.x, edges.y);
  float peak = softMin(half_.x + uRadius, half_.y + uRadius) - uRadius;
  float band = min(mix(max(uDepth * uDpr, 1.0), peak, uSplay * uSplay), peak);
  float s = 1.0 - clamp((soft - uRadius) / band, 0.0, 1.0);
  float height = sqrt(max(1.0 - s * s, 0.0));
  vec2 g = normalize(pow(vec2(soft) / edges, vec2(SOFTNESS + 1.0)) * sign(c) + 0.00001);
  vec3 n = normalize(vec3(g * s * s / max(height, 0.14), 1.0));

  vec3 ray = refract(vec3(0.0, 0.0, -1.0), n, 1.0 / 1.5);
  vec2 shift = ray.xy / max(-ray.z, 0.5) * band * (0.35 + height) * uRefraction * 1.2;

  float frostPx = uFrost * 24.0 * uDpr;
  float lod = log2(max(frostPx * texels, 1.0));
  float radius = frostPx * 0.6;
  float spin = noise(gl_FragCoord.xy) * 6.2831853;
  float k = uDispersion * 0.18;
  vec3 col = vec3(
    frosted(px + shift * (1.0 - k), radius, lod, spin).r,
    frosted(px + shift, radius, lod, spin).g,
    frosted(px + shift * (1.0 + k), radius, lod, spin).b
  );

  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 1.08);
  col = mix(uTint, col, uTransparency);
  col += halo * uBloom * 0.22 * (0.35 + s);

  float facing = dot(n.xy, uLightDir);
  col += uLight * (max(facing, 0.0) * 0.5 + dot(c / half_, uLightDir) * 0.05);
  col *= 1.0 - uLight * max(-facing, 0.0) * 0.35;

  float toward = dot(g, uLightDir);
  col += uGlint * pow(s, 5.0) * (pow(max(toward, 0.0), 6.0) + pow(max(-toward, 0.0), 6.0) * 0.4);

  vec3 inside = clamp(col, 0.0, 1.0) * mask;
  float rest = (1.0 - mask) * spill;
  outColor = vec4(inside + spillColor * rest, mask + rest);
}`;
