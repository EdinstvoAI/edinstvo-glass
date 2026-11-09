# Rendering and security report

10 November 2026. Scope: new materials, geometry, local renderer resources, demo inspector and development server.

## Fixed

| Finding | Effect | Change |
| --- | --- | --- |
| Fractional-mip paired blur sampling | Visible vertical texture on Retina | Restored full 17-sample Gaussian kernel; kept buffer reuse |
| Maximum of independent interior fields during merging | Crease and triangular distortion in a connecting bridge | Blend complete interior fields using the same smooth union as the outline |
| Artificial normal and optical-path scale factors | Unstable appearance at large depth | Thickness-bounded profile, Snell refraction and configurable IOR |
| Residual RGB offset at dispersion zero | Color separation could not be disabled completely | Zero now uses a single coincident sample |
| Semi-transparent color normalization | RGB values could exceed the supplied color | Decode unpremultiplied canvas RGB using 255, not alpha |
| Circle shadow used the full rectangular bounds | Oval shadow behind an inscribed circle | Match the circle diameter and center |
| Geometry property connected detached elements | Premature observers and retained renderer surfaces | Delay connection until the element is attached |
| Inspector range step rounded IOR 1.5 to 2 | Displayed setting disagreed with the material | Use fractional steps for small numeric ranges; observe external attribute updates |
| Unrestricted path input and inherited geometry keys | Unexpected geometry and excessive native parsing work | Own-key validation; path data only; size, command and coordinate limits |
| Layer accumulation used an ordinary object | `__proto__` could affect the accumulated layer's prototype | Use an object without a prototype |
| Development server exposed repository paths on all interfaces | Local metadata could be served to the network | Loopback by default; allow only public demo/build/test assets; reject private paths and escaping symlinks |
| Malformed URI or disappearing file | Development server could terminate | Return an error or close the response without crashing |

## Checks

- 22 automated core and development-server checks pass.
- 23 browser checks pass in Chrome at DPR 1 and DPR 2, including source capture, fallback, adaptation, SVG holes, cached fields and optical displacement.
- Merged normal jumps: 7/255 at DPR 1 and 4/255 at DPR 2 in the deep-surface fixture; regression threshold 32/255.
- Deep capsule displacement: maximum neighbor jump 2/255, mirror error 1/255 at both tested DPR values.
- `ior=1` produces no geometric refraction in the diagnostic buffer.
- `npm audit` reports zero known vulnerabilities in the installed dependency tree. This is a registry advisory result, not a proof of security.
- Rendering resource measurements are in [PERFORMANCE.md](PERFORMANCE.md); they demonstrate lower allocation and lookup counts, not an established FPS improvement.

## Remaining limits and unfinished delivery

- Optical reflection still samples the supplied 2D scene. No hidden 3D environment, multiple internal reflections or complete spectral solution is reconstructed.
- SVG fields are rasterized at 256×256 per shape. Very small details, extreme aspect ratios and large concave shapes still need visual review.
- Text contrast is estimated from sparse background samples before final optical effects. Audit final text independently.
- Custom geometry leaves rectangular DOM layout/hit testing and does not automatically clip arbitrary HTML content.
- Local checks ran in Chrome; new Safari, Firefox and Windows results have not been collected in this session. Existing browser CI contains the new regression checks.
- README documents the new APIs. Site documentation and its visual update were not written: automatic approval review for the separate `edinstvo-glass-site` folder failed with HTTP 403. The site repository remains unchanged.
- Changes are in `Dev`; the new APIs have not been published to npm in this session.
