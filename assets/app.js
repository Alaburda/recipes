/* Recipes — one list, one sheet, two languages.
   Everything here is presentation: recipes.json is the content, built from
   recipes/*.md by scripts/build_index.py. No framework, no build step. */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const list = $("list");
  const empty = $("empty");
  const input = $("q");
  const clearBtn = $("clear");
  const sheet = $("sheet");
  const scrim = $("scrim");

  let recipes = [];
  let bySlug = new Map();
  let open = null;      // the slug currently in the sheet
  let depth = 0;        // history entries we pushed, so Close knows what to do
  let scrollY = 0;

  /* ------------------------------------------------------------ languages */

  const LANGS = ["en", "lt"];
  const STORE = "recipes.lang";

  // Lithuanian counts in threes: 1 porcija, 2–9 porcijos, 0 and the teens
  // porcijų. Worth getting right -- it is on screen under every title.
  function porcijos(n) {
    const x = parseInt(n, 10);
    if (!Number.isFinite(x)) return "porcijos";
    const ones = x % 10, tens = x % 100;
    if (ones === 1 && tens !== 11) return "porcija";
    if (ones >= 2 && ones <= 9 && !(tens >= 11 && tens <= 19)) return "porcijos";
    return "porcijų";
  }

  const UI = {
    en: {
      brand: "Recipes",
      language: "Language",
      search: "Search recipes",
      clear: "Clear search",
      close: "Close recipe",
      ingredients: "Ingredients",
      method: "Method",
      watch: "Watch",
      copy: "Copy", copied: "Copied", copyFail: "Press ⌘C",
      share: "Share", shared: "Link copied", shareFail: "Could not copy",
      serves: (n) => `serves ${n}`,
      nothing: (q) => `Nothing matches “${q}”.`,
      fallback: "Not written in English yet — showing the Lithuanian.",
      noServer: "Open this through a web server — a file:// page cannot load recipes.json.",
      noLoad: (m) => `Could not load the recipes (${m}).`,
    },
    lt: {
      brand: "Receptai",
      language: "Kalba",
      search: "Ieškoti receptų",
      clear: "Išvalyti paiešką",
      close: "Uždaryti receptą",
      ingredients: "Sudedamosios dalys",
      method: "Gaminimas",
      watch: "Žiūrėti",
      copy: "Kopijuoti", copied: "Nukopijuota", copyFail: "Spauskite ⌘C",
      share: "Dalintis", shared: "Nuoroda nukopijuota", shareFail: "Nepavyko nukopijuoti",
      serves: (n) => `${n} ${porcijos(n)}`,
      nothing: (q) => `Pagal „${q}“ nieko nerasta.`,
      fallback: "Šis receptas dar neišverstas — rodoma angliškai.",
      noServer: "Atidarykite per interneto serverį — file:// puslapis negali įkelti recipes.json.",
      noLoad: (m) => `Nepavyko įkelti receptų (${m}).`,
    },
  };

  // The query string carries the language, so a link opens in the language it
  // was sent in. The hash stays what it has always been: which recipe is open.
  function firstLang() {
    const asked = new URLSearchParams(location.search).get("lang");
    if (LANGS.includes(asked)) return asked;
    try {
      const saved = localStorage.getItem(STORE);
      if (LANGS.includes(saved)) return saved;
    } catch { /* private mode */ }
    return (navigator.language || "en").toLowerCase().startsWith("lt") ? "lt" : "en";
  }

  let lang = firstLang();
  let collator = new Intl.Collator(lang, { sensitivity: "base" });
  const T = () => UI[lang];

  // Everything a recipe says, in the chosen language or the one it has.
  const said = (r) => r[lang] || r[r.langs[0]];

  function stampURL() {
    const url = new URL(location.href);
    url.searchParams.set("lang", lang);
    history.replaceState(history.state, "", url);
  }

  function setLang(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    collator = new Intl.Collator(lang, { sensitivity: "base" });
    try { localStorage.setItem(STORE, lang); } catch { /* private mode */ }
    stampURL();
    applyChrome();
    render();
    if (open) fill(bySlug.get(open));
  }

  // Every string that is not a recipe.
  function applyChrome() {
    const t = T();
    document.documentElement.lang = lang;
    $("brand").textContent = t.brand;
    $("langs").setAttribute("aria-label", t.language);
    for (const b of $("langs").querySelectorAll(".lang")) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    }
    input.placeholder = t.search;
    input.setAttribute("aria-label", t.search);
    clearBtn.setAttribute("aria-label", t.clear);
    $("close").setAttribute("aria-label", t.close);
    $("grab").setAttribute("aria-label", t.close);
    if (!open) document.title = t.brand;
  }

  /* ------------------------------------------------------------- helpers */

  const esc = (s) => s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Lowercase and strip accents, so "crème" matches "creme" and "vištiena"
  // matches "vistiena" — a keyboard without the Lithuanian letters still works.
  const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const ACCENTS = ["--blue", "--amber", "--emerald", "--pomegranate"];

  // Deterministic, so a recipe keeps its colour for good.
  function accent(slug) {
    let h = 0;
    for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
    return `var(${ACCENTS[h % ACCENTS.length]})`;
  }

  const isVideo = (url) => /(^|\.)(youtube\.com|youtu\.be)$/.test(hostOf(url));

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  }

  // The small subset of markdown that actually appears in a step.
  function inline(s) {
    return esc(s)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  }

  /* -------------------------------------------------------------- search */

  // Every language at once, so a Lithuanian word finds a recipe you are
  // reading in English and the other way round.
  function haystack(r) {
    const parts = [];
    for (const l of r.langs) {
      const d = r[l];
      parts.push(d.title, d.description, d.tags.join(" "),
                 d.names.join(" "), d.ingredients.join(" "));
    }
    return fold(parts.join(" \u0001 "));
  }

  function match(query) {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return recipes.slice();
    return recipes.filter((r) => terms.every((t) => r._hay.includes(t)));
  }

  // Highlight whichever terms land in the title; the rest match silently.
  function mark(title, query) {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return esc(title);
    const folded = fold(title);
    const hits = [];
    for (const t of terms) {
      let i = folded.indexOf(t);
      while (i !== -1) { hits.push([i, i + t.length]); i = folded.indexOf(t, i + t.length); }
    }
    if (!hits.length) return esc(title);
    hits.sort((a, b) => a[0] - b[0]);
    const merged = [hits[0]];
    for (const [s, e] of hits.slice(1)) {
      const last = merged[merged.length - 1];
      if (s <= last[1]) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    let out = "", at = 0;
    for (const [s, e] of merged) {
      out += esc(title.slice(at, s)) + "<mark>" + esc(title.slice(s, e)) + "</mark>";
      at = e;
    }
    return out + esc(title.slice(at));
  }

  /* ---------------------------------------------------------------- list */

  const PLAY = '<svg class="play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  function render() {
    const query = input.value.trim();
    const hits = match(query);
    clearBtn.hidden = !query;

    // A to Z in the language on screen: ą, č and š sort where they belong.
    hits.sort((a, b) => collator.compare(said(a).title, said(b).title));

    list.innerHTML = hits.map((r) => {
      const d = said(r);
      return `
      <li><button class="row" type="button" data-slug="${r.slug}" style="--accent:${accent(r.slug)}">
        <span class="text">
          <span class="name">${mark(d.title, query)}</span>
          ${d.time ? `<span class="meta">${esc(d.time)}</span>` : ""}
        </span>
        ${r.link && isVideo(r.link) ? PLAY : ""}
        ${CHEV}
      </button></li>`;
    }).join("");

    empty.hidden = hits.length > 0;
    if (!hits.length) empty.textContent = T().nothing(query);
  }

  /* --------------------------------------------------------------- sheet */

  function body(r) {
    const t = T(), d = said(r);
    let html = "";

    if (!r.langs.includes(lang)) {
      html += `<p class="fallback">${esc(t.fallback)}</p>`;
    }

    if (r.link) {
      const video = isVideo(r.link);
      html += `<a class="chip ${video ? "video" : "site"}" href="${esc(r.link)}"
                  target="_blank" rel="noopener noreferrer">
        ${video
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a16 16 0 0 1 0 18M12 3a16 16 0 0 0 0 18"/></svg>'}
        <span>${video ? esc(t.watch) : esc(hostOf(r.link))}</span></a>`;
    }

    html += `<section><h3>${esc(t.ingredients)}</h3><ul class="ings">${
      d.ingredients.map((i) => `<li>${inline(i)}</li>`).join("")}</ul></section>`;

    html += `<section><h3>${esc(t.method)}</h3><ol class="steps">${
      d.steps.map((s) => `<li>${inline(s)}</li>`).join("")}</ol>`;

    if (d.note) html += `<p class="note">${inline(d.note)}</p>`;
    return html + "</section>";
  }

  // Everything the sheet says, with no regard for whether it is already up.
  function fill(r) {
    const t = T(), d = said(r);
    sheet.style.setProperty("--accent", accent(r.slug));
    $("sheet-title").textContent = d.title;
    $("sheet-title").lang = r.langs.includes(lang) ? lang : r.langs[0];
    $("sheet-meta").textContent =
      [d.time, r.servings && t.serves(r.servings)].filter(Boolean).join(" · ");
    $("sheet-meta").hidden = !$("sheet-meta").textContent;
    $("sheet-body").innerHTML = body(r);
    resetAction("copy", t.copy);
    resetAction("share", t.share);
    document.title = `${d.title} · ${t.brand}`;
  }

  function show(slug) {
    const r = bySlug.get(slug);
    if (!r) return;
    open = slug;

    fill(r);
    $("sheet-body").scrollTop = 0;

    scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add("locked");

    scrim.hidden = false;
    sheet.hidden = false;
    sheet.style.transform = "";
    requestAnimationFrame(() => {
      scrim.classList.add("in");
      sheet.classList.add("in");
    });
    $("close").focus({ preventScroll: true });
  }

  function hide() {
    if (open === null) return;
    open = null;
    sheet.classList.remove("in");
    scrim.classList.remove("in");
    document.title = T().brand;

    const done = () => {
      sheet.hidden = true;
      scrim.hidden = true;
      sheet.style.transform = "";
      document.body.classList.remove("locked");
      document.body.style.top = "";
      window.scrollTo(0, scrollY);
    };
    sheet.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 320);   // in case the transition never fires
  }

  /* ------------------------------------------------------------- history */

  // The hash is the truth: #slug means the sheet is up. Android back, the
  // Close button and a swipe all go through the same one door.
  function sync() {
    const slug = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (slug && bySlug.has(slug)) {
      if (slug !== open) { hide(); show(slug); }
    } else {
      hide();
    }
  }

  function dismiss() {
    if (depth > 0) { depth--; history.back(); }
    else { history.replaceState(null, "", location.pathname + location.search); sync(); }
  }

  /* --------------------------------------------------------- copy, share */

  // Markdown markers are noise once this is pasted into a message.
  const flat = (s) => s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2");

  function asText(r) {
    const t = T(), d = said(r);
    const head = [d.time, r.servings && t.serves(r.servings)].filter(Boolean).join(" · ");
    return [
      d.title,
      head,
      "",
      t.ingredients,
      ...d.ingredients.map((i) => `- ${flat(i)}`),
      "",
      t.method,
      ...d.steps.map((s, n) => `${n + 1}. ${flat(s)}`),
      ...(d.note ? ["", flat(d.note)] : []),
      ...(r.link ? ["", r.link] : []),
      "",
      permalink(r.slug),
    ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
  }

  // The language travels with the link, so what you send is what they read.
  const permalink = (slug) =>
    `${location.origin}${location.pathname}?lang=${lang}#${slug}`;

  async function toClipboard(text) {
    try {
      // A browser that neither grants nor refuses leaves this pending for
      // good, which would mean no feedback at all. Time it out into the
      // fallback instead.
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, no) => setTimeout(() => no(new Error("timed out")), 1200)),
      ]);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  function flash(id, label) {
    const btn = $(id);
    btn.classList.add("done");
    $(id + "-label").textContent = label;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => resetAction(id, T()[id]), 1600);
  }

  function resetAction(id, label) {
    $(id).classList.remove("done");
    $(id + "-label").textContent = label;
  }

  /* -------------------------------------------------------- swipe to close */

  function draggable(el) {
    let startY = null, startT = 0, dy = 0;

    el.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      startY = e.clientY;
      startT = e.timeStamp;
      dy = 0;
      sheet.classList.add("dragging");
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener("pointermove", (e) => {
      if (startY === null) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
      scrim.style.opacity = String(Math.max(0, 1 - dy / 400));
    });

    const end = (e) => {
      if (startY === null) return;
      const speed = dy / Math.max(1, e.timeStamp - startT);
      sheet.classList.remove("dragging");
      sheet.style.transform = "";
      scrim.style.opacity = "";
      startY = null;
      if (dy > 90 || speed > 0.5) dismiss();
    };

    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  /* --------------------------------------------------------------- wiring */

  list.addEventListener("click", (e) => {
    const row = e.target.closest(".row");
    if (!row) return;
    depth++;
    location.hash = "#" + row.dataset.slug;
  });

  $("langs").addEventListener("click", (e) => {
    const btn = e.target.closest(".lang");
    if (btn) setLang(btn.dataset.lang);
  });

  input.addEventListener("input", render);
  input.addEventListener("search", render);

  clearBtn.addEventListener("click", () => {
    input.value = "";
    render();
    input.focus();
  });

  $("close").addEventListener("click", dismiss);
  $("grab").addEventListener("click", dismiss);
  scrim.addEventListener("click", dismiss);
  draggable($("grab"));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) { e.preventDefault(); dismiss(); }
    else if (e.key === "/" && document.activeElement !== input && !open) {
      e.preventDefault();
      input.focus();
    }
  });

  $("copy").addEventListener("click", async () => {
    const ok = await toClipboard(asText(bySlug.get(open)));
    flash("copy", ok ? T().copied : T().copyFail);
  });

  $("share").addEventListener("click", async () => {
    const r = bySlug.get(open);
    if (navigator.share) {
      try {
        await navigator.share({ title: said(r).title, url: permalink(r.slug) });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    const ok = await toClipboard(permalink(r.slug));
    flash("share", ok ? T().shared : T().shareFail);
  });

  window.addEventListener("hashchange", sync);

  /* ----------------------------------------------------------------- load */

  applyChrome();
  stampURL();

  fetch("recipes.json", { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      return res.json();
    })
    .then((data) => {
      recipes = data.recipes;
      recipes.forEach((r) => { r._hay = haystack(r); });
      bySlug = new Map(recipes.map((r) => [r.slug, r]));
      render();
      sync();
    })
    .catch((err) => {
      empty.hidden = false;
      empty.textContent = location.protocol === "file:"
        ? T().noServer
        : T().noLoad(err.message);
    });
})();
