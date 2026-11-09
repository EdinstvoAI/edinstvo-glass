import type { Backdrop, GlassImage } from "./backdrop.js";
import type { Material } from "./material.js";
import { blurFragment, fragment, vertex } from "./shader.js";

export const maxShapes = 64;

export interface DrawJob {
  target: CanvasRenderingContext2D;
  backdrop: Backdrop;
  width: number;
  height: number;
  pad: number;
  boxes: Float32Array;
  forms: Float32Array;
  count: number;
  peak: number;
  appear: number;
  touch: readonly [number, number, number];
  dpr: number;
  uvOrigin: readonly [number, number];
  uvPerPixel: readonly [number, number];
  lightDir: readonly [number, number];
  lightColor: readonly [number, number, number];
  tint: readonly [number, number, number];
  material: Material;
}

const uniformNames = ["uBoxes", "uForms", "uCount", "uCanvas", "uUvOrigin", "uUvPerPx", "uTexSize", "uLightDir", "uLightColor", "uLightSoftness", "uLightDiffusion", "uReflection", "uFlow", "uTint", "uTouch", "uViewY", "uPad", "uDpr", "uPeak", "uAppear", "uLight", "uTransparency", "uThickness", "uRefraction", "uDepth", "uDispersion", "uFrost", "uSplay", "uBloom", "uGlint", "uRim", "uLift"] as const;
const maxTextures = 8;
const maxTextureSide = 4096;

interface Blur { texture: WebGLTexture; frame: number }
interface Texture { texture: WebGLTexture; width: number; height: number; frame: number; blurs: Map<number, Blur> }

export class Renderer {
  private static instance: Renderer | null | undefined;
  static get shared() {
    if (Renderer.instance === undefined) {
      const renderer = new Renderer();
      Renderer.instance = renderer.setup() ? renderer : null;
    }
    return Renderer.instance;
  }

  onRestore: (() => void) | null = null;
  private canvas = document.createElement("canvas");
  private gl!: WebGL2RenderingContext;
  private uniforms = {} as Record<(typeof uniformNames)[number], WebGLUniformLocation | null>;
  private textures = new Map<GlassImage, Texture>();
  private frame = 0;
  private lens!: WebGLProgram;
  private blurProgram!: WebGLProgram;
  private frameBuffer: WebGLFramebuffer | null = null;
  private lost = false;

  private setup() {
    const gl = this.canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return false;
    this.gl = gl;
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      this.textures.clear();
      this.compile();
      this.onRestore?.();
    });
    return this.compile();
  }

  private link(source: string) {
    const { gl } = this;
    const program = gl.createProgram();
    for (const [type, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, source]] as const) {
      const shader = gl.createShader(type);
      if (!shader || !program) return null;
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
    console.warn("@edinstvo/glass:", gl.getProgramInfoLog(program));
    return null;
  }

  private compile() {
    const { gl } = this;
    const lens = this.link(fragment);
    const blur = this.link(blurFragment);
    if (!lens || !blur) return false;
    this.lens = lens;
    this.blurProgram = blur;
    this.frameBuffer = gl.createFramebuffer();
    gl.bindVertexArray(gl.createVertexArray());
    gl.enable(gl.SCISSOR_TEST);
    gl.useProgram(blur);
    gl.uniform1i(gl.getUniformLocation(blur, "uSource"), 0);
    gl.useProgram(lens);
    gl.uniform1i(gl.getUniformLocation(lens, "uBackdrop"), 0);
    gl.uniform1i(gl.getUniformLocation(lens, "uFrosted"), 1);
    for (const name of uniformNames) this.uniforms[name] = gl.getUniformLocation(lens, name);
    return true;
  }

  private target(width: number, height: number) {
    const { gl } = this;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    return texture;
  }

  private pass(source: WebGLTexture, destination: WebGLTexture, width: number, height: number, step: readonly [number, number], lod: number) {
    const { gl, blurProgram: program } = this;
    const u = (name: string) => gl.getUniformLocation(program, name);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, destination, 0);
    gl.viewport(0, 0, width, height);
    gl.scissor(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform2f(u("uStep"), step[0], step[1]);
    gl.uniform2f(u("uInvSize"), 1 / width, 1 / height);
    gl.uniform1f(u("uLod"), lod);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Gaussian at a size where sigma is 3 texels, so any strength costs the same 17 taps per axis. */
  private blurred(entry: Texture, sigma: number) {
    const { gl } = this;
    const key = Math.round(sigma * 4) / 4;
    const cached = entry.blurs.get(key);
    if (cached && cached.frame === entry.frame) return cached.texture;
    if (cached) gl.deleteTexture(cached.texture);
    if (entry.blurs.size >= 4 && !cached) {
      const [oldest, stale] = entry.blurs.entries().next().value!;
      gl.deleteTexture(stale.texture);
      entry.blurs.delete(oldest);
    }
    const scale = Math.min(1, 3 / Math.max(key, 0.25));
    const width = Math.max(4, Math.ceil(entry.width * scale));
    const height = Math.max(4, Math.ceil(entry.height * scale));
    const across = this.target(width, height);
    const result = this.target(width, height);
    gl.useProgram(this.blurProgram);
    this.pass(entry.texture, across, width, height, [1 / width, 0], Math.log2(1 / scale));
    this.pass(across, result, width, height, [0, 1 / height], 0);
    gl.deleteTexture(across);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.lens);
    entry.blurs.set(key, { texture: result, frame: entry.frame });
    return result;
  }

  nextFrame() {
    this.frame++;
  }

  private shrink(backdrop: Backdrop): TexImageSource {
    const limit = Math.min(maxTextureSide, this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));
    const scale = limit / Math.max(backdrop.width, backdrop.height);
    if (scale >= 1) return backdrop.image;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(backdrop.width * scale);
    canvas.height = Math.round(backdrop.height * scale);
    canvas.getContext("2d")!.drawImage(backdrop.image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  private bind(backdrop: Backdrop) {
    const { gl } = this;
    let entry = this.textures.get(backdrop.image);
    if (entry) {
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      if (!backdrop.live || entry.frame === this.frame) return entry;
    } else {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      entry = { texture, width: 0, height: 0, frame: -1, blurs: new Map() };
      this.textures.set(backdrop.image, entry);
      if (this.textures.size > maxTextures) {
        const [oldest, stale] = this.textures.entries().next().value!;
        gl.deleteTexture(stale.texture);
        for (const blur of stale.blurs.values()) gl.deleteTexture(blur.texture);
        this.textures.delete(oldest);
      }
    }
    const pixels = this.shrink(backdrop);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.generateMipmap(gl.TEXTURE_2D);
    entry.width = backdrop.width;
    entry.height = backdrop.height;
    entry.frame = this.frame;
    return entry;
  }

  /** Throws on a tainted source: a cross-origin image without CORS headers can't reach the GPU. */
  draw(job: DrawJob) {
    if (this.lost) return;
    const { gl, canvas, uniforms: u } = this;
    const { width, height, material: m } = job;
    if (canvas.width < width || canvas.height < height) {
      canvas.width = Math.max(canvas.width, width);
      canvas.height = Math.max(canvas.height, height);
    }
    gl.activeTexture(gl.TEXTURE0);
    const texture = this.bind(job.backdrop);
    if (m.frost > 0) {
      const texels = Math.max(job.uvPerPixel[0] * texture.width, job.uvPerPixel[1] * texture.height);
      const frosted = this.blurred(texture, m.frost * 20 * job.dpr * texels);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, frosted);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
    }
    const viewY = canvas.height - height;
    gl.viewport(0, viewY, width, height);
    gl.scissor(0, viewY, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.uCanvas, width, height);
    gl.uniform4fv(u.uBoxes, job.boxes);
    gl.uniform2fv(u.uForms, job.forms);
    gl.uniform1i(u.uCount, job.count);
    gl.uniform1f(u.uPeak, job.peak);
    gl.uniform1f(u.uAppear, job.appear);
    gl.uniform3f(u.uTouch, job.touch[0], job.touch[1], job.touch[2]);
    gl.uniform2f(u.uUvOrigin, job.uvOrigin[0], job.uvOrigin[1]);
    gl.uniform2f(u.uUvPerPx, job.uvPerPixel[0], job.uvPerPixel[1]);
    gl.uniform2f(u.uTexSize, texture.width, texture.height);
    gl.uniform2f(u.uLightDir, job.lightDir[0], job.lightDir[1]);
    gl.uniform3f(u.uTint, job.tint[0], job.tint[1], job.tint[2]);
    gl.uniform1f(u.uViewY, viewY);
    gl.uniform1f(u.uPad, job.pad);
    gl.uniform1f(u.uDpr, job.dpr);
    gl.uniform1f(u.uLight, m.light);
    gl.uniform3f(u.uLightColor, job.lightColor[0], job.lightColor[1], job.lightColor[2]);
    gl.uniform1f(u.uLightSoftness, m.lightSoftness);
    gl.uniform1f(u.uLightDiffusion, m.lightDiffusion);
    gl.uniform1f(u.uReflection, m.reflection);
    gl.uniform1f(u.uFlow, m.dynamicRefraction);
    gl.uniform1f(u.uTransparency, m.transparency);
    gl.uniform1f(u.uThickness, m.thickness);
    gl.uniform1f(u.uRefraction, m.refraction);
    gl.uniform1f(u.uDepth, m.depth);
    gl.uniform1f(u.uDispersion, m.dispersion);
    gl.uniform1f(u.uFrost, m.frost);
    gl.uniform1f(u.uSplay, m.splay);
    gl.uniform1f(u.uBloom, m.bloom);
    gl.uniform1f(u.uGlint, m.glint);
    gl.uniform1f(u.uRim, m.rim);
    gl.uniform1f(u.uLift, m.lift);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // ── the drawing buffer is only valid until this task ends, so copy out right here
    job.target.clearRect(0, 0, width, height);
    job.target.drawImage(canvas, 0, 0, width, height, 0, 0, width, height);
  }
}
