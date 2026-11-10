export async function checkMergeBlur(check, wait) {
  const scene = new DOMParser().parseFromString(await (await fetch("/demo/index.html")).text(), "text/html");
  check("bench does not disable group blur", scene.querySelector("#group").getAttribute("frost") !== "0");
  const source = document.createElement("canvas"); source.width = 512; source.height = 256;
  const context = source.getContext("2d");
  context.fillStyle = "white"; context.fillRect(0, 0, 512, 256);
  for (let x = 0; x < 512; x += 8) { context.fillStyle = "black"; context.fillRect(x, 0, 4, 256); }
  const group = document.createElement("edinstvo-glass-group");
  group.style.cssText = "position:fixed;left:20px;top:20px;width:260px;height:120px;z-index:9999";
  group.source = source;
  group.material = { frost: 0.7, transparency: 1, refraction: 0, dispersion: 0, bloom: 0, rim: 0, light: 0, lift: 0 };
  const first = document.createElement("edinstvo-glass"), second = document.createElement("edinstvo-glass");
  for (const [element, x] of [[first, 0], [second, 180]]) {
    element.source = source;
    element.style.cssText = `position:absolute;left:${x}px;top:0;width:120px;height:100px;border-radius:24px`;
    element.setAttribute("merge", "0");
    for (const key of ["morph", "jelly", "follow", "press", "glow"]) element.setAttribute(key, "0");
    group.append(element);
  }
  const variation = (host) => {
    const canvas = host.shadowRoot.querySelector("canvas"), dpr = Math.min(devicePixelRatio, 2);
    const y = Math.round((50 - parseFloat(canvas.style.top)) * dpr);
    const x = Math.round((35 - parseFloat(canvas.style.left)) * dpr);
    const data = canvas.getContext("2d").getImageData(x, y, 50 * dpr, 1).data;
    let low = 255, high = 0;
    for (let i = 0; i < data.length; i += 4) { low = Math.min(low, data[i]); high = Math.max(high, data[i]); }
    return high - low;
  };
  document.body.append(group);
  try {
    await wait(200);
    const standalone = variation(first);
    first.setAttribute("merge", "28"); second.setAttribute("merge", "28");
    await wait(200);
    const separate = variation(group);
    second.style.left = "90px"; group.invalidate();
    await wait(250);
    const joined = variation(group);
    group.material = { ...group.material, frost: 0 };
    await wait(150);
    const clear = variation(group);
    window.mergeBlurMetrics = { standalone, separate, joined, clear };
    check("blur survives joining and connecting surfaces", standalone < 35 && separate < 35 && joined < 35 && clear > 100);
  } finally { group.remove(); }
}
