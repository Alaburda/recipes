/* Recipes — one list, one sheet.
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

  /* ------------------------------------------------------------- helpers */

  const esc = (s) => s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Lowercase and strip accents, so "crème" matches "creme".
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

  function haystack(r) {
    return fold([r.title, r.description, r.tags.join(" "),
                 r.names.join(" "), r.ingredients.join(" ")].join(" \u0001 "));
  }

  function match(query) {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return recipes;
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

    list.innerHTML = hits.map((r) => `
      <li><button class="row" type="button" data-slug="${r.slug}" style="--accent:${accent(r.slug)}">
        <span class="text">
          <span class="name">${mark(r.title, query)}</span>
          ${r.time ? `<span class="meta">${esc(r.time)}</span>` : ""}
        </span>
        ${r.link && isVideo(r.link) ? PLAY : ""}
        ${CHEV}
      </button></li>`).join("");

    empty.hidden = hits.length > 0;
    if (!hits.length) empty.textContent = `Nothing matches “${query}”.`;
  }

  /* --------------------------------------------------------------- sheet */

  function body(r) {
    let html = "";

    if (r.link) {
      const video = isVideo(r.link);
      html += `<a class="chip ${video ? "video" : "site"}" href="${esc(r.link)}"
                  target="_blank" rel="noopener noreferrer">
        ${video
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a16 16 0 0 1 0 18M12 3a16 16 0 0 0 0 18"/></svg>'}
        <span>${video ? "Watch" : esc(hostOf(r.link))}</span></a>`;
    }

    html += `<section><h3>Ingredients</h3><ul class="ings">${
      r.ingredients.map((i) => `<li>${inline(i)}</li>`).join("")}</ul></section>`;

    html += `<section><h3>Method</h3><ol class="steps">${
      r.steps.map((s) => `<li>${inline(s)}</li>`).join("")}</ol>`;

    if (r.note) html += `<p class="note">${inline(r.note)}</p>`;
    return html + "</section>";
  }

  function show(slug) {
    const r = bySlug.get(slug);
    if (!r) return;
    open = slug;

    sheet.style.setProperty("--accent", accent(slug));
    $("sheet-title").textContent = r.title;
    $("sheet-meta").textContent =
      [r.time, r.servings && `serves ${r.servings}`].filter(Boolean).join(" · ");
    $("sheet-meta").hidden = !$("sheet-meta").textContent;
    $("sheet-body").innerHTML = body(r);
    $("sheet-body").scrollTop = 0;
    resetAction("copy", "Copy");
    resetAction("share", "Share");

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
    document.title = `${r.title} · Recipes`;
  }

  function hide() {
    if (open === null) return;
    open = null;
    sheet.classList.remove("in");
    scrim.classList.remove("in");
    document.title = "Recipes";

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
    const head = [r.time, r.servings && `serves ${r.servings}`].filter(Boolean).join(" · ");
    return [
      r.title,
      head,
      "",
      "Ingredients",
      ...r.ingredients.map((i) => `- ${flat(i)}`),
      "",
      "Method",
      ...r.steps.map((s, n) => `${n + 1}. ${flat(s)}`),
      ...(r.note ? ["", flat(r.note)] : []),
      ...(r.link ? ["", r.link] : []),
      "",
      permalink(r.slug),
    ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
  }

  const permalink = (slug) =>
    location.origin + location.pathname + "#" + slug;

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
    btn._t = setTimeout(() => resetAction(id, id === "copy" ? "Copy" : "Share"), 1600);
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
    flash("copy", ok ? "Copied" : "Press ⌘C");
  });

  $("share").addEventListener("click", async () => {
    const r = bySlug.get(open);
    if (navigator.share) {
      try {
        await navigator.share({ title: r.title, url: permalink(r.slug) });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    const ok = await toClipboard(permalink(r.slug));
    flash("share", ok ? "Link copied" : "Could not copy");
  });

  window.addEventListener("hashchange", sync);

  /* ----------------------------------------------------------------- load */

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
        ? "Open this through a web server — a file:// page cannot load recipes.json."
        : "Could not load the recipes (" + err.message + ").";
    });
})();
