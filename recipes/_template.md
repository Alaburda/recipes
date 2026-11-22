---
title: "Name of the dish"
title_lt: "Patiekalo pavadinimas"
description: One line. Searchable, but not shown in the list.
description_lt: Viena eilutė. Ieškoma, bet nerodoma sąraše.
categories: [breakfast, quick]
categories_lt: [pusryčiai, greita]
time: 25 min
time_lt: 25 min
servings: 2
link: https://www.youtube.com/watch?v=xxxxxxxxxxx
---

## Ingredients

- 2 tbsp olive oil
- 1 onion, finely sliced
- 400 g tin of plum tomatoes <!-- tomato -->

## Method

1. First thing you do. One step per line.
2. Second thing. **Bold**, *italic* and [links](https://example.com) all work.
3. Third thing.

A line after the numbered steps becomes a note at the bottom of the recipe.

## Sudedamosios dalys

- 2 v. š. alyvuogių aliejaus <!-- alyvuogių aliejus -->
- 1 svogūnas, plonai supjaustytas <!-- svogūnas -->
- 400 g skardinė slyvinių pomidorų <!-- pomidorai -->

## Gaminimas

1. Pirmas žingsnis. Po vieną žingsnį eilutėje.
2. Antras žingsnis. **Paryškintas**, *pasvirasis* ir [nuorodos](https://example.com) veikia.
3. Trečias žingsnis.

Eilutė po sunumeruotų žingsnių tampa pastaba recepto apačioje.

<!--
  Copy this file to recipes/your-dish.md and edit it. The filename becomes the
  URL, so keep it lowercase-with-hyphens.

  Write the recipe in BOTH languages. English is required: a title, a
  '## Ingredients' bullet list and a '## Method' numbered list. Lithuanian goes
  in this same file under '## Sudedamosios dalys' and '## Gaminimas' -- write
  both of those or neither, because half a language fails the build.

  Everything else is optional -- delete the lines you do not want. A field with
  no '_lt' twin falls back to the English one, and a recipe with no Lithuanian
  at all still works: it reads in English and says that it is waiting for a
  translation.

  `servings` is one field for both languages -- it is a number, and the page
  writes "serves 2" or "2 porcijos" around it.

  `link` is one optional URL. A YouTube link gets a Watch chip and a small play
  mark in the list; anything else is shown by its domain.

  `categories` are not displayed, but they are searchable, so tag a recipe with
  the words you would actually type to find it -- in each language.

  Search guesses an ingredient name from each bullet ("2 tbsp olive oil" ->
  "olive oil"). When it guesses wrong, correct it with a trailing HTML comment
  like the tomatoes above -- invisible on the page, used only for searching.
  Lithuanian needs that comment more often: there is no stemmer for it, only a
  list of units, so an inflected noun keeps whatever form you wrote.
-->
