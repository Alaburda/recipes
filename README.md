# Recipes

A box of favourite recipes, built for a phone in a kitchen: a title, a search
bar, and as many recipes on screen as will fit. Tap one and it slides up as a
sheet you can read, copy or share; swipe it down and you are back in the list
exactly where you were.

Static site, published to GitHub Pages. No framework, no bundler, no toolchain —
one HTML file, one stylesheet, one script, and a Python script that turns the
recipes into an index.

## Adding a recipe

1. Copy [`recipes/_template.md`](recipes/_template.md) to `recipes/your-dish.md`.
   The filename becomes the URL, so keep it lowercase-with-hyphens.
2. Fill in the front matter and the two sections.
3. Commit and push. The site rebuilds itself.

```yaml
---
title: "Shakshuka"                                  # the only required field
description: Eggs poached in a spiced tomato sauce. # searchable, not displayed
categories: [breakfast, vegetarian, one-pan]        # searchable, not displayed
time: 30 min
servings: 2
link: https://www.youtube.com/watch?v=xxxxxxxxxxx   # optional
---
```

Then a `## Ingredients` bullet list and a `## Method` numbered list. That is the
whole format. Required: `title` and both sections — everything else is optional.

A line of prose after the numbered steps becomes a note at the bottom of the
recipe. That is where "keeps three days in the fridge" goes.

## The two things worth knowing

**Ingredient names are guessed.** Search needs "olive oil" out of "2 tbsp olive
oil, warmed", so quantities, units and prep words are stripped. When it guesses
wrong, correct it with a trailing HTML comment — invisible on the page, used
only for searching:

```markdown
- 400 g tin of plum tomatoes <!-- tomato -->
```

A bad guess never fails the build. The line just stays searchable by its own
words instead.

**`link:` is one field, and YouTube is special-cased.** A `youtube.com` or
`youtu.be` URL gets a ▶ Watch chip in the recipe and a small play mark on its
row in the list, so you can see at a glance which recipes you saved a video for.
Anything else is shown by its domain.

## Search

One box, matching across titles, descriptions, tags and ingredients at once.
Multiple words are an AND — `quick onion` finds recipes that match both.
Accents are folded, so `creme` finds `crème`. Matches in a title are
highlighted; matches anywhere else are silent.

## The look

White ground, warm near-black text, and four unmuted colours — a clear blue,
amber, emerald and a pomegranate red — pulled from three Fauvist still lifes.
Every recipe gets one of them, picked deterministically from its slug, as a 3px
bar down the left of its row and as the accent inside its sheet, so the list
reads as a column of colour and a given recipe is always the same one.

Fraunces for the wordmark and recipe titles, Karla for everything else. Light
only, on purpose. Colour lives in the `:root` block of
[`assets/app.css`](assets/app.css) and nowhere else.

## Running it

```bash
python scripts/build_index.py && python -m http.server 4321
```

Then open <http://localhost:4321>. Opening `index.html` directly will not work —
the page fetches `recipes.json`, and `file://` pages are not allowed to fetch.

To check that the recipes parse without serving anything:

```bash
python scripts/build_index.py
```

## How changes get managed

- **Source of truth** is `recipes/*.md`. Everything else is derived.
- **Validation happens at build time.** `scripts/build_index.py` refuses to
  write anything if a recipe is missing its title or a section, or has a `link:`
  that is not a URL. The message says which file and what to do.
- **CI runs the same command.** [`.github/workflows/publish.yml`](.github/workflows/publish.yml)
  builds on every push and pull request, and deploys to Pages only from `main`.
  A broken recipe fails the PR, not the live site.
- **Edit from anywhere.** A recipe is one small markdown file, so the GitHub web
  editor and `github.dev` are perfectly good ways to fix a typo from a phone.
- **Conventions for future edits** — mine and Claude's — live in
  [`CLAUDE.md`](CLAUDE.md).

## Layout

```
recipes/*.md             one file per recipe: the whole source of truth
index.html               the page
assets/app.css           all of the styling
assets/app.js            search, the sheet, copy and share
scripts/build_index.py   recipes/*.md -> recipes.json, and validation
```
