export async function checkRotation(check, wait) {
  const { attachGlass } = await import("/dist/index.js");
  const source = document.createElement("canvas");
  source.width = 640; source.height = 480;
  const context = source.getContext("2d");
  context.fillStyle = "#e8a42e";
  context.fillRect(0, 0, 640, 480);
  context.fillStyle = "#111";
  for (let x = 0; x < 640; x += 40) context.fillRect(x, 0, 8, 480);
  const glass = document.createElement("edinstvo-glass");
  glass.style.cssText = "position:fixed;left:280px;top:100px;width:180px;height:100px;border-radius:24px";
  glass.source = source;
  glass.material = { rotationY: 55, thickness: 6, frost: 0 };
  document.body.append(glass);
  const coverage = () => {
    const canvas = glass.shadowRoot.querySelector("canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) count++;
    return count;
  };
  try {
    await wait(300);
    check("rotated surface uses webgl", glass.dataset.engine === "webgl");
    const thin = coverage();
    glass.material = { ...glass.material, thickness: 64 };
    await wait(300);
    check("thickness changes projected volume", thin > 0 && coverage() > thin * 1.1);

    let contexts = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      if (kind === "webgl2") contexts++;
      return original.call(this, kind, ...args);
    };
    try {
      glass.setAttribute("rotatable", "");
      glass.material = { ...glass.material, rotationX: 20 };
      await wait(300);
      check("rotation shares existing webgl context", contexts === 0);
    } finally { HTMLCanvasElement.prototype.getContext = original; }
    glass.material = { ...glass.material, thickness: 0 };
    await wait(200);
    check("zero thickness keeps a visible tilted sheet", coverage() > 0);
    glass.removeAttribute("rotatable");
    check("removing rotatable restores touch handling", glass.style.touchAction === "");

    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:10px;top:10px;width:120px;height:80px;touch-action:pan-y";
    document.body.append(host);
    const attached = attachGlass(host, { source, rotatable: true, material: { rotationY: 30, thickness: 24 } });
    try {
      await wait(300);
      check("attachGlass supports rotation", host.dataset.engine === "webgl" && host.querySelector("canvas").width > 0);
      attached.set({ rotatable: false });
      check("attachGlass can disable drag independently", host.style.touchAction === "pan-y");
    } finally { attached.destroy(); host.remove(); }
  } finally { glass.remove(); }
}
