# Hero HUD palette assets

These frames are generated from `shared-ui/deck-redesign/deck-slot-v2.png` and `hero-portrait-frame-v2.png`.
The generator shifts only the existing teal and copper material hues while preserving alpha, luminance, texture, wear, and framing. No labels or iconography are baked into the PNGs.

Run `generate-hero-hud-assets.ps1` from PowerShell to rebuild the set.

For the tall hero-selection cards, use only the matching `portrait-frame-*.png` as the card's frame layer. Do not stack a `slot-*.png` frame on top of it; slot frames are wide, and stretching them into portrait cards creates doubled or distorted borders. Keep selection emphasis in the colored surface/glow rather than adding another outline.

| Hero | Surface | Frame highlight |
| --- | --- | --- |
| Big Boy | graphite / near black | smoked steel |
| Trap Master | muted violet | violet metal |
| Hunter | dark brown | aged umber |
| Joker | deep green | moss green |
| Refiner | dark ochre | muted golden yellow |
