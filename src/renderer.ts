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
const maxTextures = 32;
const maxTextureBytes = 64 * 1024 * 1024;
const maxTextureSide = 4096;

interface Blur { texture: WebGLTexture; across: WebGLTexture; width: number; height: number; frame: number }
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
  private strokeUniform: WebGLUniformLocation | null = null;
  private blurUniforms = {} as Record<"uStep" | "uInvSize" | "uLod", WebGLUniformLocation | null>;
  private downsample = document.createElement("canvas");
  private textureLimit = maxTextureSide;
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
    this.textureLimit = Math.min(maxTextureSide, gl.getParameter(gl.MAX_TEXTURE_SIZE));
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
      gl.deleteShader(shader);
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
    this.strokeUniform = gl.getUniformLocation(lens, "uStrokeThickness");
    for (const name of ["uStep", "uInvSize", "uLod"] as const) this.blurUniforms[name] = gl.getUniformLocation(blur, name);
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
    const { gl } = this;
    const u = this.blurUniforms;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, destination, 0);
    gl.viewport(0, 0, width, height);
    gl.scissor(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform2f(u.uStep, step[0], step[1]);
    gl.uniform2f(u.uInvSize, 1 / width, 1 / height);
    gl.uniform1f(u.uLod, lod);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Gaussian at a size where sigma is 3 texels, so any strength costs the same 17 taps per axis. */
  private blurred(entry: Texture, sigma: number) {
    const { gl } = this;
    const key = Math.round(sigma * 4) / 4;
    const cached = entry.blurs.get(key);
    if (cached && cached.frame === entry.frame) return cached.texture;
    if (cached) { entry.blurs.delete(key); entry.blurs.set(key, cached); }
    if (entry.blurs.size >= 4 && !cached) {
      const [oldest, stale] = entry.blurs.entries().next().value!;
      gl.deleteTexture(stale.texture);
      gl.deleteTexture(stale.across);
      entry.blurs.delete(oldest);
    }
    const scale = Math.min(1, 3 / Math.max(key, 0.25));
    const width = Math.max(4, Math.ceil(entry.width * scale));
    const height = Math.max(4, Math.ceil(entry.height * scale));
    let blur = cached;
    if (!blur || blur.width !== width || blur.height !== height) {
      if (blur) { gl.deleteTexture(blur.texture); gl.deleteTexture(blur.across); }
      blur = { texture: this.target(width, height), across: this.target(width, height), width, height, frame: -1 };
    }
    gl.useProgram(this.blurProgram);
    this.pass(entry.texture, blur.across, width, height, [1 / width, 0], Math.log2(1 / scale));
    this.pass(blur.across, blur.texture, width, height, [0, 1 / height], 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.lens);
    blur.frame = entry.frame;
    entry.blurs.set(key, blur);
    if (!cached) this.trim(entry);
    return blur.texture;
  }

  private trim(keep: Texture) {
    let bytes = 0;
    for (const entry of this.textures.values()) {
      bytes += entry.width * entry.height * 16 / 3;
      for (const blur of entry.blurs.values()) bytes += blur.width * blur.height * 8;
    }
    for (const [image, entry] of this.textures) {
      if (this.textures.size <= maxTextures && bytes <= maxTextureBytes) break;
      if (entry === keep) continue;
      this.gl.deleteTexture(entry.texture);
      bytes -= entry.width * entry.height * 16 / 3;
      for (const blur of entry.blurs.values()) {
        bytes -= blur.width * blur.height * 8;
        this.gl.deleteTexture(blur.texture); this.gl.deleteTexture(blur.across);
      }
      this.textures.delete(image);
    }
  }

  nextFrame() {
    this.frame++;
  }

  private shrink(backdrop: Backdrop): TexImageSource {
    const limit = this.textureLimit;
    const scale = limit / Math.max(backdrop.width, backdrop.height);
    if (scale >= 1) return backdrop.image;
    const canvas = this.downsample;
    const width = Math.round(backdrop.width * scale), height = Math.round(backdrop.height * scale);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    canvas.getContext("2d")!.drawImage(backdrop.image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  private bind(backdrop: Backdrop) {
    const { gl } = this;
    let entry = this.textures.get(backdrop.image);
    if (entry) {
      this.textures.delete(backdrop.image); this.textures.set(backdrop.image, entry);
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
    }
    const pixels = this.shrink(backdrop);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.generateMipmap(gl.TEXTURE_2D);
    const width = pixels === this.downsample ? this.downsample.width : backdrop.width;
    const height = pixels === this.downsample ? this.downsample.height : backdrop.height;
    const sizeChanged = entry.width !== width || entry.height !== height;
    entry.width = width;
    entry.height = height;
    entry.frame = this.frame;
    if (sizeChanged) this.trim(entry);
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
    gl.uniform1f(this.strokeUniform, m.strokeThickness);
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
