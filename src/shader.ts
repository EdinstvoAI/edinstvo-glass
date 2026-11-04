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
uniform float uViewY, uPad, uRadius, uDpr, uLight, uTransparency, uRefraction, uDepth, uDispersion, uFrost, uSplay, uBloom;
out vec4 outColor;

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec2 outward(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  vec2 s = vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
  if (q.x > 0.0 && q.y > 0.0) return normalize(q) * s;
  return q.x > q.y ? vec2(s.x, 0.0) : vec2(0.0, s.y);
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

  float band = mix(max(uDepth * uDpr, 1.0), min(half_.x, half_.y), uSplay);
  float t = clamp(-d / band, 0.0, 1.0);
  float s = 1.0 - t;
  float height = sqrt(max(1.0 - s * s, 0.0));
  vec2 g = outward(c, half_, uRadius);
  vec3 n = normalize(vec3(g * s / max(height, 0.14), 1.0));

  vec3 ray = refract(vec3(0.0, 0.0, -1.0), n, 1.0 / 1.5);
  vec2 shift = ray.xy / max(-ray.z, 0.2) * band * (0.35 + height) * uRefraction * 2.0;

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

  vec3 l = normalize(vec3(uLightDir, 0.55));
  vec3 opposite = normalize(vec3(-uLightDir, 0.55));
  vec3 view = vec3(0.0, 0.0, 1.0);
  float glint = pow(max(dot(n, normalize(l + view)), 0.0), 60.0);
  float echo = pow(max(dot(n, normalize(opposite + view)), 0.0), 60.0);
  float fresnel = pow(1.0 - n.z, 3.0);
  float facing = dot(g, uLightDir);
  float rim = smoothstep(-1.6 * uDpr, 0.0, d) * (0.2 + 0.8 * facing * facing);
  col += uLight * (glint * 0.75 + echo * 0.3 + fresnel * 0.14 + rim * 0.6);

  vec3 inside = clamp(col, 0.0, 1.0) * mask;
  float rest = (1.0 - mask) * spill;
  outColor = vec4(inside + spillColor * rest, mask + rest);
}`;
