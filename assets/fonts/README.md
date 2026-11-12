# Map font sources

These static font inputs are kept outside `public/`. The application serves their generated MapLibre SDF glyphs and OFL licenses from `public/fonts/`.

| Role        | Font                    | Variation axes         |
| ----------- | ----------------------- | ---------------------- |
| Country     | Noto Serif Semibold     | `wght=600`, `wdth=100` |
| City        | Inter Semibold          | `wght=600`, `opsz=14`  |
| Subdivision | Roboto Condensed Italic | `wght=400`             |

`manifest.json` records each original source URL at an immutable Git revision, its SHA-256, the instance axes, the committed static TTF's SHA-256, and its supported BMP glyph ranges. Static instances were prepared with FontTools 4.61.1. The matching OFL files are included alongside them and copied into the public font directories when preparing glyphs.

To reproduce the deployed glyphs, run `npm run fonts:prepare` from the repository root. That command uses the committed static inputs and the official MapLibre font-maker WebAssembly build pinned in `scripts/prepare-fonts.ts`. It verifies both generator and input checksums before execution. It does not require Python, a native compiler, or font installation. The generator downloads are cached under `.cache/font-maker/`.
