# Translator's notes

Pitfalls learned the hard way while editing assets/translations/*.flt.

- Don't write generic "software" self-talk ("the software's biggest edge",
  "no feature needs..."). Speak to the logistics reality instead: containers,
  shipments, boxes, operators, loading.
- french.flt is NOT a translation of english.flt. Write independent French
  copy for the same point — own phrasing, own sentence structure.
- Established term mappings, don't improvise around these:
  - "native software" → "logiciel de bureau" (never "application native").
  - the automatic packing engine → "algorithme" in French (never "moteur"),
    see roadmap-done-engine = "Algorithme de chargement automatique".
- Before naming a concept in either language, grep the catalog for how it's
  already phrased elsewhere and reuse that term.
- Never coin logistics jargon — either a term is real or it isn't. Verify
  against real competitor cargo-loading software (e.g. EasyCargo,
  LoadOptimizer sites) or a dictionary/FranceTerme before using it.
  Confirmed real: "liste de colisage", "plan de chargement", "porte-à-faux",
  "empotage" (official term for container loading). Confirmed wrong: "logiciel
  de CAO" (that's CAD software, a different domain) — use "logiciel de
  planification de chargement".
