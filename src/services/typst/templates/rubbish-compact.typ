#let mdp_article(body) = {
  set page(
    paper: "a4",
    margin: (top: 22mm, right: 22mm, bottom: 22mm, left: 22mm),
    header: context align(left)[R.U.B.B.I.S.H. Journal (Compact)],
    footer: context align(center)[Page #counter(page).display()],
  )
  set text(font: "Times New Roman", size: 10.4pt)
  set par(first-line-indent: 2em, justify: true, leading: 0.55em)
  set heading(numbering: "1.")
  show heading.where(level: 1): set block(above: 1.4em, below: 0.8em)
  show heading.where(level: 2): set block(above: 1.1em, below: 0.6em)
  body
}
