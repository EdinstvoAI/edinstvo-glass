export async function checkBackdrop(check, wait) {
  const source = document.createElement("canvas"); source.width = 120; source.height = 80;
  source.style.cssText = "position:fixed;left:420px;top:20px;width:120px;height:80px;z-index:100";
  source.getContext("2d").fillRect(0, 0, 120, 80);
  const glass = document.createElement("edinstvo-glass");
  glass.style.cssText = "position:fixed;left:420px;top:20px;width:120px;height:80px;z-index:101";
  glass.material = { frost: 0, refraction: 0, dispersion: 0, light: 0, bloom: 0, rim: 0, lift: 0, transparency: 1 };
  glass.setAttribute("morph", "0");
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;left:420px;top:20px;width:120px;height:80px;background:white;z-index:102";
  document.body.append(source, glass, overlay);
  try {
    await wait(200);
    const canvas = glass.shadowRoot.querySelector("canvas"), dpr = Math.min(devicePixelRatio, 2);
    const pixel = canvas.getContext("2d").getImageData(92 * dpr, 72 * dpr, 1, 1).data;
    check("foreground panels cannot become a glass backdrop", pixel[0] < 10 && pixel[1] < 10 && pixel[2] < 10 && pixel[3] > 240);
    for (const element of [source, glass, overlay]) element.style.left = `${innerWidth - 40}px`;
    glass.invalidate(); await wait(200);
    const partial = glass.shadowRoot.querySelector("canvas").getContext("2d").getImageData(92 * dpr, 72 * dpr, 1, 1).data;
    check("partly offscreen surfaces keep their actual backdrop", partial[0] < 10 && partial[3] > 240);
  } finally { source.remove(); glass.remove(); overlay.remove(); }
}
