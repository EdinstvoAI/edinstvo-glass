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

Enable **Drag to rotate** on the selected surface and drag it in the same scene. `thickness` changes its volume; `rotationX` and `rotationY` also work as sliders. Reset the pose with **Reset rotation**. Rotation is opt-in for each surface.

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

A local material layer can override each property independently; `inherit` keeps the parent value and `default` restores the engine default. Without rotation the lens uses an approximated curved front surface and a flat back surface, with a fixed refractive index. Optional rotation traces a rounded solid as described below. Thickness is measured in CSS pixels, not physical millimetres.

## Optional rotation

```html
<edinstvo-glass rotatable thickness="24" rotation-x="12" rotation-y="30">
  Content
</edinstvo-glass>
```

`rotationX` and `rotationY` are material properties in degrees (`-80` to `80`, default `0`). They use the same inheritance, local overrides, CSS tokens (`--glass-rotation-x`, `--glass-rotation-y`) and material layers as the other numeric settings. Set angles without `rotatable` for a fixed pose; add `rotatable` to allow pointer and touch dragging. Removing `rotatable` stops dragging and keeps the pose. Form controls, links and editable content do not start a rotation gesture.

```js
import { attachGlass } from "@edinstvo/glass";

const surface = attachGlass(element, {
  rotatable: true,
  material: { thickness: 24, rotationY: 30, frost: 0.2 },
});

element.addEventListener("glass-rotate", ({ detail }) => {
  console.log(detail.rotationX, detail.rotationY);
});

surface.set({ rotatable: false });
```

Tilted surfaces use the existing renderer, WebGL context, scene source, shape outline, material settings and lighting. The shader traces entry and exit through a rounded volume, applies Snell refraction at both interfaces and uses Fresnel weighting for enabled reflections. Side geometry depends on `thickness`; `depth` and `splay` control the bevel, limited by half the thickness. Setting thickness to zero leaves a tilted sheet without optical travel through a volume. With zero angles and dragging disabled, the shader uses the existing flat lens path and skips volume tracing.

The volume model uses an orthographic camera and refractive index `1.5`. It traces one transmission path; total internal reflection uses a backdrop reflection approximation. Reflections sample the supplied scene image, not hidden 3D surroundings. Dispersion remains the existing artistic RGB separation. It has bounded tracing steps and can show edge approximation errors at grazing angles. Rotating many merged shapes costs more than rotating a single surface. HTML layout, focus bounds and pointer hit testing keep their original DOM rectangles. The web component tilts its own content; custom DOM passed to `attachGlass` and content within merged groups require their own content layout. CSS fallback does not render volumetric rotation.

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
