/* The browse page: faceted filtering over recipes.json, which
   scripts/build_index.py regenerates before every Quarto render. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = { q: $("q"), tags: $("tags"), ings: $("ings"), ingq: $("ingq"),
               results: $("results"), count: $("count"), active: $("active"),
               empty: $("empty"), clear: $("clear"), sort: $("sort"),
               built: $("built") };
  if (!el.results) return;

  const state = {
    q: "", tags: new Set(), ings: new Set(), ingq: "",
    sort: "az", view: "grid", kind: "all", deep: true,
  };

  let all = [];
  let bySlug = new Map();
  let shown = [];

  const esc = (s) => String(s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  const minutes = (t) => {
    if (!t) return 1e6;
    const h = /(\d+)\s*h/.exec(t), m = /(\d+)\s*min/.exec(t);
    const total = (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
    return total || 1e6;
  };

  // ---- matching ---------------------------------------------------------

  const namesOf = (r) => (state.deep ? r.deep : r.names);

  const haystack = (r) => norm([r.title, r.description, r.tags.join(" "),
                                r.ingredients.join(" "), namesOf(r).join(" ")].join(" "));

  function matches(r) {
    if (state.kind === "dish" && r.is_ingredient) return false;
    if (state.kind === "ingredient" && !r.is_ingredient) return false;
    for (const t of state.tags) if (!r.tags.includes(t)) return false;
    const names = namesOf(r);
    for (const i of state.ings) if (!names.includes(i)) return false;
    if (state.q) {
      const hay = haystack(r);
      if (!norm(state.q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  /* When a match only holds because a sub-recipe was unpacked, say which one. */
  function via(r) {
    if (!state.deep || !state.ings.size) return null;
    const missing = [...state.ings].filter((i) => !r.names.includes(i));
    if (!missing.length) return null;
    const parts = new Set();
    for (const slug of r.uses || []) {
      const c = bySlug.get(slug);
      if (c && missing.some((i) => c.deep.includes(i))) parts.add(c.title);
    }
    return parts.size ? [...parts].join(", ") : null;
  }

  // ---- rendering --------------------------------------------------------

  /* ---- watercolour placeholders -------------------------------------
     A recipe with no photo gets a painted wash instead of a grey box: two
     pigments bled through an SVG turbulence filter, deterministic from the
     slug, so a given recipe always looks the same. No image assets. */

  const PIGMENTS = [
    ["#2f6690", "#6ba3c7"],   // azulejo blue
    ["#c1553a", "#e08a68"],   // terracotta
    ["#cf9640", "#e6bd77"],   // ochre
    ["#5f7d4a", "#9ab37c"],   // olive
    ["#7e4a68", "#b083a0"],   // plum
    ["#2f8378", "#74b3a8"],   // Atlantic green
  ];

  function hash(s) {
    let h = 2166136261;
    for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function watercolour(r) {
    const h = hash(r.slug);
    const pick = (n, lo, hi) => lo + ((h >>> (n * 3)) % 997) / 997 * (hi - lo);
    // Two pigments, never from the same family, or every card turns out green.
    const i = h % PIGMENTS.length;
    const j = (i + 1 + ((h >>> 11) % (PIGMENTS.length - 1))) % PIGMENTS.length;
    const a = PIGMENTS[i];
    const b = PIGMENTS[j];
    const id = `wc-${r.slug}`;
    const initial = esc((r.title.trim()[0] || "?").toUpperCase());

    return `<div class="thumb ph" aria-hidden="true">
      <svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="${esc(id)}" x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence type="fractalNoise" baseFrequency="0.021 0.032"
                          numOctaves="4" seed="${h % 500}" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="17"
                               xChannelSelector="R" yChannelSelector="G"/>
            <feGaussianBlur stdDeviation="0.45"/>
          </filter>
        </defs>
        <rect width="120" height="90" fill="var(--paper-3)"/>
        <g class="wc" filter="url(#${esc(id)})">
          <ellipse cx="${pick(1, 38, 74).toFixed(1)}" cy="${pick(2, 34, 54).toFixed(1)}"
                   rx="${pick(3, 36, 48).toFixed(1)}" ry="${pick(4, 25, 34).toFixed(1)}"
                   fill="${a[0]}" opacity="0.55"/>
          <ellipse cx="${pick(5, 46, 86).toFixed(1)}" cy="${pick(6, 30, 58).toFixed(1)}"
                   rx="${pick(7, 28, 42).toFixed(1)}" ry="${pick(8, 20, 30).toFixed(1)}"
                   fill="${b[1]}" opacity="0.5" style="mix-blend-mode:multiply"/>
          <ellipse cx="${pick(9, 24, 60).toFixed(1)}" cy="${pick(2, 40, 62).toFixed(1)}"
                   rx="${pick(4, 16, 26).toFixed(1)}" ry="${pick(6, 12, 20).toFixed(1)}"
                   fill="${a[1]}" opacity="0.45" style="mix-blend-mode:multiply"/>
          <ellipse cx="${pick(1, 38, 74).toFixed(1)}" cy="${pick(2, 34, 54).toFixed(1)}"
                   rx="${pick(3, 36, 48).toFixed(1)}" ry="${pick(4, 25, 34).toFixed(1)}"
                   fill="none" stroke="${a[0]}" stroke-width="1.4" opacity="0.3"/>
        </g>
        <text x="60" y="45" dy="0.35em" text-anchor="middle" font-size="34"
              font-family="Fraunces, Georgia, serif" font-weight="600"
              fill="var(--azul-deep)" opacity="0.5">${initial}</text>
      </svg>
    </div>`;
  }

  function thumb(r) {
    if (!r.image) return watercolour(r);
    return `<img class="thumb" src="${esc(r.image)}" alt="" loading="lazy" decoding="async">`;
  }

  function card(r) {
    const v = via(r);
    const tags = r.tags.map((t) =>
      `<span class="tag${state.tags.has(t) ? " hit" : ""}">${esc(t)}</span>`).join("");
    const bits = [r.time && `⏱ ${esc(r.time)}`, r.servings && `🍽 ${esc(r.servings)}`]
      .filter(Boolean).join("<span class=dot>·</span>");
    return `<a class="card" href="${esc(r.url)}">
      ${thumb(r)}
      <div class="cardbody">
        <div class="cardtitle">${esc(r.title)}${
          r.is_ingredient ? ' <span class="badge" title="This recipe is used as an ingredient in other recipes">ingredient</span>' : ""}</div>
        ${r.description ? `<p class="cardnote">${esc(r.description)}</p>` : ""}
        <div class="tagline">${tags}</div>
        ${v ? `<div class="viahint">via ${esc(v)}</div>` : ""}
        <div class="meta">${bits}</div>
      </div>
    </a>`;
  }

  function renderChips() {
    const counts = new Map();
    for (const r of shown) for (const t of r.tags) counts.set(t, (counts.get(t) || 0) + 1);
    const tags = [...new Set(all.flatMap((r) => r.tags))].sort();
    el.tags.innerHTML = tags.map((t) => {
      const n = counts.get(t) || 0;
      const on = state.tags.has(t);
      return `<button type="button" class="chip${n || on ? "" : " zero"}"
        aria-pressed="${on}" data-tag="${esc(t)}">${esc(t)}<span class="n">${n}</span></button>`;
    }).join("");
  }

  function renderIngredients() {
    const counts = new Map();
    for (const r of shown) for (const n of namesOf(r)) counts.set(n, (counts.get(n) || 0) + 1);
    const q = norm(state.ingq);
    let list = [...new Set([...counts.keys(), ...state.ings])]
      .filter((n) => !q || norm(n).includes(q));
    list.sort((a, b) => {
      const sa = state.ings.has(a), sb = state.ings.has(b);
      if (sa !== sb) return sa ? -1 : 1;
      const d = (counts.get(b) || 0) - (counts.get(a) || 0);
      return d || a.localeCompare(b);
    });
    el.ings.innerHTML = list.length
      ? list.map((n) => `<label><input type="checkbox" data-ing="${esc(n)}"
          ${state.ings.has(n) ? "checked" : ""}><span>${esc(n)}</span>
          <span class="n">${counts.get(n) || 0}</span></label>`).join("")
      : `<p class="none">No ingredient matches “${esc(state.ingq)}”.</p>`;
  }

  function renderActive() {
    const pills = [
      ...[...state.tags].map((t) => [`tag`, t, t]),
      ...[...state.ings].map((i) => [`ing`, i, i]),
    ];
    el.active.innerHTML = pills.map(([k, v, label]) =>
      `<button type="button" class="pill" data-drop="${k}" data-value="${esc(v)}">${esc(label)}</button>`).join("");
    el.clear.hidden = !(state.tags.size || state.ings.size || state.q);
  }

  function render() {
    shown = all.filter(matches);
    shown.sort((a, b) =>
      state.sort === "time" ? minutes(a.time) - minutes(b.time) || a.title.localeCompare(b.title)
      : state.sort === "short" ? a.ingredients.length - b.ingredients.length || a.title.localeCompare(b.title)
      : a.title.localeCompare(b.title));

    el.results.className = `cards ${state.view}`;
    el.results.innerHTML = shown.map(card).join("");
    el.count.textContent = `${shown.length} of ${all.length} recipe${all.length === 1 ? "" : "s"}`;
    el.empty.hidden = shown.length > 0;

    renderChips();
    renderIngredients();
    renderActive();
    writeHash();
  }

  // ---- shareable URLs ---------------------------------------------------

  let quiet = false;

  function writeHash() {
    if (quiet) return;
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    for (const t of state.tags) p.append("tag", t);
    for (const i of state.ings) p.append("ing", i);
    if (state.kind !== "all") p.set("kind", state.kind);
    if (!state.deep) p.set("deep", "0");
    if (state.sort !== "az") p.set("sort", state.sort);
    const h = p.toString();
    history.replaceState(null, "", h ? `#${h}` : location.pathname);
  }

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    state.q = p.get("q") || "";
    state.tags = new Set(p.getAll("tag"));
    state.ings = new Set(p.getAll("ing"));
    state.kind = p.get("kind") || "all";
    state.deep = p.get("deep") !== "0";
    state.sort = p.get("sort") || "az";
    el.q.value = state.q;
    el.sort.value = state.sort;
    const deepBox = $("deep");
    if (deepBox) deepBox.checked = state.deep;
    document.querySelectorAll("[data-kind]").forEach((b) =>
      b.classList.toggle("on", b.dataset.kind === state.kind));
  }

  // ---- events -----------------------------------------------------------

  el.q.addEventListener("input", () => { state.q = el.q.value.trim(); render(); });
  el.ingq.addEventListener("input", () => { state.ingq = el.ingq.value.trim(); renderIngredients(); });
  el.sort.addEventListener("change", () => { state.sort = el.sort.value; render(); });

  el.tags.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tag]");
    if (!b) return;
    state.tags.has(b.dataset.tag) ? state.tags.delete(b.dataset.tag) : state.tags.add(b.dataset.tag);
    render();
  });

  el.ings.addEventListener("change", (e) => {
    const b = e.target.closest("[data-ing]");
    if (!b) return;
    b.checked ? state.ings.add(b.dataset.ing) : state.ings.delete(b.dataset.ing);
    render();
  });

  el.active.addEventListener("click", (e) => {
    const b = e.target.closest("[data-drop]");
    if (!b) return;
    (b.dataset.drop === "tag" ? state.tags : state.ings).delete(b.dataset.value);
    render();
  });

  function clearAll() {
    state.q = ""; state.tags.clear(); state.ings.clear(); state.ingq = "";
    el.q.value = ""; el.ingq.value = "";
    render();
  }
  el.clear.addEventListener("click", clearAll);
  el.empty.addEventListener("click", (e) => { if (e.target.dataset.clear !== undefined) clearAll(); });

  document.addEventListener("click", (e) => {
    const v = e.target.closest("[data-view]");
    if (v) {
      state.view = v.dataset.view;
      document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("on", b === v));
      render();
      return;
    }
    const k = e.target.closest("[data-kind]");
    if (k) {
      state.kind = k.dataset.kind;
      document.querySelectorAll("[data-kind]").forEach((b) => b.classList.toggle("on", b === k));
      render();
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "deep") { state.deep = e.target.checked; render(); }
  });

  // Keyboard: "/" jumps to search, arrows walk the cards, Escape backs out.
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); el.q.focus(); el.q.select(); return; }
    if (e.key === "Escape") {
      if (typing) { document.activeElement.blur(); return; }
      clearAll();
      return;
    }
    if (typing && !/^Arrow(Down|Up)$/.test(e.key)) return;

    const cards = [...el.results.querySelectorAll(".card")];
    if (!cards.length) return;
    const cur = cards.indexOf(document.activeElement);
    const perRow = state.view === "list" ? 1 : Math.max(1,
      Math.round(el.results.clientWidth / (cards[0].offsetWidth + 16)));
    let next = null;
    if (e.key === "ArrowRight") next = cur + 1;
    else if (e.key === "ArrowLeft") next = cur - 1;
    else if (e.key === "ArrowDown") next = cur < 0 ? 0 : cur + perRow;
    else if (e.key === "ArrowUp") next = cur - perRow;
    else return;
    e.preventDefault();
    cards[Math.max(0, Math.min(cards.length - 1, next))].focus();
  });

  // ---- boot -------------------------------------------------------------

  fetch("recipes.json", { cache: "no-cache" })
    .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
    .then((data) => {
      all = data.recipes;
      bySlug = new Map(all.map((r) => [r.slug, r]));
      if (el.built) el.built.textContent = `${all.length} recipes · indexed ${data.built}`;
      quiet = true; readHash(); quiet = false;
      render();
    })
    .catch((err) => {
      el.count.textContent = "";
      el.results.innerHTML = `<p class="empty">Could not load <code>recipes.json</code>
        (${esc(err.message)}). Run <code>quarto preview</code> rather than opening the
        file directly — <code>file://</code> pages are not allowed to fetch.</p>`;
    });
})();
