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

Choose **Inspect in 3D** and drag the object to rotate it. The experimental volume study traces rays through a rounded solid with independently adjustable thickness and bevel. It uses the bench background and the material controls for refraction, frost, transparency, reflection and directional light. Unsupported controls are disabled while this view is open.

This study is separate from the web component renderer. It currently handles one solid, a fixed refractive index and one transmission path; repeated internal reflections, dispersion and merged objects are not implemented in this view. Rays that undergo total internal reflection use an environment approximation. The preview draws on interaction rather than continuously.

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
