#!/usr/bin/env python3
"""Read recipes/*.md and write recipes.json, the index the page searches.

Run it before serving the site, and whenever you touch a recipe:

    python scripts/build_index.py

It is also the validator: it prints every problem it finds and writes nothing
if there are any. Stdlib only, so CI needs nothing beyond Python. Files
starting with "_" are skipped -- that is how _template.md stays out of the site.

Each recipe is one .md file, and that one file holds every language it has
been written in. English is required: a '## Ingredients' bullet list and a
'## Method' numbered list. Lithuanian is optional and sits in the same file
under '## Sudedamosios dalys' and '## Gaminimas' -- write both of those or
neither. Front matter fields take an '_lt' suffix for their Lithuanian text:
title_lt, description_lt, categories_lt, time_lt. Anything with no Lithuanian
falls back to the English, and the build says how many are still waiting.

The ingredient *name* used for searching is guessed from each line ("2 tbsp
olive oil, warmed" -> "olive oil"). The guess is a heuristic, not a parser, so
when it gets one wrong, correct it with a trailing HTML comment -- invisible on
the page, used only for searching:

    - 400 g tin of plum tomatoes <!-- tomato -->

A bad guess never fails the build; it just leaves that line searchable by its
own words instead. There is no Lithuanian stemmer here, only a list of units
to drop, so Lithuanian lines lean on that comment rather more.
"""

import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECIPE_DIR = ROOT / "recipes"
OUT = ROOT / "recipes.json"

LANGS = ("en", "lt")
LANG_NAMES = {"en": "English", "lt": "Lithuanian"}

# The headings that carry a recipe, and which language each one speaks.
SECTION_HEADINGS = {
    "Ingredients":        ("en", "ingredients"),
    "Method":             ("en", "method"),
    "Sudedamosios dalys": ("lt", "ingredients"),
    "Gaminimas":          ("lt", "method"),
}
BY_HEADING = {h.lower(): v for h, v in SECTION_HEADINGS.items()}
HEADING_FOR = {v: h for h, v in SECTION_HEADINGS.items()}

# Tokens dropped from the front of an ingredient line when guessing its name.
UNITS = {
    "g", "kg", "mg", "ml", "l", "dl", "cl", "oz", "lb", "lbs",
    "tsp", "tbsp", "teaspoon", "teaspoons", "tablespoon", "tablespoons",
    "cup", "cups", "pint", "pints", "quart", "quarts", "gallon",
    "clove", "cloves", "can", "cans", "tin", "tins", "jar", "jars",
    "slice", "slices", "pinch", "pinches", "dash", "handful", "handfuls",
    "bunch", "bunches", "sprig", "sprigs", "stalk", "stalks", "head", "heads",
    "packet", "packets", "pack", "block", "stick", "sticks", "piece", "pieces",
    "large", "small", "medium", "big", "whole", "half", "few", "some",
    "x", "of", "a", "an", "the", "about", "approx", "heaped", "level",
}

# The same, for Lithuanian. Leading units only: Lithuanian inflects the noun
# itself, and guessing at that would be a parser, not a heuristic. When a line
# needs a name its own words do not give, use <!-- override -->.
UNITS_LT = {
    "g", "kg", "mg", "ml", "l", "dl", "vnt", "vnt.",
    "a", "v", "s", "saukstas", "sauksto", "sauksteliai",
    "šaukštas", "šaukštai", "šaukšto", "šaukštų",
    "šaukštelis", "šaukšteliai", "šaukštelio", "šaukštelių",
    "skiltelė", "skiltelės", "skiltelių", "žiupsnelis", "žiupsnis",
    "sauja", "saujos", "saujelė", "apie", "didelis", "didelė", "mažas", "maža",
}

# Dropped from either end -- prep notes and adjectives, not the ingredient.
PREP = {
    "chopped", "finely", "roughly", "sliced", "diced", "minced", "grated",
    "crushed", "peeled", "drained", "rinsed", "beaten", "melted", "softened",
    "cubed", "shredded", "torn", "halved", "quartered", "trimmed", "ground",
    "fresh", "freshly", "dried", "frozen", "canned", "tinned", "optional",
    "ripe", "unripe", "cooked", "raw", "skinless", "boneless", "good", "quality",
    "plus", "extra", "more", "taste", "serving", "serve", "garnish", "top",
    "to", "for", "at", "room", "temperature", "and", "or", "well", "very",
}

QTY = re.compile(r"^[\d¼-¾⅐-⅞./\-–+]+$")
OVERRIDE = re.compile(r"<!--\s*(.+?)\s*-->")
MDLINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
BULLET = re.compile(r"^\s*(?:\d+[.)]|[-*+])\s+(.*)$")
HEADING = re.compile(r"^#{2,3}\s+(.*)$")


class BuildError(Exception):
    pass


# --------------------------------------------------------------------------
# Front matter. A small YAML subset -- enough for the fields recipes use.
# --------------------------------------------------------------------------

def _scalar(raw):
    v = raw.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        v = v[1:-1]
    return v


def _split_inline(s):
    out, buf, quote = [], "", None
    for ch in s:
        if quote:
            buf += ch
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote, buf = ch, buf + ch
        elif ch == ",":
            out, buf = out + [buf], ""
        else:
            buf += ch
    return [p for p in (x.strip() for x in out + [buf]) if p]


def split_front_matter(text, where):
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise BuildError(f"{where}: must start with a '---' front-matter block")
    try:
        end = next(i for i, l in enumerate(lines[1:], 1) if l.strip() == "---")
    except StopIteration:
        raise BuildError(f"{where}: front matter is never closed with '---'")

    data, key = {}, None
    for n, raw in enumerate(lines[1:end], 2):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indented = raw[:1] in (" ", "\t")
        if indented and raw.lstrip().startswith("- ") and key is not None:
            if isinstance(data.get(key), list):
                data[key].append(_scalar(raw.lstrip()[2:]))
            continue
        if indented:
            continue
        if ":" not in raw:
            raise BuildError(f"{where}:{n}: expected 'key: value', got {raw.strip()!r}")
        key, _, val = raw.partition(":")
        key, val = key.strip(), val.strip()
        if not val:
            data[key] = []
        elif val.startswith("[") and val.endswith("]"):
            data[key] = [_scalar(p) for p in _split_inline(val[1:-1])]
        else:
            data[key] = _scalar(val)
    return data, "\n".join(lines[end + 1:])


# --------------------------------------------------------------------------
# Body: the ingredients and method sections, in whichever languages are there.
# --------------------------------------------------------------------------

def sections(body):
    out, name, buf = {}, None, []
    for line in body.splitlines():
        m = HEADING.match(line.strip())
        if m:
            if name:
                out[name] = buf
            name, buf = m.group(1).strip().lower(), []
        elif name:
            buf.append(line)
    if name:
        out[name] = buf
    return out


def bullets(lines):
    return [m.group(1).strip()
            for m in (BULLET.match(l) for l in lines)
            if m and m.group(1).strip()]


def trailing_note(lines):
    """Prose after the numbered steps -- the 'keeps for three days' line."""
    tail, seen_bullet = [], False
    for line in lines:
        if BULLET.match(line):
            seen_bullet, tail = True, []
        elif seen_bullet and line.strip():
            tail.append(line.strip())
    return " ".join(tail)


IRREGULAR = {
    "leaves": "leaf", "loaves": "loaf", "halves": "half", "knives": "knife",
    "shelves": "shelf", "children": "child", "teeth": "tooth", "feet": "foot",
    "geese": "goose", "mice": "mouse", "chillies": "chilli", "anchovies": "anchovy",
}


def singular(w):
    if w in IRREGULAR:
        return IRREGULAR[w]
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("oes") and len(w) > 4:
        return w[:-2]
    if re.search(r"(?:s|x|z|ch|sh)es$", w) and len(w) > 4:
        return w[:-2]
    if w.endswith(("ss", "us", "is")) or len(w) < 4:
        return w
    return w[:-1] if w.endswith("s") else w


def ingredient_name(raw, lang="en"):
    override = OVERRIDE.search(raw)
    if override:
        return override.group(1).strip().lower()
    s = re.sub(r"\([^)]*\)", " ", raw)     # drop parentheticals
    s = s.split(",")[0]                    # and everything after the first comma
    s = re.sub(r"[*_`\[\]]|\(.*?\)", "", s)
    words = [w for w in re.split(r"[\s/]+", s.lower()) if w]

    if lang != "en":
        while words and (QTY.match(words[0]) or words[0].strip(".") in UNITS_LT):
            words.pop(0)
        words = [w for w in (re.sub(r"[^\w'\- ]", "", w) for w in words) if w]
        return " ".join(words).strip()

    while words and (QTY.match(words[0]) or words[0].strip(".") in UNITS
                     or (len(words) > 1 and words[0].strip(".") in PREP)):
        words.pop(0)
    while words and words[-1].strip(".") in PREP:
        words.pop()
    words = [w for w in (re.sub(r"[^\w'\- ]", "", w) for w in words) if w]
    return " ".join(words[:-1] + [singular(words[-1])]).strip() if words else ""


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def plain(raw):
    """An ingredient line as it should read on the page."""
    return MDLINK.sub(r"\1", OVERRIDE.sub("", raw)).strip()


def facet(where, lang, parts, meta):
    """One language's half of a recipe. What is not written falls back to English."""
    sfx = "" if lang == "en" else f"_{lang}"

    def field(name):
        v = str(meta.get(name + sfx, "")).strip()
        return v or (str(meta.get(name, "")).strip() if sfx else "")

    title = field("title")
    if not title:
        raise BuildError(f"{where}: missing a 'title'")

    cats = meta.get("categories" + sfx) or meta.get("categories", [])
    if isinstance(cats, str):
        cats = [cats]
    if not isinstance(cats, list):
        raise BuildError(f"{where}: 'categories{sfx}' must be a list, e.g. [breakfast, quick]")

    lines = bullets(parts["ingredients"])
    if not lines:
        raise BuildError(f"{where}: the '## {HEADING_FOR[(lang, 'ingredients')]}' "
                         f"section has no bullet list")
    steps = bullets(parts["method"])
    if not steps:
        raise BuildError(f"{where}: the '## {HEADING_FOR[(lang, 'method')]}' "
                         f"section has no numbered steps")

    ingredients, names = [], set()
    for raw in lines:
        text = plain(raw)
        ingredients.append(text)
        # A line the guesser cannot name stays searchable by its own words.
        names.add(ingredient_name(raw, lang) or text.lower())

    return {
        "title": title,
        "description": field("description"),
        "tags": sorted({str(t).strip().lower() for t in cats if str(t).strip()}),
        "ingredients": ingredients,
        "names": sorted(n for n in names if n),
        "steps": steps,
        "note": trailing_note(parts["method"]),
        "time": field("time"),
    }


def load(path):
    where = path.relative_to(ROOT).as_posix()
    meta, body = split_front_matter(path.read_text(encoding="utf-8"), where)

    heads = sections(body)
    found = {}
    for heading, lines in heads.items():
        if heading in BY_HEADING:
            lang, kind = BY_HEADING[heading]
            found.setdefault(lang, {})[kind] = lines

    if "en" not in found:
        missing = [HEADING_FOR[("en", k)] for k in ("ingredients", "method")
                   if HEADING_FOR[("en", k)].lower() not in heads]
        raise BuildError(f"{where}: no "
                         + " and ".join(f"'## {h}'" for h in missing)
                         + (" sections" if len(missing) > 1 else " section"))
    for lang in LANGS:
        if lang not in found:
            continue
        for kind in ("ingredients", "method"):
            if kind not in found[lang]:
                head = f"'## {HEADING_FOR[(lang, kind)]}'"
                if lang == "en":
                    raise BuildError(f"{where}: no {head} section")
                raise BuildError(
                    f"{where}: has {LANG_NAMES[lang]} text but no {head} section "
                    f"-- a language is written in full or not at all")

    link = str(meta.get("link", meta.get("source", ""))).strip()
    if link and not link.startswith(("http://", "https://")):
        raise BuildError(f"{where}: 'link' must be a full http(s) URL, got {link!r}")

    out = {
        "slug": slugify(path.stem),
        "langs": [l for l in LANGS if l in found],
        "servings": str(meta.get("servings", "")),
        "link": link,
        "file": where,
    }
    for lang in out["langs"]:
        out[lang] = facet(where, lang, found[lang], meta)
    return out


def main():
    if not RECIPE_DIR.is_dir():
        print(f"no {RECIPE_DIR} directory", file=sys.stderr)
        return 1

    out, errors, seen = [], [], {}
    for p in sorted(RECIPE_DIR.glob("*.md")):
        if p.name.startswith("_"):
            continue
        try:
            r = load(p)
        except BuildError as e:
            errors.append(str(e))
            continue
        if r["slug"] in seen:
            errors.append(f"{r['file']}: slug '{r['slug']}' already used by {seen[r['slug']]}")
            continue
        seen[r["slug"]] = r["file"]
        out.append(r)

    if not out and not errors:
        errors.append("no recipes found in recipes/ -- nothing to build")

    if errors:
        print(f"\n{len(errors)} problem(s) in the recipes -- nothing was written:\n",
              file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print("", file=sys.stderr)
        return 1

    out.sort(key=lambda r: r["en"]["title"].lower())
    OUT.write_text(json.dumps({
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "langs": list(LANGS),
        "recipes": out,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    tags = {t for r in out for l in r["langs"] for t in r[l]["tags"]}
    names = {n for r in out for l in r["langs"] for n in r[l]["names"]}
    print(f"[recipes] {len(out)} recipes indexed "
          f"({len(tags)} tags, {len(names)} ingredients) -> {OUT.name}")

    # Not an error: the page falls back to English. It is a standing to-do.
    todo = [r["slug"] for r in out if "lt" not in r["langs"]]
    if todo:
        print(f"[recipes] {len(todo)} with no Lithuanian yet, shown in English: "
              + ", ".join(todo))
    return 0


if __name__ == "__main__":
    sys.exit(main())
