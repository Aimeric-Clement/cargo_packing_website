# Home page fluff checklist

Goal: cut total content on `templates/index.html` by roughly half. Only 8 messages
actually matter:

1. Lenient with small loadout imperfections
2. A few languages (incl. Vietnamese)
3. Native-first, also usable in browser
4. Manual workflow as snappy as possible, alongside automatic placement
5. Shallow UX — no more than one click to do anything
6. Many containers at once — the main edge
7. Fast
8. In development

Anything that doesn't serve one of these 8 points, or that repeats a point already
made elsewhere on the page, is a fluff candidate. Snapping/alignment/hover-highlight
type details are explicitly OUT (UX detail, not a selling point).

Check a box to mark it for removal. Items marked `[STRUCTURAL]` remove a whole
section/div; items marked `[TRIM]` shorten wording but keep the element.

---

## 1. Hero section
- [x] `[STRUCTURAL]` Remove the "Live preview / 3D" stat block
      (`home-stat-live-preview*`) — doesn't map to any of the 8 points, purely
      decorative filler stat.

## 2. Feature strip (`#features`, 6 cards) — biggest source of duplication

- [x] `[TRIM]` Rewrite section intro: eyebrow "Desktop-first by design" +
      heading "All of the information on one screen" + description
      (`home-features-eyebrow/heading/description`) don't map to any of the 8
      points as worded. Replace with a single line stating native-first +
      browser-usable (#3), drop "all information on one screen" framing.
- [kinda: remove the smart alignement and hints, take in the context of "low click, keyboard" card, these are twice the same topic] `[TRIM]` Remove card **"Snappy and fluent interface"**
      (`home-feature-interface-*`) — restates "fast" (#7), already covered by
      the hero stat; also leans on "smart alignment/hints" which is the kind of
      UX detail explicitly called out as irrelevant.
- [x] `[STRUCTURAL]` Remove card **"Live 3D load inspection"**
      (`home-feature-inspection-*`) — hover dimensions / corner markers are UX
      detail, not one of the 8 points.
- [x] `[TRIM]` Card "Automatic and manual placement" (`home-feature-placement-*`,
      maps to #4) — trim description's periphrase ("Let the engine propose a
      tight baseline, then drag, rotate, and fine-tune every box by hand.") to a
      shorter statement of the same fact.
- [kinda: just remove it, it is a restatement of "snappy and fluent interface"] `[STRUCTURAL]` Card "Low-click, keyboard support and fast workflow"
      (`home-feature-workflow-*`, maps to #5) — shorten title and description,
      drop "Customizable key-binds and contextual shortcuts" clause (mechanism
      detail, not the point).

## 3. Showcase section (2 screenshot rows) — duplicates the feature strip

- [kinda: just rewrite the section, but we still need to keep the image with some description somehow] `[TRIM]` Remove row **"Cargo list panel"**
      (`home-inventory-*` + tags "Live search" / "Import & merge files" /
      "Safe editing") — none of these map to the 8 points; this is a second
      pass over "manual workflow" already covered above.
- [kinda: just rewrite the section to be more relevant] `[TRIM]` Remove row **"3D viewport"**
      (`home-viewport-*` + tags "Auto pack baseline" / "Snapping & alignment" /
      "Highlight on hover") — "Snapping & alignment" is exactly the kind of
      irrelevant UX detail called out; the rest duplicates the placement/
      inspection cards above.
