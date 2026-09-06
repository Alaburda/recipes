# Working in this repo

A Quarto website of recipes, published to GitHub Pages. Read `README.md` first —
it has the recipe format. This file is about how to change things without
breaking them.

## The rules that matter

- **One recipe is one `.qmd` file in `recipes/`.** Never store recipe data
  anywhere else. `recipes.json` is generated and gitignored; do not commit it,
  do not hand-edit it, do not read it as a source of truth.
- **Adding a recipe means adding a file.** Nothing needs registering. Tags,
  ingredient facets and counts all fall out of the files at build time.
- **Run `python scripts/build_index.py` after touching any recipe.** It is the
  validator. It prints every problem and writes nothing if there are any.
- **Run `quarto render` before claiming a change works.** Check the output for
  `[WARNING]` — raw HTML blocks in `.qmd` are easy to get wrong, and Pandoc says
  so rather than failing.

## Where things live

| Change | File |
|---|---|
| Recipe content | `recipes/<slug>.qmd` |
| Filtering, sorting, cards, keyboard | `assets/browse.js` |
| Browse page markup | `index.qmd` (one `{=html}` block — keep it that way) |
| Browse page styles | `assets/browse.css` (all rules scoped under `.browse`) |
| Recipe page + site styles | `assets/theme.scss` |
| Ingredient name guessing | `UNITS` / `PREP` / `singular()` in `scripts/build_index.py` |
| Front matter → rendered page | `scripts/recipe-page.lua` |
| "Used in" back-links | `assets/recipe-footer.html` |

## Things that will bite

- `index.qmd` wraps its markup in a ```` ```{=html} ```` block. Pandoc splits raw
  HTML on blank lines and silently mangles it otherwise.
- `assets/browse.css` scopes everything under `.browse` so it cannot leak into
  the Bootstrap-themed recipe pages. Keep new rules scoped.
- The ingredient name guesser is heuristics, not parsing. When it gets a line
  wrong, prefer an `<!-- override -->` comment in that recipe over widening the
  word lists — widening changes every existing recipe's facets.
- A recipe that is itself an ingredient is one with a `makes:` line. Referencing
  one is a markdown link to its `.qmd`. Resolution, back-links and the transitive
  ingredient closure all happen in `resolve()` in `scripts/build_index.py`. The
  JSON field is `is_ingredient`; avoid the bare word "ingredient" for it in code,
  since that already means a line in an ingredient list.
- `recipe: true` in `recipes/_metadata.yml` is what gates the Lua filter. A page
  outside `recipes/` will not get the photo/time header.

## Style

Recipe prose is plain and specific: say what to look for, not just what to do
("until it holds a channel when you drag a spoon through it"). One step per
numbered line. No headnote longer than a sentence — that is what `description`
is for.
