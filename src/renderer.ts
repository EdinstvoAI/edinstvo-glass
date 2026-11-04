import type { Backdrop, GlassImage } from "./backdrop.js";
import type { Material } from "./material.js";
import { fragment, vertex } from "./shader.js";

export interface DrawJob {
  target: CanvasRenderingContext2D;
  backdrop: Backdrop;
  width: number;
  height: number;
  pad: number;
  size: readonly [number, number];
  radius: number;
  dpr: number;
  uvOrigin: readonly [number, number];
  uvPerPixel: readonly [number, number];
  lightDir: readonly [number, number];
  tint: readonly [number, number, number];
  material: Material;
}

const uniformNames = ["uCanvas", "uSize", "uUvOrigin", "uUvPerPx", "uTexSize", "uLightDir", "uTint", "uViewY", "uPad", "uRadius", "uDpr", "uLight", "uTransparency", "uRefraction", "uDepth", "uDispersion", "uFrost", "uSplay", "uBloom"] as const;
const maxTextures = 8;
const maxTextureSide = 4096;

interface Texture { texture: WebGLTexture; width: number; height: number; frame: number }

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

  private compile() {
    const { gl } = this;
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type);
      if (!shader || !program) return false;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("@edinstvo/glass:", gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());
    gl.enable(gl.SCISSOR_TEST);
    for (const name of uniformNames) this.uniforms[name] = gl.getUniformLocation(program, name);
    return true;
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
      entry = { texture, width: 0, height: 0, frame: -1 };
      this.textures.set(backdrop.image, entry);
      if (this.textures.size > maxTextures) {
        const [oldest, stale] = this.textures.entries().next().value!;
        gl.deleteTexture(stale.texture);
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
    const texture = this.bind(job.backdrop);
    const viewY = canvas.height - height;
    gl.viewport(0, viewY, width, height);
    gl.scissor(0, viewY, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.uCanvas, width, height);
    gl.uniform2f(u.uSize, job.size[0], job.size[1]);
    gl.uniform2f(u.uUvOrigin, job.uvOrigin[0], job.uvOrigin[1]);
    gl.uniform2f(u.uUvPerPx, job.uvPerPixel[0], job.uvPerPixel[1]);
    gl.uniform2f(u.uTexSize, texture.width, texture.height);
    gl.uniform2f(u.uLightDir, job.lightDir[0], job.lightDir[1]);
    gl.uniform3f(u.uTint, job.tint[0], job.tint[1], job.tint[2]);
    gl.uniform1f(u.uViewY, viewY);
    gl.uniform1f(u.uPad, job.pad);
    gl.uniform1f(u.uRadius, job.radius);
    gl.uniform1f(u.uDpr, job.dpr);
    gl.uniform1f(u.uLight, m.light);
    gl.uniform1f(u.uTransparency, m.transparency);
    gl.uniform1f(u.uRefraction, m.refraction);
    gl.uniform1f(u.uDepth, m.depth);
    gl.uniform1f(u.uDispersion, m.dispersion);
    gl.uniform1f(u.uFrost, m.frost);
    gl.uniform1f(u.uSplay, m.splay);
    gl.uniform1f(u.uBloom, m.bloom);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // ── the drawing buffer is only valid until this task ends, so copy out right here
    job.target.clearRect(0, 0, width, height);
    job.target.drawImage(canvas, 0, 0, width, height, 0, 0, width, height);
  }
}
