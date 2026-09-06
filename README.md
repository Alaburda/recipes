# Recipes

A filterable box of favourite recipes. Quarto website, published to GitHub Pages.

Every recipe is one `.qmd` file in [`recipes/`](recipes/). That file is both the
data and the page — there is no second copy of anything to keep in sync.

## Adding a recipe

1. Copy [`recipes/_template.qmd`](recipes/_template.qmd) to `recipes/your-dish.qmd`.
   The filename becomes the URL, so keep it lowercase-with-hyphens.
2. Fill in the front matter and the two sections.
3. `quarto preview` and look at it.
4. Commit and push. The site rebuilds itself.

```yaml
---
title: "Shakshuka"
description: Eggs poached in a spiced tomato sauce, start to finish in one pan.
categories: [breakfast, brunch, vegetarian, one-pan]   # these are the filter tags
time: 30 min
servings: 2
image: images/shakshuka.jpg      # optional
source: https://example.com      # optional
makes: tomato sauce              # only when the recipe is itself an ingredient
---
```

Then a `## Ingredients` bullet list and a `## Method` numbered list. That is the
whole format. Required: `title`, `categories`, and both sections.

## The three things worth knowing

**Ingredient names are guessed.** The filter needs "olive oil" out of
"2 tbsp olive oil, warmed", so quantities, units and prep words are stripped.
When it guesses wrong, correct it with a trailing HTML comment — invisible on the
page, used only for filtering:

```markdown
- 400 g tin of plum tomatoes <!-- tomato -->
```

**Some recipes are ingredients.** A recipe with a `makes:` line is one you cook in
order to cook something else — soffritto, a pickle brine, a stock. Use one in
another recipe by linking to it in the ingredient list, and the rest follows
automatically:

```markdown
- 200 g [soffritto](soffritto.qmd)
```

The link works on the page; the card gets an "ingredient" badge; soffritto's own
page grows a "Used in" list; and filtering by *carrot* finds the tomato sauce
made with soffritto, marked "via Soffritto". Turn that last part off with the
**Look inside sub-recipes** switch in the sidebar. Circular references
(A uses B uses A) fail the build.

The sidebar's **All / Dishes / Ingredients** control narrows the list to one or
the other when you only want to see things you would actually serve.

**Nothing generated is committed.** `recipes.json`, which the browse page
filters, is rebuilt from the `.qmd` files before every render. It cannot drift,
and it never causes a merge conflict.

## Photos

Keep them in [`images/`](images/) and reference them as `image: images/name.jpg`.
An external URL in that field works too, but is not the default for a reason:
hotlinked images rot, get blocked, or silently change. A photo you own in the
repo is a photo that still loads in five years. These are small files — a few
hundred recipes at ~200 KB each is a repo Git will not notice.

A recipe with no photo gets a watercolour wash instead — two pigments bled
through an SVG filter, picked from the recipe's name, so a given recipe always
paints the same. Nothing to generate and nothing to store.

## The look

Azulejo blue on lime-washed plaster, with terracotta where something needs to
shout. The tile pattern along the footer, the paper grain over everything, and
the card washes are all generated SVG — there is not one image file in the
theme. Fraunces for headings, Karla for everything else. Dark mode is the same
palette on toned paper, and follows the system setting.

## Running it

```bash
quarto preview
```

Opening `_site/index.html` directly will not work — the page fetches
`recipes.json`, and `file://` pages are not allowed to fetch. Use the preview.

To check that the recipes parse without rendering the whole site:

```bash
python scripts/build_index.py
```

## How changes get managed

- **Source of truth** is `recipes/*.qmd`. Everything else is derived.
- **Validation happens at build time.** `scripts/build_index.py` runs as Quarto's
  pre-render step and refuses to write anything if a recipe is missing a section,
  links to an ingredient recipe that does not exist, points at a missing image,
  or has an ingredient it cannot name. The message says which file and what to do.
- **CI runs the same command.** [`.github/workflows/publish.yml`](.github/workflows/publish.yml)
  renders on every push and pull request, and deploys to Pages only from `main`.
  A broken recipe fails the PR, not the live site.
- **Edit from anywhere.** A recipe is one small markdown file, so the GitHub web
  editor and `github.dev` are perfectly good ways to fix a typo from a phone.
- **Conventions for future edits** — mine and Claude's — live in
  [`CLAUDE.md`](CLAUDE.md).

## Layout

```
recipes/*.qmd            one file per recipe: the data and the page
images/                  photos
index.qmd                the browse page (markup only)
assets/browse.js         filtering
assets/browse.css        browse page styles
assets/theme.scss        site theme and recipe page styles
assets/recipe-footer.html   the "Used in" back-links
scripts/build_index.py   recipes/*.qmd -> recipes.json, and validation
scripts/recipe-page.lua  renders image/time/servings from the front matter
```
