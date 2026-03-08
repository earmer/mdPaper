#let mdp_article(body) = {
  set page(
    paper: "a4",
    margin: (top: 25mm, right: 25mm, bottom: 25mm, left: 25mm),
    header: context align(left)[R.U.B.B.I.S.H. Journal],
    footer: context align(center)[Page #counter(page).display()],
  )
  set text(font: "Times New Roman", size: 10.8pt)
  set par(first-line-indent: 2em, justify: true, leading: 0.65em)
  set heading(numbering: "1.")
  show heading.where(level: 1): set block(above: 1.4em, below: 0.8em)
  show heading.where(level: 2): set block(above: 1.1em, below: 0.6em)
  body
}
