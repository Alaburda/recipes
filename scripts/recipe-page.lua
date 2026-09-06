--[[
  Renders the front-matter facts that Pandoc would otherwise ignore, so a photo
  and a time only ever have to be written once (in the front matter) and show up
  both on the card and on the recipe page.

  Only touches pages carrying `recipe: true`, which recipes/_metadata.yml sets
  for every file in that folder. Everything else passes through untouched.
]]

local stringify = pandoc.utils.stringify

local function field(meta, key)
  local v = meta[key]
  if v == nil then return nil end
  local s = stringify(v)
  if s == "" then return nil end
  return s
end

function Pandoc(doc)
  if not doc.meta.recipe then return doc end

  local head = pandoc.List({})

  local image = field(doc.meta, "image")
  if image then
    -- Recipe pages always live one level down, in recipes/.
    if not image:match("^https?://") then image = "../" .. image end
    head:insert(pandoc.Para({
      pandoc.Image({}, image, "", pandoc.Attr("", { "recipe-hero" },
        { { "style", "filter:url(#deckle)" } }))
    }))
  end

  local bits = pandoc.List({})
  local function add(inlines)
    if #bits > 0 then
      bits:insert(pandoc.Space())
      bits:insert(pandoc.Str("·"))
      bits:insert(pandoc.Space())
    end
    bits:extend(inlines)
  end

  local time = field(doc.meta, "time")
  if time then add({ pandoc.Str("⏱ " .. time) }) end

  local servings = field(doc.meta, "servings")
  if servings then add({ pandoc.Str("🍽 " .. servings) }) end

  local source = field(doc.meta, "source")
  if source then
    add({ pandoc.Link({ pandoc.Str("source") }, source) })
  end

  if #bits > 0 then
    head:insert(pandoc.Div(pandoc.Plain(bits), pandoc.Attr("", { "recipe-meta" })))
  end

  head:extend(doc.blocks)
  doc.blocks = head
  return doc
end
