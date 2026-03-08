# mdPaper Roadmap

## Current Baseline

Current codebase has already landed these foundations:

- Non-fullscreen right-side preview uses Typst SVG preview.
- Fullscreen editor keeps HTML preview.
- Default export path has been moved toward Typst PDF, with legacy screenshot export retained as compatibility path.
- Typst debug panel exists and can show status, source, diagnostics, template, and virtual project summary.
- Typst templates have been extracted into standalone `.typ` files under `src/services/typst/templates/`.
- Shared serializer already targets a common document model.
- `mdasset:` image assets are already part of the in-browser asset flow.
- Image max display percent setting has been added to editor state and both preview paths.

This roadmap only tracks **undone or not-yet-stable work**.

## P0 — Must Fix First

### 1. Typst text escaping completeness

Current status:
- Basic escaping has been introduced, but this area is still not fully trustworthy for all Markdown text leaves and all metadata text fields.

Remaining work:
- Ensure every non-math, non-code, non-raw-Typst text leaf is serialized as plain safe text.
- Cover body text, headings, captions, tables, lists, blockquotes, footnotes, references, and all metadata fields.
- Verify mixed inline structures still preserve semantics, such as emphasis inside heading text and emphasis inside links.

Done condition:
- Strings containing `_`, `*`, `[`, `]`, `#`, `\\` and similar Typst-sensitive characters no longer break Typst compilation or silently render wrong.

### 2. HTML preview and Typst semantics alignment

Current status:
- HTML preview is still not fully aligned with Typst in several semantic areas.
- User has explicitly confirmed that HTML should move toward Typst behavior, not the reverse.

Remaining work:
- Align heading level behavior.
- Align auto-numbering behavior.
- Align caption behavior where HTML currently over-interprets Markdown.
- Review block-level structures whose HTML output still differs from Typst source-of-truth semantics.

Done condition:
- Fullscreen HTML preview and non-fullscreen Typst preview present the same document structure and numbering logic for standard Markdown content.

### 3. Typst compile chain stability

Current status:
- Main compile path exists, but regressions have repeatedly appeared in runtime initialization, path mapping, serializer wiring, and diagnostics surfacing.

Remaining work:
- Continue eliminating compile-path regressions caused by wrong parameter threading, queueing, or runtime state reuse.
- Make diagnostics consistently actionable when compile fails.
- Keep last successful SVG/PDF stable when a new compile fails.

Done condition:
- Editing ordinary content no longer intermittently drops Typst preview into non-actionable failure states.

### 4. Typst template contract hardening

Current status:
- Template files are already externalized, but template discovery rules, shared-file conventions, and template API still need stronger stabilization.

Remaining work:
- Freeze the contract between serializer output and template entry functions.
- Adopt directory conventions so only files named `template_*.typ` are exposed as selectable templates.
- Add `common.typ` as the default shared import for all generated main entries.
- Rename current shared R.U.B.B.I.S.H-specific frontmatter helper into `common_rubbish.typ` and keep template-family-specific helpers out of the template picker.
- Ensure all `.typ` files under the template directory are injected into the Typst virtual source file system so template-local imports can be organized inside Typst files instead of hardcoded in TypeScript.
- Keep serializer responsible only for semantic document output and shared entry invocation.
- Keep all page, text, show, and visual rules in template files.
- Ensure author markers, affiliations, corresponding markers, abstract, keywords, and funding all stay template-driven.

Done condition:
- Switching templates only changes layout and styling, not content semantics or compile success, and new `template_*.typ` files can be discovered without hand-maintained template registration.

## P1 — High Priority

### 5. Citation and reference pipeline

Current status:
- `[@key]` citation syntax and diagnostics direction have been discussed, but the full chain is not complete or not yet stable enough to be considered finished.

Remaining work:
- Finalize parsing for `[@key]` and `[@a; @b]`.
- Keep footnotes `[^id]` and references `[@key]` fully separated.
- Normalize bibliography section detection and mapping.
- Surface missing, duplicate, or malformed references in diagnostics.
- Align HTML preview and Typst output for reference rendering.

Done condition:
- Footnotes and references can coexist without numbering collision or semantic ambiguity.

### 6. Image and resource model redesign

Current status:
- In-browser `mdasset:` flow exists, but resource handling is still incomplete and partially confusing.
- Remote linked images are intentionally not supported for Typst compile/export.

Remaining work:
- Make the resource model explicit and user-visible instead of implicit.
- Ensure all Typst-usable ordinary assets flow through managed in-browser assets.
- Keep `mdasset:` as the canonical path for uploaded/managed image resources.
- Add clearer UI and messaging around unsupported remote linked images.
- Design the next-stage resource manager without reintroducing hidden auto-download behavior.
- Build a unified virtual project input layer that distinguishes among source `.typ` files, ordinary binary resources such as image/blob content, and font inputs.
- Treat ordinary binary resources as a dedicated resource channel instead of mixing them with template registration logic.
- Keep font handling as a separate unresolved subtopic and implement it only after confirming the official or runtime-defined loading mechanism; do not assume fonts use the same path and mapping strategy as ordinary resources.

Done condition:
- User can clearly understand which images are managed assets, which are only HTML-visible links, and which can enter Typst compile/export, while the virtual project model clearly separates template files, ordinary binary resources, and font inputs.

### 7. Typst diagnostics usability

Current status:
- Debug panel exists, but usefulness still depends on the quality of surfaced diagnostics.

Remaining work:
- Distinguish template errors, content errors, resource errors, and reference errors more clearly.
- Improve location mapping when Typst returns weak diagnostics.
- Make runtime snapshot output easier to read.
- Keep debug panel informative without requiring auto-popup.

Done condition:
- Typst debug panel can explain most compile failures without requiring source-level guesswork.

### 8. Default export path hardening

Current status:
- Product direction has shifted to Typst PDF as default, but the export experience still needs polish and consistency checks.

Remaining work:
- Ensure exported PDF always matches current Typst preview result.
- Fail clearly when no valid Typst PDF artifact exists.
- Keep legacy screenshot export clearly labeled as compatibility-only.
- Remove stale UI copy that still implies old screenshot export is the normal path.

Done condition:
- Export semantics are unambiguous: Typst PDF is default, screenshot export is legacy only.

## P2 — Important, But After Core Stability

### 9. `miTeX` integration for math compatibility

Current status:
- This has been identified as a dedicated compatibility task, but has not been integrated in this round.

Remaining work:
- Evaluate `miTeX` package integration path in Typst runtime.
- Define when Markdown math is translated into native Typst math and when compatibility transformation is needed.
- Recheck HTML preview and Typst preview consistency after integration.

Done condition:
- Markdown math behavior is substantially more predictable across ordinary author input.

### 10. Font strategy

Current status:
- Current runtime uses bundled web fonts, but this is not a long-term resolved font system.

Remaining work:
- Clarify fallback order and error behavior when requested fonts are unavailable.
- Decide how template typography maps to available browser/Wasm fonts.
- Confirm the officially supported or runtime-defined font loading mechanism before restructuring font inputs.
- Avoid relying on unavailable system font names such as `Times New Roman` as if they were guaranteed.
- Avoid assuming that fonts should follow exactly the same virtual-path injection mechanism as images or other ordinary binary resources until that mechanism is verified.

Done condition:
- Typst output no longer depends on accidental local font availability assumptions, and font loading is based on a verified runtime-supported approach rather than guesswork.

### 11. Template system expansion

Current status:
- Multi-template support exists at a basic level, but the template system is still tightly coupled to current built-in templates.

Remaining work:
- Formalize bundled template registration.
- Cleanly separate shared helpers from per-template layout.
- Define what a future third template must implement.

Done condition:
- Adding another built-in template is straightforward and does not require touching unrelated runtime logic.

## P3 — Later Work

### 12. User-facing asset manager

Current status:
- User has explicitly deprioritized full manager work until compile chain is stable.

Remaining work:
- Build a visible in-browser asset manager for uploaded images and other future resources.
- Allow inspection, replacement, deletion, and stable reuse of managed assets.
- Clarify how managed resources map to Markdown references and Typst shadow resources.

Done condition:
- Resource management becomes explicit and understandable to ordinary users.

### 13. Documentation refresh

Current status:
- `README.md` is stale and still describes the old canvas-first export path and older image workflow.

Remaining work:
- Rewrite README around current Typst preview/export architecture.
- Document HTML preview vs Typst preview responsibilities.
- Document current template system, debug panel, `mdasset:` behavior, and remote image limitations.
- Add a short troubleshooting section for Typst diagnostics.

Done condition:
- Public-facing documentation matches the actual product behavior.

## Deferred / Not In Current Round

These items have been discussed but are intentionally not part of the current delivery scope:

- User-selectable Typst engine version switching.
- Full remote-image auto-download and normalization pipeline.
- Bibliography ecosystem expansion beyond the lightweight in-app citation model.
- LaTeX export.
- DOCX export.
- Template editor UI.
- General plugin system or integration ecosystem.
- Broader collaboration roadmap claims.

## Recommended Execution Order

1. Stabilize Typst text escaping.
2. Align HTML preview semantics with Typst.
3. Harden Typst compile/runtime stability.
4. Freeze template contract.
5. Complete citation/reference pipeline.
6. Redesign image/resource model.
7. Improve diagnostics usability.
8. Harden Typst PDF export behavior.
9. Integrate `miTeX`.
10. Rework fonts and bundled template system.
11. Build asset manager.
12. Refresh README and external documentation.
