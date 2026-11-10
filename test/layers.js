export async function checkLayers(check, wait) {
  const source = document.createElement("canvas"); source.width = source.height = 64;
  const context = source.getContext("2d"); context.fillStyle = "white"; context.fillRect(0, 0, 64, 64);
  const layers = [];
  try {
    for (let i = 0; i < 10; i++) {
      const glass = document.createElement("edinstvo-glass");
      glass.style.cssText = `position:fixed;left:420px;top:150px;width:100px;height:70px;z-index:${500+i}`;
      glass.material = { transparency: i === 0 ? 0 : 1, tint: "#00ff00", ior: 1, refraction: 0, dispersion: 0, bloom: 0, light: 0, lift: 0, frost: 0, rim: 0 };
      glass.source = source; layers.push(glass); document.body.append(glass);
    }
    await wait(200);
    const canvas = layers.at(-1).shadowRoot.querySelector("canvas"), dpr = Math.min(devicePixelRatio, 2);
    const pixel = canvas.getContext("2d").getImageData(82 * dpr, 67 * dpr, 1, 1).data;
    check("ten overlapping surfaces retain their lower layers", pixel[0] < 20 && pixel[1] > 230 && pixel[2] < 20 && pixel[3] > 240);
  } finally { layers.forEach(layer => layer.remove()); }
}
