# Salvage HUD v2

Reusable raster masters for Second Chance HUD composition. The entry, lobby, deck, catalog, match and in-game overlays use this material family through their stylesheets.

## Visual direction

- Recovered, tactile oxidized metal with worn copper and rust at the rim.
- Quiet, subdued centers keep labels, portraits, and controls readable.
- The master palette is dark petrol teal. Two restrained alternatives extend the same material language: plum-slate and slate-charcoal; tile and badge add muted olive and rust-plum surfaces.
- Corners are clipped rather than rounded into modern pills. No baked text, icons, numbers, arrows, or status marks.
- The portrait card frame is a transparent overlay: its center opening stays alpha-transparent so artwork can sit beneath it.

## Nine-slice guidance

Use the `nineSlice` values in `manifest.json` as source-pixel `top right bottom left` insets. Preserve the corner blocks and fixed rim thickness; stretch the center and straight edge strips. For CSS `border-image`, use the supplied insets with `fill` on solid panels/buttons/tiles/badges. Keep `card-frame.png` as a frame overlay and do not fill its center. Avoid `background-size: 100% 100%` on variable-aspect panels because that distorts the clipped corners.

For small controls, use `button-compact.png` without shrinking its border below about 2 CSS pixels. Place all labels, icons, focus rings, and hover states in HTML/CSS above the raster; the PNGs are neutral resting surfaces.

## Production notes

- All assets are PNG with alpha transparency and tightly cropped around their visible silhouette, with a small transparent safety margin.
- The transparent card-art opening is intentional.
- Each file was generated as an independent master or palette variant, then trimmed to the dominant alpha silhouette. No prior files in `shared-ui/deck-redesign/` or the shared UI kit were overwritten.
- Integration lives in `salvage-hud-v2.css`, `game-lobby-screen/lobby-layout.css`, `entry-layout.css`, and the deck and catalog stylesheets. The matching older deck masters remain in `shared-ui/deck-redesign/`.
