export async function checkAdaptation(check, wait) {
  const { setSceneMaterial } = await import("/dist/index.js");
  const source = document.createElement("canvas");
  source.width = source.height = 64;
  const context = source.getContext("2d");
  const paint = color => { context.fillStyle = color; context.fillRect(0, 0, 64, 64); };
  paint("white");
  const glass = document.createElement("edinstvo-glass");
  glass.style.cssText = "position:fixed;left:20px;top:200px;width:160px;height:90px";
  glass.source = source;
  glass.setAttribute("adaptation-duration", "0");
  glass.textContent = "Adaptive glass";
  document.body.append(glass);
  try {
    await wait(200);
    check("adaptation stays off by default", !glass.hasAttribute("data-glass-contrast"));
    setSceneMaterial({ adaptation: "full" });
    await wait(250);
    check("scene material enables adaptation", Number(glass.dataset.glassContrast) >= 4.49);
    check("light backdrop gets dark foreground", glass.style.getPropertyValue("--glass-foreground") === "rgb(0 0 0)");
    paint("black"); glass.invalidate(); await wait(250);
    check("dark backdrop gets light foreground", glass.style.getPropertyValue("--glass-foreground") === "rgb(255 255 255)");
    glass.setAttribute("adaptation", "off");
    await wait(150);
    check("local off overrides scene adaptation", !glass.hasAttribute("data-glass-contrast") && !glass.style.getPropertyValue("--glass-foreground"));
    setSceneMaterial(null);
    glass.style.color = "white"; paint("white");
    glass.setAttribute("adaptation-duration", "300");
    glass.setAttribute("adaptation", "full");
    await wait(80);
    check("adaptation interpolates instead of switching instantly", glass.hasAttribute("data-glass-adapting") && glass.style.getPropertyValue("--glass-foreground") !== "rgb(0 0 0)");
    await wait(1100);
    check("adaptive animation settles", !glass.hasAttribute("data-glass-adapting"));
    const { Renderer } = await import("/dist/renderer.js");
    const renderer = Renderer.shared, draw = renderer.draw;
    let draws = 0;
    renderer.draw = function(job) { if (job.target.canvas === glass.shadowRoot.querySelector("canvas")) draws++; return draw.call(this, job); };
    try { await wait(200); check("settled adaptation stops drawing", draws === 0); }
    finally { renderer.draw = draw; }
  } finally { setSceneMaterial(null); glass.remove(); }
}
