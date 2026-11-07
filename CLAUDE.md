# Working in this repo

A static recipe box, published to GitHub Pages. Read `README.md` first — it has
the recipe format. This file is about how to change things without breaking
them.

## The rules that matter

- **One recipe is one `.md` file in `recipes/`.** Never store recipe data
  anywhere else. `recipes.json` is generated and gitignored; do not commit it,
  do not hand-edit it, do not read it as a source of truth.
- **Adding a recipe means adding a file.** Nothing needs registering.
- **Run `python scripts/build_index.py` after touching any recipe.** It is the
  validator. It prints every problem and writes nothing if there are any.
- **Serve the site before claiming a change works.**
  `python scripts/build_index.py && python -m http.server 4321`. There is no
  render step to check warnings in — the only way to know is to look at it,
  at a phone width.

## Where things live

| Change | File |
|---|---|
| Recipe content | `recipes/<slug>.md` |
| Page markup | `index.html` |
| Palette, rows, sheet, everything visual | `assets/app.css` |
| Search, the sheet, history, copy/share | `assets/app.js` |
| Per-recipe accent colour | `ACCENTS` / `accent()` in `assets/app.js` |
| Ingredient name guessing | `UNITS` / `PREP` / `singular()` in `scripts/build_index.py` |
| What ends up in `recipes.json` | `load()` in `scripts/build_index.py` |

## Things that will bite

- **The hash is the state.** `#slug` means the sheet is up, and that is the only
  thing that means it. Row taps set `location.hash`; the Close button, the
  scrim, Escape and a swipe all go through `dismiss()`, which goes through
  history. Never show or hide the sheet by calling `show()`/`hide()` from a new
  place — change the hash and let `sync()` do it.
- **`depth` exists because of cold opens.** Someone opening a shared
  `…/#shakshuka` link has no history entry to go back to, so Close would leave
  the site. `dismiss()` checks `depth` and falls back to `replaceState`.
- **`[hidden]` needs the `!important` rule at the top of `app.css`.** Several
  elements set `display`, which otherwise beats the attribute and leaves the
  sheet and the clear button permanently visible.
- **The scroll lock is `position: fixed`, not `overflow: hidden`**, because iOS
  Safari ignores the latter on `body`. That means `body.style.top` has to be
  saved and restored, which `show()`/`hide()` do.
- **`#q` must stay at 16px or larger.** Anything smaller and iOS Safari zooms
  the page when you focus it.
- **The ingredient name guesser is heuristics, not parsing.** When it gets a
  line wrong, prefer an `<!-- override -->` comment in that recipe over widening
  the word lists — widening changes every existing recipe.
- **There are no sub-recipes.** A recipe is never an ingredient of another one:
  no `makes:`, no cross-links, no transitive ingredient closure. If a recipe
  uses soffritto, the ingredient line says `200 g soffritto` as text. Do not
  reintroduce the link syntax; it was removed deliberately.
- **No dark mode, no photos, no offline.** All three were considered and
  dropped. `prefers-color-scheme`, an `image:` field or a service worker would
  each be a change of direction, not a fix.
- **Colour lives in one place** — the `:root` block in `assets/app.css`. Each
  recipe's accent is derived from its slug, so it is stable; changing `ACCENTS`
  reshuffles the whole list.

## Style

Recipe prose is plain and specific: say what to look for, not just what to do
("until it holds a channel when you drag a spoon through it"). One step per
numbered line. No headnote longer than a sentence — that is what `description`
is for, and it is searchable rather than displayed.
