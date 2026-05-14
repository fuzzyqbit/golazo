# Remotion Font Assets

Self-hosted TrueType fonts committed to the repository for offline-safe, deterministic rendering.
Remotion would otherwise fetch fonts from the network during bundle, breaking reproducibility.

## Files

- `CormorantGaramond-Italic.ttf` — Display serif, weight 400 italic (Cormorant Garamond)
- `Inter-Regular.ttf` — Label sans-serif, weight 400 normal (Inter)
- `Inter-Bold.ttf` — Label sans-serif, weight 700 normal (Inter)

## License

Both fonts ship under the **SIL Open Font License 1.1**.
See <https://openfontlicense.org/> for the full license text.
Embedding and redistribution are permitted with attribution as long as the fonts are not sold on their own.

## Sources

- **Cormorant Garamond Italic** — downloaded from the CatharsisFonts/Cormorant GitHub repository:
  `https://github.com/CatharsisFonts/Cormorant/raw/master/fonts/ttf/CormorantGaramond-Italic.ttf`
  Original authors: The Cormorant Project Authors (github.com/CatharsisFonts/Cormorant)

- **Inter Regular + Inter Bold** — extracted from the rsms/inter v4.0 release archive:
  `https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip` → `extras/ttf/Inter-{Regular,Bold}.ttf`
  Original authors: The Inter Project Authors (copyright 2016); maintainer Rasmus Andersson (RSMS)

## Rationale

Fonts are committed as binary assets (not loaded from a CDN at render time) so that:
1. Renders are **deterministic** — same bytes, same glyph metrics, every machine.
2. Renders are **offline-safe** — no outbound HTTP calls during `remotion bundle` or `renderMedia`.
3. The `.gitignore` whitelist (`!remotion/assets/fonts/*.ttf`) ensures these files survive `git add`
   regardless of any broad binary-exclusion rules added in the future.
