#let mdp_render_lines(lines, align_to: center) = {
  for line in lines {
    if line != "" {
      align(align_to)[#line]
    }
  }
}

#let mdp_render_author_marker(markers) = {
  if markers != "" {
    super[#text(size: 1em)[#markers]]
  }
}

#let mdp_render_authors(authors, align_to: center) = {
  for author in authors {
    let name = author.at("name", default: "")
    let markers = author.at("markers", default: "")
    if name != "" {
      align(align_to)[#name#mdp_render_author_marker(markers)]
    }
  }
}

#let mdp_render_keywords(keywords) = {
  let filtered = keywords.filter(keyword => keyword != "")
  if filtered.len() > 0 {
    filtered.join("; ")
  }
}

#let mdp_frontmatter(
  title: "",
  subtitle: "",
  authors: (),
  affiliations: (),
  corresponding: "",
  funding: "",
  abstract: "",
  keywords: (),
) = {
  if title != "" {
    align(center)[#text(size: 16pt, weight: "bold")[#title]]
  }
  if subtitle != "" {
    v(0.5em)
    align(center)[#emph[#subtitle]]
  }
  if authors.len() > 0 {
    v(0.8em)
    mdp_render_authors(authors)
  }
  if affiliations.len() > 0 {
    v(0.4em)
    mdp_render_lines(affiliations)
  }
  if corresponding != "" {
    v(0.4em)
    align(center)[#strong[Corresponding author:] #corresponding]
  }
  if funding != "" {
    v(0.6em)
    [#strong[Funding:] #funding]
  }
  if abstract != "" {
    v(0.8em)
    [#strong[Abstract]]

    abstract
  }
  if keywords.len() > 0 {
    v(0.4em)
    [#strong[Keywords:] #mdp_render_keywords(keywords)]
  }
  v(1.2em)
}
