export async function checkRendering(check, wait) {
  const { Renderer } = await import("/dist/renderer.js");
  const renderer = Renderer.shared, draw = renderer.draw;
  const source = document.createElement("canvas"); source.width = source.height = 128;
  source.getContext("2d").fillRect(0, 0, 128, 128);
  let diagnostic = 1;
  renderer.draw = function(job) { return draw.call(this, { ...job, diagnostic }); };
  const group = document.createElement("edinstvo-glass-group");
  group.style.cssText = "position:fixed;left:10px;top:10px;width:240px;height:140px";
  group.source = source;
  group.material = { depth: 96, thickness: 24, bloom: 0, glint: 0, rim: 0, frost: 0, refraction: 1, dispersion: 0, light: 0 };
  const first = document.createElement("edinstvo-glass"), second = document.createElement("edinstvo-glass");
  for (const [element, x] of [[first, 20], [second, 100]]) {
    element.style.cssText = `position:absolute;left:${x}px;top:15px;width:100px;height:100px;border-radius:50px`;
    element.setAttribute("merge", "28"); element.setAttribute("morph", "0");
    element.setAttribute("press", "0"); element.setAttribute("jelly", "0"); element.setAttribute("follow", "0");
    group.append(element);
  }
  document.body.append(group);
  const read = () => {
    const canvas = group.shadowRoot.querySelector("canvas");
    return { width: canvas.width, height: canvas.height, data: canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data };
  };
  try {
    await wait(250);
    const { width, height, data } = read();
    const dpr = Math.min(devicePixelRatio, 2);
    const margin = Math.ceil(4 * dpr);
    let maximum = 0, tested = 0;
    const at = (x, y, channel) => data[(y * width + x) * 4 + channel];
    for (let y = margin; y < height - margin; y++) for (let x = margin; x < width - margin; x++) {
      if ([[-margin, 0], [margin, 0], [0, -margin], [0, margin], [0, 0]].some(([dx, dy]) => at(x + dx, y + dy, 3) < 250)) continue;
      for (let channel = 0; channel < 3; channel++) maximum = Math.max(maximum, Math.abs(at(x, y, channel) - at(x + 1, y, channel)), Math.abs(at(x, y, channel) - at(x, y + 1, channel)));
      tested++;
    }
    window.renderMetrics = { dpr, normalJump: maximum, tested };
    check("merged interior normals remain continuous", tested > 100 && maximum < 32);

    diagnostic = 2; group.setAttribute("ior", "1"); await wait(150);
    const air = read().data;
    let error = 0;
    for (let i = 0; i < air.length; i += 4) if (air[i + 3] > 250) error = Math.max(error, Math.abs(air[i] - 128), Math.abs(air[i + 1] - 128));
    check("air IOR introduces no refraction", error <= 1);
    group.setAttribute("ior", "1.5"); await wait(150);
    check("glass IOR changes optical displacement", read().data.some((value, i) => i % 4 < 2 && air[i + 3 - i % 4] > 250 && Math.abs(value - air[i]) > 2));

    group.remove(); diagnostic = 1;
    const circle = document.createElement("edinstvo-glass");
    circle.style.cssText = "position:fixed;left:10px;top:10px;width:120px;height:120px";
    circle.source = source; circle.geometry = { shape: "circle" }; circle.material = { depth: 96, bloom: 0 };
    document.body.append(circle); await wait(150);
    const canvas = circle.shadowRoot.querySelector("canvas");
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let breaks = 0;
    const rowWidths = [];
    for (let y = 0; y < canvas.height; y++) {
      let entered = false, left = false, count = 0;
      for (let x = 0; x < canvas.width; x++) {
        const inside = pixels[(y * canvas.width + x) * 4 + 3] >= 128;
        if (inside) { if (left) breaks++; entered = true; count++; }
        else if (entered) left = true;
      }
      rowWidths.push(count);
    }
    check("curved contour contains no row gaps", breaks === 0 && rowWidths.some(value => value > 20));
    check("curved contour stays symmetric", rowWidths.every((value, y) => Math.abs(value - rowWidths[rowWidths.length - 1 - y]) <= 2));
    circle.geometry = { shape: "rounded-rect" };
    circle.style.width = "200px"; circle.style.height = "80px"; circle.style.borderRadius = "40px";
    circle.material = { depth: 96, thickness: 24, refraction: 1, bloom: 0, frost: 0, dispersion: 0 };
    diagnostic = 2; circle.invalidate(); await wait(200);
    const capsule = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let asymmetry = 0, jump = 0;
    const alpha = (x,y) => capsule[(y * canvas.width + x) * 4 + 3];
    for (let y = margin; y < canvas.height - margin; y++) for (let x = margin; x < canvas.width - margin; x++) {
      if ([[-margin,0],[margin,0],[0,-margin],[0,margin]].some(([dx,dy]) => alpha(x+dx,y+dy) < 250)) continue;
      const i = (y * canvas.width + x) * 4, mirrored = (y * canvas.width + canvas.width - 1 - x) * 4;
      asymmetry = Math.max(asymmetry, Math.abs(capsule[i] + capsule[mirrored] - 255));
      jump = Math.max(jump, Math.abs(capsule[i] - capsule[i + 4]), Math.abs(capsule[i + 1] - capsule[i + 5]));
    }
    window.renderMetrics.capsule = { asymmetry, jump };
    check("deep capsule displacement has no interior tears", jump < 16 && asymmetry <= 3);
    circle.remove();
  } finally { renderer.draw = draw; group.remove(); }
}
