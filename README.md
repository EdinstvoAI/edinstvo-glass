<img src="logo.png" alt="Edinstvo Glass" width="148">

Edinstvo Glass is a simple library for real glass on the web.

At its core is a WebGL lens that bends light through a curved edge, splits colours and frosts what is behind it, the same on macOS and Windows. It comes as one web component with no dependencies.

## Documentation

See the full documentation, with a playground and examples, at [glass.makark.ru/docs](https://glass.makark.ru/docs/).

## npm

To install from npm:

```bash
npm i @edinstvo/glass
```

```html
<script type="module">
  import "@edinstvo/glass/define";
</script>

<edinstvo-glass frost="0.4" refraction="0.5">Hello</edinstvo-glass>
```

## Exports

- `@edinstvo/glass` - `attachGlass`, the element classes, defaults and ranges of every setting.
- `@edinstvo/glass/define` - Registers `edinstvo-glass` and `edinstvo-glass-group`.
- `@edinstvo/glass/glass.css` - Base materials on `backdrop-filter`, for pages without JavaScript or a GPU.

## Contributing

Edinstvo Glass is open source and we appreciate issue reports and pull requests.

### Setting up for development

Initialize the repo:

```bash
git clone https://github.com/EdinstvoAI/edinstvo-glass.git
cd edinstvo-glass
npm ci
```

Run the bench:

```bash
npm run demo
```

Click a glass element to select it. The outline and inspector heading show the current target, and the controls read its settings. Merged shapes share one material: select **Edit group material** to edit that surface, or edit motion on the individual shape. Unmerged elements can have their own material settings.

Test:

```bash
npm test
```

## License

[MIT](LICENSE)

## Thickness

`thickness` sets the optical distance between the front and back surfaces in CSS pixels, from `0` to `96` (default `6`). `depth` controls the curved surface profile. `strokeThickness` independently sets the visible rim width, from `0` to `8` CSS pixels (default `1`).

```html
<edinstvo-glass thickness="18" stroke-thickness="1" refraction="0.45">Content</edinstvo-glass>
```

A local material layer can override each property independently; `inherit` keeps the parent value and `default` restores the engine default. Refraction uses the travel distance through an approximated curved front surface and a flat back surface, with a fixed refractive index. This models optical volume under an orthographic view; it does not provide a rotatable 3D mesh, multiple internal reflections or ray tracing through a solid.

## Lighting

Set the light once for the page. Any element can replace one setting and keep the rest.

```js
import { setSceneLight } from "@edinstvo/glass";

setSceneLight({ direction: "top-left", intensity: "80%", color: "white", softness: 0.6 });
```

```html
<edinstvo-glass light-color="blue" reflection="0.6" dynamic-refraction="0.5"></edinstvo-glass>
```

See [Lighting](https://glass.makark.ru/docs/lighting/).

## Background adaptation

Adaptation is off by default. Enable it per element or once for the scene:

```js
import { setSceneMaterial } from "@edinstvo/glass";
setSceneMaterial({ adaptation: "full", adaptationStrength: 1 });
```

```html
<edinstvo-glass adaptation="contrast">Readable text</edinstvo-glass>
<edinstvo-glass adaptation="off" tint="#fff">Manual material</edinstvo-glass>
```

| Mode | What changes |
| --- | --- |
| `off` | No background analysis; all material values stay manual |
| `tint` | An automatic tint follows the local light/dark background; text stays under application control |
| `contrast` | Automatic tint, foreground and transparency adapt to sampled contrast |
| `full` | Contrast adaptation also raises frost on visually complex backgrounds |

`adaptationStrength` (`0`–`1`) blends the adjustment with your material. Explicit `tint` and `foreground` colors are retained. Set `foreground="auto"` for automatic black/white text. Modes `contrast` and `full` publish the chosen text color as `--glass-foreground`; web components apply it to their content. With `attachGlass`, apply `color: var(--glass-foreground, inherit)` to the text you want to adapt. Input tokens are `--glass-adaptation`, `--glass-adaptation-strength` and `--glass-text-color`.

The engine samples a 12×12 crop of the supplied backdrop at most once per 150 ms per active surface. Samples include local color, luminance and variation. Samples are cached and analysis is not run for `off` or strength `0`. `setSceneMaterial(null)` clears scene material defaults; `setSceneLight` continues to override the lighting properties independently. Local `inherit` and `default` work per property.

Contrast modes target 4.5:1 for sampled colors, or 7:1 with `prefers-contrast: more`, using the [W3C relative luminance and contrast definition](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). This is an estimate before optical distortion, lighting and final text rendering, not a WCAG compliance guarantee. Manual colors or reduced adaptation strength may prevent the target from being reached. `data-glass-contrast` reports the sampled estimate. Audit the rendered interface separately.

`prefers-reduced-transparency: reduce` lowers transparency in contrast modes. Forced colors hide the optical canvas and use system colors in web components. Neither preference starts a continuous animation loop.

## Surface geometry

```html
<edinstvo-glass shape="ellipse" style="width:240px;height:120px"></edinstvo-glass>
<edinstvo-glass shape="superellipse" curvature="5"></edinstvo-glass>
<edinstvo-glass shape="path" path="M50 0L100 100H0Z" view-box="0 0 100 100"></edinstvo-glass>
```

```js
const surface = attachGlass(element, {
  geometry: { shape: "path", path: "M50 0L100 100H0Z", viewBox: [0, 0, 100, 100] },
  material: { refraction: 0.4, depth: 12 },
});
surface.set({ geometry: { shape: "ellipse" } });
```

| Shape | Geometry |
| --- | --- |
| `rounded-rect` | CSS corner radius; existing default |
| `circle` | A circle inscribed in the shorter side of the element |
| `ellipse` | An ellipse spanning the element's width and height |
| `superellipse` | A continuous profile; `curvature` ranges from 2 (ellipse) to 8 |
| `path` | SVG path data mapped from `viewBox` into the element bounds |

Geometry changes the shader outline and its normals, so refraction, dispersion, rim, light and reflection follow that shape. It also participates in the existing group merging and layer composition. Set a web component's `.geometry` property to a new object to update it; geometry does not add a second renderer or context.

Paths accept path data only, not SVG markup, scripts or external resources. Use `fill-rule="evenodd"` or `geometry.fillRule` for alternate hole filling. Limits are 64 KiB of path data, 4096 commands and finite coordinates within ±1,000,000. Invalid markup is rejected by the property API; invalid attributes use the default outline with a console warning. Invalid native path syntax uses the view box. Limits bound input size, not the runtime of every browser's native path rasterizer.

Each custom outline is baked into a 256×256 signed distance tile. Raw and smoothed distances use 16-bit packed channels. Tiles share a per-surface atlas; only geometry changes rebuild it, and normal interaction reuses its GPU texture. GPU atlas caching targets at most four atlases and 32 MiB, excluding one active atlas if necessary. The distance transform follows the linear-time [Felzenszwalb–Huttenlocher method](https://cs.brown.edu/people/pfelzens/papers/dt-final.pdf).

Ellipses and superellipses use distance approximations. Small SVG details, highly concave paths, large elements and extreme aspect changes may reveal sampling or normal-field artifacts. Geometry controls the optical canvas; HTML layout and hit testing stay rectangular, and custom HTML content is not automatically clipped to a path. Custom paths have no automatic box shadow. CSS fallback uses the ordinary rounded rectangle rather than reproducing arbitrary path optics.

## Optical model

The screen-space lens uses Snell refraction with configurable `ior` (`1`–`2.4`, default `1.5`). `ior="1"` is optically matched to air and produces no geometric refraction. The curved profile has a height bounded by half the material thickness; `depth` defines its width. Ray displacement follows the optical path through this profile, replacing the earlier artistic scale factors.

Enabled environment reflections use the unpolarized dielectric Fresnel equations to mix reflected and transmitted colors. The equations and IOR convention follow [PBRT's dielectric interface description](https://pbr-book.org/4ed/Reflection_Models/Specular_Reflection_and_Transmission). `reflection="0"` still disables that contribution. The scene image is the available reflection source; this does not reconstruct a hidden 3D environment or simulate repeated internal reflections.

`dispersion-mode="artistic"` uses intentional RGB offsets. `dispersion-mode="physical"` uses a two-term Cauchy approximation at 610, 550 and 460 nm, with a generic coefficient of 0.004 µm² scaled by `dispersion`. This coefficient is illustrative, not a fitted optical glass catalog entry or a full spectral solution. Physical channel separation follows surface incidence and optical path, not the angle of the decorative directional light. `dispersion="0"` disables channel separation in both modes.

```html
<edinstvo-glass ior="1.5" reflection="1" dispersion-mode="physical"
  dispersion="0.5" thickness="12" depth="12" frost="0.1">
  Content
</edinstvo-glass>
```

The implementation remains a 2D optical approximation with an orthographic view. Tint, lift, bloom, touch warping and contrast adaptation are appearance controls, so combining them does not constitute a fully energy-conserving spectral material. No 3D rotation or separate renderer is involved.
