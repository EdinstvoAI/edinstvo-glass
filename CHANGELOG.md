# Changelog

## 1.1.4

- Smooth backdrop adaptation, including the return to manual material settings.
- Preserve the actual backdrop beneath foreground panels and on partly visible surfaces.
- Preserve lower glass across dense stacks and keep blur enabled in the merge demo.
- Add SVG, ellipse and superellipse geometry, configurable optical thickness and IOR, and separate artistic and physical dispersion modes.
- Reuse rendering resources and bound caches. Restore the full Gaussian kernel to avoid sampling stripes.
- Add rendering regressions for merged edges, deep lenses, blur, adaptation and layered composition.

The optical model remains a two-dimensional, screen-space approximation. Reflections use the supplied scene image. No separate 3D renderer is included.
