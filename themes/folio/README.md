# Folio

An editorial magazine theme with serif headlines, a quiet monochrome palette, a wide masthead, thin rules and unboxed article grids. Its layout and built-in component coverage follow the existing JS.GRIPE Lumen theme.

Select `themes/folio` with the theme command in a source checkout. Dependency-based sites set `paths.theme` to `node_modules/edgepress/themes/folio` in `edgepress.config.mjs`, without a `theme` override in `config.yml`.

Page content stays in EdgePress blocks. A hero with `bannerSrc` or `bannerWebpSrcset` uses a text-and-image spread on desktop and stacks on mobile. A hero without media keeps a text layout. The theme supplies no cover images or placeholder content. Media keeps its original aspect ratio and captions remain below the image. Local fonts, local navigation JavaScript, keyboard focus, native search, consent controls and automatic light/dark appearance are supported.
