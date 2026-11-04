<div align="center">

<h1>@edinstvo/glass</h1>

<p><b>Real glass for the web. One material, the same on macOS and Windows.</b></p>

<p>
A WebGL lens with refraction, dispersion, frost and light,<br>
wrapped in a single web component that works in any framework.
</p>

<p>
<a href="https://www.npmjs.com/package/@edinstvo/glass"><img src="https://img.shields.io/npm/v/@edinstvo/glass?style=for-the-badge&labelColor=000000&color=1a1a1a&label=npm" alt="npm version"></a>
<img src="https://img.shields.io/badge/WebGL-2-1a1a1a?style=for-the-badge&labelColor=000000&logo=webgl&logoColor=white" alt="WebGL 2">
<img src="https://img.shields.io/badge/dependencies-0-1a1a1a?style=for-the-badge&labelColor=000000" alt="Zero dependencies">
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1a1a1a?style=for-the-badge&labelColor=000000" alt="MIT license"></a>
</p>

<p>
<a href="#install"><b>Install</b></a>
&nbsp;·&nbsp;
<a href="#material">Material</a>
&nbsp;·&nbsp;
<a href="#backdrop">Backdrop</a>
&nbsp;·&nbsp;
<a href="#limits">Limits</a>
</p>

</div>

<br>

## Principles

> **Optics, not blur.** Light bends through a curved edge by Snell's law, so glass behaves like glass
> instead of a tinted rectangle.
>
> **Quiet by default.** A frame is drawn only when something changes. Nothing on screen moves, nothing
> runs on the GPU.
>
> **One context.** Every element on the page shares a single WebGL context, however many there are.

## Install

```bash
npm i @edinstvo/glass
```

```html
<script type="module">
  import "@edinstvo/glass/define";
</script>

<edinstvo-glass frost="0.4" refraction="0.5">
  Hello
</edinstvo-glass>
```

The corner radius comes from CSS `border-radius`, the size from your layout. Everything else is optional.

Not a fan of custom elements? Attach glass to any node:

```js
import { attachGlass } from "@edinstvo/glass";

const glass = attachGlass(element, { material: { frost: 0.7 } });
glass.set({ material: { frost: 0.4 } });
glass.destroy();
```

## Material

There are no types of glass, only settings. Set anything with an attribute, a `--glass-*` CSS variable or the `material` property. The defaults are tuned against the system glass on macOS, pixel by pixel.

| Attribute | Range | What it does |
|---|---|---|
| `refraction` | 0 to 1 | How hard the edge bends what is behind it |
| `depth` | 0 to 96 px | Width of the curved edge |
| `splay` | 0 to 1 | Spreads the curve from the edge towards the centre |
| `dispersion` | 0 to 1 | How far colours split wherever the glass bends |
| `frost` | 0 to 1 | Matte surface, a true gaussian up to 20 px |
| `transparency` | 0 to 1 | How much of the backdrop survives the tint |
| `tint` | any CSS colour | Glass colour. `auto` follows the theme |
| `lift` | 0 to 1 | Brightens everything behind the glass |
| `light` | 0 to 1 | Shading across the curve, bright towards the light and dark away from it |
| `rim` | 0 to 1 | Thin light line along the edge, brightest in line with the light |
| `glint` | 0 to 1 | Sharp highlight along the edge. Off in every preset |
| `light-angle` | -180 to 180° | Where the light comes from. 0 is the top |
| `bloom` | 0 to 1 | Glow inside the glass and around it |

## Motion

Change an element's size or position in CSS and the glass flows there with a spring, overshoot included.
Each of these is its own setting, on a group or on a single child. `prefers-reduced-motion` turns them all off.

| Attribute | Range | What it does |
|---|---|---|
| `morph` | 0 to 1 | Softness of the flow. 0 jumps straight to the new shape |
| `jelly` | 0 to 1 | Stretch while moving and under a drag |
| `press` | 0 to 1 | How much the glass swells when held |
| `glow` | 0 to 1 | Light that spreads from under the finger |
| `follow` | 0 to 1 | How far the light chases the pointer |
| `merge` | 0 to 64 px | Melts this element into others that have it too. 0 stays separate |

### Merge

Merging is opt-in, per element. Give `merge` to the pieces that should become one shape: they melt together when they get close and pull apart like liquid. Everything else in the group stays separate.

```html
<edinstvo-glass-group>
  <edinstvo-glass merge="28"></edinstvo-glass>
  <edinstvo-glass merge="28"></edinstvo-glass>
  <edinstvo-glass></edinstvo-glass>
</edinstvo-glass-group>
```

Up to 64 merged shapes per group, all drawn in one pass. Pieces without `merge` are bodies of their own and slide over the rest. `merge` on the group sets it for every child, `merge="0"` on a child opts out.

### Appear

Add `appear` to materialise on load, or call `show()` and `hide()`. Both return a promise.

## Layers

Glass sees the glass under it. `layer` picks who is on top, higher wins. It is `z-index` with a shorter name, so plain `z-index` works too. On a tie the later element in the document is on top.

```html
<edinstvo-glass layer="1"></edinstvo-glass>
<edinstvo-glass layer="2"></edinstvo-glass>
```

## Backdrop

WebGL can't read the pixels of a page, so glass needs to be told what is behind it.
With `source="auto"` it looks for itself: the nearest `<img>`, `<video>`, `<canvas>`, CSS `url()` background
or solid colour under the element.

```html
<edinstvo-glass source="#scene"></edinstvo-glass>
```

```js
glass.source = canvas;
glass.invalidate();
```

A playing video updates on its own. For a canvas you draw on, call `invalidate()` after drawing or set `live`.

## Plain CSS

No JavaScript, or no GPU? `@edinstvo/glass/glass.css` gives you `.glass`, `.glass-clear` and `.glass-frost`
on top of `backdrop-filter`. The element falls back to the same look by itself when WebGL is missing.

## Limits

- Text and regular DOM behind the glass aren't refracted, only the sources listed above. Draw them to a canvas if you need them.
- CSS gradients aren't read yet. Glass skips them and looks further down the stack.
- Cross-origin images need CORS headers, otherwise that element falls back to CSS.

## Development

```bash
npm run demo
```

```bash
npm test
```

## License

[MIT](LICENSE)
