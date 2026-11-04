const shots = new WeakMap<Element, Shot>();
const inlined = new Map<string, Promise<string>>();

interface Shot {
  canvas: HTMLCanvasElement | null;
  failed: boolean;
  waiting: Set<() => void>;
  watcher?: MutationObserver;
}

const isGlass = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest("[data-engine]") != null;

function inline(url: string) {
  let found = inlined.get(url);
  if (!found) {
    found = fetch(url)
      .then((response) => response.blob())
      .then((blob) => new Promise<string>((done) => {
        const reader = new FileReader();
        reader.onload = () => done(String(reader.result));
        reader.readAsDataURL(blob);
      }))
      .catch(() => url);
    inlined.set(url, found);
  }
  return found;
}

async function inlineUrls(css: string, base: string) {
  let result = css;
  for (const [match, url] of css.matchAll(/url\(["']?(?!data:)(.+?)["']?\)/g)) {
    result = result.replace(match, `url("${await inline(new URL(url, base).href)}")`);
  }
  return result;
}

async function fontFaces() {
  const faces: string[] = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSFontFaceRule) faces.push(await inlineUrls(rule.cssText, sheet.href ?? location.href));
      }
    } catch {
      continue;
    }
  }
  return faces.join("");
}

async function copy(from: Element, content: boolean): Promise<Element> {
  const to = from.cloneNode(false) as Element;
  const style = getComputedStyle(from);
  let css = "";
  for (const key of style) css += `${key}:${style.getPropertyValue(key)};`;
  to.setAttribute("style", await inlineUrls(css, location.href));
  to.removeAttribute("id");

  if (from instanceof HTMLImageElement && from.currentSrc) to.setAttribute("src", await inline(from.currentSrc));
  if (from instanceof HTMLCanvasElement) {
    const image = document.createElement("img");
    image.setAttribute("style", to.getAttribute("style")!);
    image.src = from.toDataURL();
    return image;
  }
  if (!content) return to;
  for (const child of from.childNodes) {
    if (child instanceof Element) {
      if (!child.hasAttribute("data-engine")) to.append(await copy(child, true));
    } else if (child.nodeType === Node.TEXT_NODE) {
      to.append(child.cloneNode());
    }
  }
  return to;
}

async function render(element: Element, content: boolean) {
  const { width, height } = element.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio || 1, 2);
  const clone = await copy(element, content);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  (clone as HTMLElement).style.margin = "0";
  (clone as HTMLElement).style.position = "static";
  const body = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><style>${await fontFaces()}</style><foreignObject width="100%" height="100%">${body}</foreignObject></svg>`;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(Math.round(width * scale), 1);
  canvas.height = Math.max(Math.round(height * scale), 1);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.getImageData(0, 0, 1, 1);
  return canvas;
}

function refresh(element: Element, shot: Shot, content: boolean) {
  render(element, content)
    .then((canvas) => {
      shot.canvas = canvas;
      shot.failed = false;
    })
    .catch((error) => {
      console.warn("@edinstvo/glass: can't capture this element.", error);
      shot.failed = true;
    })
    .finally(() => {
      for (const notify of shot.waiting) notify();
    });
}

export function captured(element: Element, content: boolean, onReady: () => void) {
  let shot = shots.get(element);
  if (!shot) {
    const created: Shot = { canvas: null, failed: false, waiting: new Set() };
    shot = created;
    shots.set(element, created);
    let timer = 0;
    const later = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => refresh(element, created, content), 120);
    };
    created.watcher = new MutationObserver((changes) => {
      if (!changes.every((change) => isGlass(change.target))) later();
    });
    created.watcher.observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
    new ResizeObserver(later).observe(element);
    refresh(element, created, content);
  }
  shot.waiting.add(onReady);
  if (shot.failed) throw new Error("This browser can't capture this element.");
  return shot.canvas;
}
