/*
 * [INPUT]: Fixed Alma 0.4.196 index.js presentation helpers.
 * [OUTPUT]: Selected original helper logic with local exports and explicit byte boundary.
 * [POS]: Presentation kernel support; no implicit filesystem or model access.
 * [PROTOCOL]: Update source-manifest.json and owning .folder.md when changed.
 */
function _D(e2) {
  return { slideId: e2.id, role: e2.role, layoutKey: e2.layoutKey, elements: e2.elements.map((e3) => ({ id: e3.id, type: e3.type, x: e3.x, y: e3.y, w: e3.w, h: e3.h, ..."text" === e3.type ? { text: e3.text, fontSize: e3.fontSize } : {}, ..."image" === e3.type ? { altText: e3.altText } : {} })) };
}
function SD(e2, t2) {
  const n2 = { title: e2.title, story: e2.story, design: e2.design, theme: e2.theme, slides: t2.map(_D) };
  return `Review the attached rendered PowerPoint slides as a demanding presentation art director and production QA reviewer.

The images appear in the same order as the slide metadata below. Judge the actual pixels, not the intended coordinates. Check clipping, unintended overlap, awkward wrapping, unreadable text, weak hierarchy, low contrast, empty or crowded composition, rendering artifacts, repeated adjacent layouts, and inconsistency with the design contract. Flag visible claims or charts that appear unsupported, mislabeled, or internally inconsistent as factual-risk. Use element IDs from the metadata when you can identify the responsible object.

Score each slide from 0 to 100. A production-ready slide must score at least 85 and have no blocker or major issues. Be strict. Do not reward a slide merely because it rendered. Return every requested slide exactly once.

Presentation contract and slide metadata:
${JSON.stringify(n2)}

Return only one JSON object with this exact shape:
{
  "slides": [{
    "slideId": "exact slide id",
    "score": 0,
    "issues": [{
      "severity": "blocker|major|minor",
      "category": "clipping|overlap|legibility|hierarchy|contrast|repetition|composition|consistency|factual-risk|rendering-artifact|review-integrity",
      "description": "specific visible problem",
      "suggestedRepair": "specific actionable repair",
      "elementIds": ["matching element id"]
    }],
    "strengths": ["at most three specific strengths"]
  }],
  "deckIssues": [{
    "severity": "blocker|major|minor",
    "category": "same category enum",
    "description": "cross-slide problem",
    "suggestedRepair": "specific actionable repair",
    "slideIds": ["affected slide ids"]
  }]
}`;
}

export { SD as reviewPrompt };
