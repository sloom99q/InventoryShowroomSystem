// Typst ports of kit/templates/templates.js. Layout only; every word, number
// and image comes from /data.json (prepared by render.ts) and mapped files.
//
// The kit's templates are HTML/CSS rendered by Chromium. To land text within
// ±2 pt of the reference, these templates reproduce the CSS box model:
// every text line sits in a line box of the CSS line-height, with its baseline
// at  top + (line-height − (ascent + descent)·size) / 2 + ascent·size,
// using each font's real hhea ascent/descent (same font files as the kit).
// Text uses baseline top/bottom edges so paragraph leading = line-height.

const COMMON = String.raw`
#let d = json("/data.json")
#let LIB = (0.9052734375, 0.2119140625)
#let CAL = (0.9521484375, 0.2685546875)
#let NASKH = (1.069, 0.634)
#let off(lh, size, m) = (lh - (m.at(0) + m.at(1)) * size) / 2 + m.at(0) * size

// A CSS block of text: line boxes of height lh; wraps like a browser.
#let lbox(lh, size, m: LIB, al: left, width: 100%, body) = {
  let o = off(lh, size, m)
  block(width: width, inset: (top: o, bottom: lh - o), spacing: 0pt, {
    set par(leading: lh, spacing: 0pt, justify: false, linebreaks: "simple")
    set align(al)
    set text(size: size)
    body
  })
}

// Shrink a one-line title by 1 px steps (0.75 pt) until it fits, like the kit's script.
#let fit-size(body, start, maxw, min: 10pt) = {
  let fs = start
  while measure(text(size: fs, body)).width > maxw and fs > min { fs -= 0.75pt }
  fs
}

#set text(top-edge: "baseline", bottom-edge: "baseline", hyphenate: false, kerning: true, ligatures: true)
#set par(linebreaks: "simple", justify: false, spacing: 0pt, leading: 0pt, first-line-indent: 0pt)
#set block(spacing: 0pt)
`

export const SPEC_SHEET = COMMON + String.raw`
#let RED = rgb("#B3001B")
#let W = 510.5pt
#set document(title: d.title)
#set page(
  width: 595.32pt, height: 841.92pt,
  margin: (top: 133.3pt, left: 42.5pt, right: 595.32pt - 42.5pt - W, bottom: 15pt),
  background: if d.banner != none { place(top + left, dy: 11.5pt, image(d.banner, width: 595.32pt, height: 114pt, fit: "cover")) },
)
#set text(font: ("Liberation Sans", "Noto Naskh Arabic"), fill: black)

#let bar(fill, label) = block(width: 100%, height: 22.9pt, fill: fill, inset: (top: 4.4pt, left: 10.1pt),
  lbox(14pt, 12pt, text(fill: white, weight: "bold", tracking: 3.05pt, label)))

#let check = image(bytes("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><path d='M1 5.6 L3.8 8.6 L9 1.4' fill='none' stroke='#B3001B' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>"), format: "svg", width: 7.4pt, height: 7.4pt)

#let content = {
  // Kicker and date
  grid(columns: (1fr, auto),
    lbox(13pt, 9pt, text(weight: "bold", fill: rgb("#555"), tracking: 3pt)[VEHICLE SPEC SHEET]),
    lbox(13pt, 9pt, al: right, width: auto)[Date: #d.date])

  // Title: brand + model in red, year in black; shrinks to stay on one line.
  v(6.2pt)
  context {
    let t = [#text(fill: RED, d.name + "\u{a0} ")#d.year]
    let fs = fit-size(text(weight: "bold", t), 32.04pt, W)
    lbox(36.5pt, fs, al: center, text(weight: "bold", t))
  }
  if d.subtitle != "" { lbox(12.5pt, 11.04pt, al: center, text(fill: rgb("#333"), d.subtitle)) }

  if d.price != none {
    v(9.6pt)
    grid(columns: (150pt, 1fr),
      block(width: 100%, height: 38.7pt, fill: rgb("#151515"), inset: (top: 5.7pt, left: 12pt), {
        lbox(16pt, 14.04pt, text(weight: "bold", fill: white, tracking: 1.6pt)[PRICE])
        lbox(9.2pt, 8.04pt, text(fill: rgb("#cfcfcf"), d.price.currency))
      }),
      block(width: 100%, height: 38.7pt, fill: RED, inset: (top: 6.3pt, right: 15pt),
        lbox(27pt, 24pt, al: right, text(weight: "bold", fill: white, d.price.amount))),
    )
  }

  if d.rows.len() > 0 {
    v(23pt)
    bar(RED, [SPECIFICATIONS])
    let row(i, body) = block(width: 100%, height: 16.5pt, fill: if calc.odd(i) { rgb("#F2F2F2") }, {
      if i > 0 { place(top, line(length: 100%, stroke: 0.5pt + rgb("#E2E2E2"))) }
      if i == d.rows.len() - 1 { place(bottom, line(length: 100%, stroke: 0.5pt + rgb("#E2E2E2"))) }
      set text(weight: "bold")
      body
    })
    // English rows first; the Arabic labels follow as a separate layer over the
    // same block (so text extraction keeps the English values on their own
    // lines), a touch lower, as Chromium places the taller Arabic glyphs.
    block(width: 100%, {
      for (i, r) in d.rows.enumerate() {
        row(i, grid(columns: (124.9pt, 262.2pt, 123.4pt),
          block(inset: (top: 2.55pt, left: 10.1pt), lbox(11.4pt, 9.96pt, text(fill: rgb("#555"), r.k))),
          block(inset: (top: 2.55pt, x: 6pt), lbox(11.4pt, 9.96pt, al: center, text(fill: rgb("#1a1a1a"), r.v))),
        ))
      }
      place(top + right, block(width: 123.4pt, {
        set text(weight: "bold")
        for r in d.rows {
          block(height: 16.5pt, inset: (top: 2.55pt + 0.6pt, left: 4pt), width: 100%,
            lbox(11.4pt, 9.96pt, al: right, text(fill: rgb("#1a1a1a"), dir: rtl, r.a)))
        }
      }))
    })
  }

  if d.features.len() > 0 {
    v(20.3pt)
    bar(rgb("#151515"), [KEY FEATURES])
    v(7pt)
    grid(columns: (255.2pt, 255.2pt), ..d.features.map(col => {
      for t in col {
        block(width: 100%, height: 16.4pt, {
          place(top + left, dx: 6pt, dy: 4.6pt, check)
          block(inset: (left: 21pt), clip: true, width: 100%, lbox(16.4pt, 9.96pt, t))
        })
      }
    }))
  }

  v(34.8pt)
  lbox(11.45pt, 9.96pt)[#d.signature \ #d.legal]
  if d.disclaimer != "" {
    v(5.8pt)
    lbox(9.3pt, 8.04pt, text(style: "italic", fill: rgb("#555"), d.disclaimer))
  }
}

// Report whether the content is taller than the page area (the kit's 15 pt bottom margin).
#context {
  let h = measure(block(width: W, content)).height
  [#metadata((doc: "specsheet", height: h.pt(), limit: (841.92pt - 133.3pt - 15pt).pt())) <layout>]
}
#content
`

export const BROCHURE = COMMON + String.raw`
#set document(title: d.title)
#set page(width: 960pt, height: 540pt, margin: 0pt)
#set text(font: ("Carlito", "Noto Naskh Arabic"))

#let full(path) = image(path, width: 960pt, height: 540pt, fit: "cover")

// Cover: photo full-bleed, name and year top-left in light text.
#page(background: if d.cover != none { full(d.cover) }, {
  // The original's soft text shadow: a faint dark glow behind the title.
  place(top + left, dx: -40pt, dy: -40pt, rect(width: 760pt, height: 230pt, fill: gradient.radial(rgb(0, 0, 0, 30%), rgb(0, 0, 0, 0%), center: (20%, 35%), radius: 70%)))
  place(top + left, dx: 7.2pt, dy: 12pt, block(width: 950pt,
    lbox(64.8pt, 54pt, m: CAL, text(fill: rgb(d.cover_color), d.name + "\n" + d.year))))
})

#let en-col(secs) = for s in secs {
  if s.en.len() > 0 {
    block(below: 16.9pt, {
      lbox(14.6pt, 14.04pt, m: CAL, text(weight: "bold", s.title))
      v(1.3pt)
      for t in s.en {
        block(width: 100%, {
          place(top + left, dy: off(15.6pt, 12.96pt, LIB), text(font: "Liberation Sans", size: 12.96pt)[•])
          block(inset: (left: 25.6pt), lbox(15.6pt, 12.96pt, m: CAL, t))
        })
      }
    })
  }
}

#let ar-col(secs) = for s in secs {
  if s.ar.len() > 0 {
    block(below: 11.2pt, {
      lbox(14.6pt, 14.04pt, m: CAL, al: right, text(weight: "bold", s.title))
      v(6pt)
      for t in s.ar {
        block(width: 100%, {
          place(top + right, dy: off(14.4pt, 12pt, NASKH), text(font: "Liberation Sans", size: 12pt)[•])
          block(inset: (right: 25pt), lbox(14.4pt, 12pt, m: NASKH, al: right, text(font: ("Noto Naskh Arabic", "Carlito"), dir: rtl, t)))
        })
      }
    })
  }
}

#for (n, secs) in d.slides.enumerate() {
  page(background: if d.watermark != none { place(top + left, dx: 64.2pt, dy: 16.9pt, image(d.watermark, width: 810pt, height: 523.1pt, fit: "contain")) }, {
    set text(fill: rgb("#767171"))
    block(width: 960pt, height: 109.5pt, inset: (top: 49.6pt), context {
      let fs = fit-size(text(weight: "bold", d.title), 66pt, 960pt)
      lbox(66pt, fs, m: CAL, al: center, text(weight: "bold", fill: rgb("#7F7F7F"), d.title))
    })
    let en = block(width: 378pt, en-col(secs))
    let ar = block(width: 390pt, inset: (top: 3.9pt), ar-col(secs))
    context {
      let h = calc.max(measure(en).height, measure(ar).height)
      [#metadata((doc: "brochure", slide: n + 1, bottom: (109.5pt + 1pt + h).pt(), limit: (540pt - 6pt).pt())) <layout>]
    }
    // The English column is drawn first so text extraction finds it first.
    place(top + left, dx: 41.2pt, dy: 110.5pt, en)
    place(top + right, dx: -54.7pt, dy: 110.5pt, ar)
  })
}

#for p in d.photos { page(background: full(p))[] }
`
