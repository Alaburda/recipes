#!/usr/bin/env python3
"""Read recipes/*.qmd and write recipes.json, the index the browse page filters.

Quarto runs this automatically before every render (project: pre-render in
_quarto.yml), so the index can never drift from the recipes. It is also worth
running on its own while writing a recipe, to check it parses:

    python scripts/build_index.py

Stdlib only, so CI needs nothing beyond Python. Files starting with "_" are
skipped -- that is how _template.qmd stays out of the site.

Each recipe is one .qmd: YAML front matter for the facts, a '## Ingredients'
bullet list, and a '## Method' numbered list. The ingredient *name* used for
filtering is guessed from each line ("2 tbsp olive oil, warmed" -> "olive oil");
when the guess is wrong, override it with a trailing HTML comment, which is
invisible in the rendered page:

    - 400 g tin of plum tomatoes <!-- tomato -->
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

REQUIRED = ("title", "categories")

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
# An ingredient line that links to another recipe -- "3 tbsp [soffritto](soffritto.qmd)"
# -- is a sub-recipe reference, not just text.
REF = re.compile(r"\[([^\]]*)\]\(\s*(?:\./)?(?:recipes/)?([\w\-.]+)\.qmd[^)]*\)")
MDLINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")


class BuildError(Exception):
    pass


# --------------------------------------------------------------------------
# Front matter. A small YAML subset -- enough for the fields recipes use, and
# it steps over anything nested rather than pretending to understand it.
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
            continue                      # nested option block -- Quarto's business
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
# Body: the '## Ingredients' and '## Method' sections.
# --------------------------------------------------------------------------

def sections(body):
    out, name, buf = {}, None, []
    for line in body.splitlines():
        m = re.match(r"^#{2,3}\s+(.*)$", line.strip())
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
            for m in (re.match(r"^\s*(?:\d+[.)]|[-*+])\s+(.*)$", l) for l in lines)
            if m and m.group(1).strip()]


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


def ingredient_name(raw):
    override = OVERRIDE.search(raw)
    if override:
        return override.group(1).strip().lower()
    s = re.sub(r"\([^)]*\)", " ", raw)     # drop parentheticals
    s = s.split(",")[0]                    # and everything after the first comma
    s = re.sub(r"[*_`\[\]]|\(.*?\)", "", s)
    words = [w for w in re.split(r"[\s/]+", s.lower()) if w]
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


def load(path):
    where = path.relative_to(ROOT).as_posix()
    meta, body = split_front_matter(path.read_text(encoding="utf-8"), where)

    missing = [f for f in REQUIRED if not meta.get(f)]
    if missing:
        raise BuildError(f"{where}: missing required field(s): {', '.join(missing)}")
    if not isinstance(meta["categories"], list):
        raise BuildError(f"{where}: 'categories' must be a list, e.g. [breakfast, quick]")

    secs = sections(body)
    if "ingredients" not in secs:
        raise BuildError(f"{where}: no '## Ingredients' section")
    if "method" not in secs:
        raise BuildError(f"{where}: no '## Method' section")

    ings = []
    for raw in bullets(secs["ingredients"]):
        text = MDLINK.sub(r"\1", OVERRIDE.sub("", raw)).strip()
        ref = REF.search(raw)
        if ref:
            # Name is filled in later, from whatever that recipe says it makes.
            ings.append({"text": text, "name": None, "ref": slugify(ref.group(2))})
            continue
        name = ingredient_name(raw)
        if not name:
            raise BuildError(f"{where}: cannot work out an ingredient name from {raw!r} "
                             f"-- add an override comment, e.g. '{text} <!-- salt -->'")
        ings.append({"text": text, "name": name, "ref": None})
    if not ings:
        raise BuildError(f"{where}: the '## Ingredients' section has no bullet list")
    if not bullets(secs["method"]):
        raise BuildError(f"{where}: the '## Method' section has no numbered steps")

    image = str(meta.get("image", "")).strip()
    makes = str(meta.get("makes", "")).strip().lower()
    return {
        "slug": slugify(path.stem),
        "url": f"recipes/{path.stem}.html",
        "title": str(meta["title"]),
        "description": str(meta.get("description", "")),
        "tags": sorted({str(t).strip().lower() for t in meta["categories"] if str(t).strip()}),
        "ingredients": [i["text"] for i in ings],
        # A recipe with `makes:` is itself an ingredient -- something other
        # recipes use by name, like soffritto or a brine.
        "makes": makes,
        "is_ingredient": bool(makes),
        "steps": len(bullets(secs["method"])),
        "image": image,
        "time": str(meta.get("time", "")),
        "servings": str(meta.get("servings", "")),
        "file": where,
        "_ings": ings,
    }


def resolve(recipes):
    """Bind sub-recipe references, then work out what each recipe contains once
    its sub-recipes are unpacked -- so filtering by 'carrot' also finds the sauce
    that only mentions soffritto."""
    by_slug = {r["slug"]: r for r in recipes}
    errors = []

    for r in recipes:
        for ing in r["_ings"]:
            if not ing["ref"]:
                continue
            target = by_slug.get(ing["ref"])
            if target is None:
                errors.append(f"{r['file']}: links to '{ing['ref']}.qmd', which does not exist")
                ing["name"] = ing["text"].lower()
                continue
            if not target["makes"]:
                errors.append(f"{r['file']}: uses {target['file']} as an ingredient, so that "
                              f"file needs a 'makes:' line saying what it produces")
            ing["name"] = target["makes"] or target["title"].lower()

    for r in recipes:
        r["names"] = sorted({i["name"] for i in r["_ings"] if i["name"]})
        r["uses"] = sorted({i["ref"] for i in r["_ings"] if i["ref"] and i["ref"] in by_slug})
        r["used_in"] = []

    for r in recipes:
        for ref in r["uses"]:
            by_slug[ref]["used_in"].append({"slug": r["slug"], "title": r["title"],
                                            "url": r["url"]})

    # Transitive closure, with a cycle check -- an ingredient that contains itself
    # would otherwise recurse forever.
    deep, visiting = {}, set()

    def expand(slug, trail):
        if slug in deep:
            return deep[slug]
        if slug in visiting:
            errors.append(f"circular sub-recipe: {' -> '.join(trail + [slug])}")
            return set()
        visiting.add(slug)
        r = by_slug[slug]
        acc = set(r["names"])
        for ref in r["uses"]:
            acc |= expand(ref, trail + [slug])
        visiting.discard(slug)
        deep[slug] = acc
        return acc

    for r in recipes:
        r["deep"] = sorted(expand(r["slug"], []))
        r["used_in"].sort(key=lambda u: u["title"].lower())
        del r["_ings"]

    return errors


def main():
    if not RECIPE_DIR.is_dir():
        print(f"no {RECIPE_DIR} directory", file=sys.stderr)
        return 1

    out, errors, seen = [], [], {}
    for p in sorted(RECIPE_DIR.glob("*.qmd")):
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
        external = r["image"].startswith(("http://", "https://"))
        if r["image"] and not external and not (ROOT / r["image"]).exists():
            errors.append(f"{r['file']}: image '{r['image']}' is not in the repo")
        out.append(r)

    errors += resolve(out)

    if errors:
        print(f"\n{len(errors)} problem(s) in the recipes -- nothing was written:\n",
              file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print("", file=sys.stderr)
        return 1

    out.sort(key=lambda r: r["title"].lower())
    OUT.write_text(json.dumps({
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "recipes": out,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    tags = {t for r in out for t in r["tags"]}
    names = {n for r in out for n in r["names"]}
    made = {r["slug"] for r in out if r["is_ingredient"]}
    print(f"[recipes] {len(out)} recipes indexed "
          f"({len(tags)} tags, {len(names)} ingredients, {len(made)} of them recipes) "
          f"-> {OUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
