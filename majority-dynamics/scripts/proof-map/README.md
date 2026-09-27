# Proof-map extraction

`extract.ts` builds the dataset behind `/proof-map` from two pinned sources:

- the proof atlas HTML, <https://gopalkgoel.github.io/majority-dynamics/atlas/>
- the Lean development, <https://github.com/gopalkgoel/sparse-majority-dynamics-lean> at
  `4d607ff1d4ab468476bd7caa40d3c89199dde102` (`LEAN_REV` in `lean.ts`)

```sh
npm run extract:proof-map                       # fetch atlas, clone/fetch Lean into node_modules/.cache/proof-map
npm run extract:proof-map -- --atlas atlas.html --lean ../sparse-majority-dynamics-lean   # offline
```

The script refuses to run if the Lean checkout's `HEAD` differs from the pin. Output:

- `public/data/proof-map/atlas.json`: `meta` (sources, atlas sha256, Lean rev, counts) and `atlas`
  (sections, statements, edges, literature, KaTeX macros, unresolved references).
- `public/data/proof-map/lean.json`: every `.lean` file with line count, declaration counts, internal
  and external imports, atlas labels mentioned in comments, and pinned GitHub URLs; plus per-directory totals.

## How the atlas is read

- **Statements** are `article.paper-unit` elements. The number/kind come from the leading `<strong>`,
  the optional name from the parenthetical after it; morals, current-paper (`a.pdf-link.new`),
  pre-AI (`a.pdf-link.old`) and Lean (`a.lean-link`) locations from the `aside.evidence`; audit notes
  from `.audit-notes aside.callout`. All 73 article-level units are kept (the atlas navigation counts 66
  statement groups; some groups contain several units).
- **Edges** (`source` uses `target`). The atlas does not encode dependencies as markup, so they are the
  numbered cross-references (`Lemma 3.8`, `Theorem B.12`, `(A.3)` …) inside
  - a statement's proof toggle, or a section proof region (`Proof of Theorem 1.2` headings,
    `context-evidence` asides, `<em>Proof of …</em>`), with `via: "proof"`
  - the statement itself, only when the referenced statement comes earlier, with `via: "statement"`.
  Math and citation spans are masked first, so `Theorem 2.8.4 of [Ver18]` or `([LW17], Theorem 1.4)` do
  not create edges. Two proofs are attached by hand (see `SECTION_PROOF_OVERRIDES`,
  `PROOF_BY_FOLLOWING_LEMMAS`), each with the atlas sentence that justifies it.
- **Literature**: `data-cites` keys inside a statement, its proof, or the remarks between it and the next
  heading; bibliography from `#refs .csl-entry`.
