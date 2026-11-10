export async function checkGeometry(check, wait) {
  const { parseColor } = await import("/dist/color.js");
  const alphaColor = parseColor("rgba(255, 0, 0, .5)");
  check("translucent color channels are not amplified", Math.abs(alphaColor[0] - 1) < 0.01 && Math.abs(alphaColor[3] - 0.5) < 0.01);
  const source = document.createElement("canvas"); source.width = source.height = 64;
  source.getContext("2d").fillRect(0, 0, 64, 64);
  const glass = document.createElement("edinstvo-glass");
  glass.style.cssText = "position:fixed;left:260px;top:200px;width:160px;height:100px";
  glass.material = { bloom: 0, frost: 0, light: 0, depth: 80 };
  glass.source = source; document.body.append(glass);
  const alpha = (x, y) => {
    const canvas = glass.shadowRoot.querySelector("canvas"), dpr = Math.min(devicePixelRatio, 2);
    return canvas.getContext("2d").getImageData(Math.round((32 + x) * dpr), Math.round((32 + y) * dpr), 1, 1).data[3];
  };
  try {
    for (const shape of ["ellipse", "circle", "superellipse"]) {
      glass.geometry = { shape, curvature: 4 }; await wait(120);
      check(`${shape} renders its own outline`, alpha(80, 50) > 240 && alpha(2, 2) < 40 && glass.dataset.engine === "webgl");
    }
    glass.geometry = { shape: "path", path: "M0 0H100V100H0Z M25 25V75H75V25Z" };
    await wait(160);
    check("SVG path preserves holes", alpha(80, 50) < 40 && alpha(15, 50) > 240);
    glass.geometry = { shape: "path", path: "M50 0L100 100H0Z" }; await wait(160);
    check("SVG path uses updated contours", alpha(80, 50) > 240 && alpha(5, 5) < 40);
    let uploads = 0;
    const original = WebGL2RenderingContext.prototype.texImage2D;
    WebGL2RenderingContext.prototype.texImage2D = function(...args) { if (args[8] instanceof Uint8Array) uploads++; return original.apply(this, args); };
    try {
      for (let i = 0; i < 3; i++) { glass.invalidate(); await wait(40); }
      check("unchanged SVG fields stay on the GPU", uploads === 0);
    } finally { WebGL2RenderingContext.prototype.texImage2D = original; }
  } finally { glass.remove(); }
}
