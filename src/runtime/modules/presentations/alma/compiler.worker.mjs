/*
 * [INPUT]: Fixed Alma 0.4.196 presentationCompiler.worker.js.
 * [OUTPUT]: Migrated presentation kernel; formatting and local import adaptation, release telemetry preamble removed.
 * [POS]: Internal host worker/model; not an employee-facing tool or permission boundary.
 * [PROTOCOL]: Update source-manifest.json and owning .folder.md when changed.
 */
import { parentPort as r } from "node:worker_threads";
import n from "node:fs/promises";
import o from "node:path";
import i from "pptxgenjs";
import a from "qrcode";
import s from "jszip";
import { renderMermaidSVG as l } from "beautiful-mermaid";
import { v as p, r as c, p as d } from "./model.mjs";
import { mathjax as f } from "@mathjax/src/js/mathjax.js";
import { TeX as u } from "@mathjax/src/js/input/tex.js";
import { SVG as h } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor as g } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler as b } from "@mathjax/src/js/handlers/html.js";
import "zod";
import "@iconify-json/lucide";
import "@iconify/utils";
const m = g();
b(m);
const w = f.document("", { InputJax: new u(), OutputJax: new h({ fontCache: "none" }) }), $ = i.default ?? i;
function v(t) {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(t)) throw new Error("SVG element must contain an <svg> root");
  if (/<(?:script|foreignObject)\b/i.test(t) || /\son[a-z]+\s*=/i.test(t) || /(?:href|src)\s*=\s*["'](?:https?:|file:|javascript:)/i.test(t) || /@import\b/i.test(t) || /url\(\s*["']?\s*(?:https?:|file:|javascript:)/i.test(t)) throw new Error("SVG element contains active or external content");
  return `data:image/svg+xml;base64,${Buffer.from(t, "utf8").toString("base64")}`;
}
function y(t, e, r2) {
  const n2 = (t2) => {
    const e2 = t2.replace(/^#/, "");
    return [0, 2, 4].map((t3) => Number.parseInt(e2.slice(t3, t3 + 2), 16));
  }, o2 = n2(t), i2 = n2(e), a2 = r2 / 100;
  return `#${o2.map((t2, e2) => Math.round(t2 * a2 + i2[e2] * (1 - a2))).map((t2) => t2.toString(16).padStart(2, "0")).join("")}`;
}
function x(t, e) {
  const r2 = t.match(/\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i), n2 = Number(r2?.[1]), o2 = Number(r2?.[2]);
  if (!(n2 > 0 && o2 > 0)) return e;
  const i2 = n2 / o2;
  if (i2 >= e.w / e.h) {
    const t2 = e.w / i2;
    return { x: e.x, y: e.y + (e.h - t2) / 2, w: e.w, h: t2 };
  }
  const a2 = e.h * i2;
  return { x: e.x + (e.w - a2) / 2, y: e.y, w: a2, h: e.h };
}
async function L(t, e, r2) {
  if ("text" === e.type) return void t.addText(e.runs ? (function(t2) {
    return (t2.runs ?? []).map((t3) => ({ text: t3.text, options: { fontFace: t3.fontFace, fontSize: t3.fontSize, color: t3.color, bold: t3.bold, italic: t3.italic, underline: t3.underline ? { style: "sng" } : void 0, strike: t3.strike, superscript: t3.superscript, subscript: t3.subscript, breakLine: t3.breakLine, softBreakBefore: t3.softBreakBefore, bullet: t3.bullet, indentLevel: t3.indentLevel, hyperlink: t3.hyperlink } }));
  })(e) : e.text, (function(t2, e2) {
    return { objectName: t2.id, x: t2.x, y: t2.y, w: t2.w, h: t2.h, fontFace: t2.fontFace ?? e2.theme.bodyFontFace, fontSize: t2.fontSize, color: t2.color ?? e2.theme.foreground, bold: t2.bold, italic: t2.italic, align: t2.align, valign: t2.valign, margin: t2.margin, breakLine: t2.breakLine, transparency: t2.transparency, fit: t2.fit, lineSpacing: t2.lineSpacing, paraSpaceBefore: t2.paragraphSpacingBefore, paraSpaceAfter: t2.paragraphSpacingAfter, bullet: t2.bullet, indentLevel: t2.indentLevel, hyperlink: t2.hyperlink };
  })(e, r2));
  if ("image" === e.type) return void t.addImage({ objectName: e.id, path: o.isAbsolute(e.path) ? e.path : o.resolve(r2.assetBasePath, e.path), x: e.x, y: e.y, w: e.w, h: e.h, sizing: "stretch" === e.fit ? void 0 : { type: e.fit, w: e.w, h: e.h }, altText: e.altText, transparency: e.transparency, rounding: e.rounding });
  if ("svg" === e.type) {
    const r3 = "contain" === e.fit ? x(e.svg, e) : e;
    return void t.addImage({ objectName: e.id, data: v(e.svg), x: r3.x, y: r3.y, w: r3.w, h: r3.h, altText: e.altText, hyperlink: e.hyperlink });
  }
  if ("diagram" === e.type) {
    const n3 = (function(t2, e2) {
      const r3 = { bg: `#${t2.background ?? e2.theme.background}`, fg: `#${t2.foreground ?? e2.theme.foreground}`, line: `#${t2.line ?? e2.theme.muted}`, accent: `#${t2.accent ?? e2.theme.accent}`, muted: `#${e2.theme.muted}`, surface: `#${t2.surface ?? e2.theme.background}`, border: `#${t2.border ?? e2.theme.muted}` }, n4 = l(t2.source, { ...r3, font: e2.theme.bodyFontFace, padding: t2.padding, transparent: t2.transparent }).replace(/\s*@import\s+url\([^)]*\);?/gi, "");
      if (!n4.includes("<svg")) throw new Error(`Diagram ${t2.id} could not be rendered`);
      return (function(t3, e3) {
        const r4 = { bg: e3.bg, fg: e3.fg, line: e3.line, accent: e3.accent, muted: e3.muted, surface: e3.surface, border: e3.border, i: e3.fg, l: e3.muted, p: y(e3.fg, e3.bg, 40), u: y(e3.fg, e3.bg, 25), m: e3.line, $: e3.accent, v: e3.surface, L: e3.border, T: e3.bg, S: y(e3.fg, e3.bg, 5), j: y(e3.fg, e3.bg, 12), F: y(e3.fg, e3.bg, 10) };
        let n5 = t3;
        for (const [o3, i3] of Object.entries(r4)) n5 = n5.replace(new RegExp(`var\\(--${o3}(?:,[^)]+)?\\)`, "g"), i3);
        return n5.replace(/\n\s*svg\s*\{[\s\S]*?\n\s*\}\s*(?=<\/style>)/, "");
      })(n4, r3);
    })(e, r2), o2 = x(n3, e);
    return void t.addImage({ objectName: e.id, data: v(n3), x: o2.x, y: o2.y, w: o2.w, h: o2.h, altText: e.altText });
  }
  if ("icon" === e.type) {
    const n3 = c(e.name, e.color ?? r2.theme.foreground, e.strokeWidth), o2 = x(n3, e);
    return void t.addImage({ data: v(n3), ...o2, altText: e.altText, hyperlink: e.hyperlink, objectName: e.id });
  }
  if ("math" === e.type) {
    const n3 = (function(t2, e2, r3) {
      const n4 = w.convert(t2, { display: r3 }), o3 = m.outerHTML(n4), i3 = o3.match(/<svg\b[\s\S]*<\/svg>/i)?.[0];
      if (!i3) throw new Error("MathJax did not produce SVG output");
      return i3.replace(/currentColor/g, `#${e2}`).replace(/<svg\b/, `<svg data-latex="${a2 = t2, a2.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"`);
      var a2;
    })(e.latex, e.color ?? r2.theme.foreground, e.display), o2 = x(n3, e);
    return void t.addImage({ data: v(n3), ...o2, altText: e.altText, objectName: e.id });
  }
  if ("qr" === e.type) {
    const r3 = await a.toDataURL(e.data, { errorCorrectionLevel: (n2 = e.errorCorrection, { low: "L", medium: "M", quartile: "Q", high: "H" }[n2]), margin: e.margin, color: { dark: `#${e.dark}`, light: `#${e.light}` }, width: 1024 });
    return void t.addImage({ data: r3, x: e.x, y: e.y, w: e.w, h: e.h, altText: e.altText, objectName: e.id });
  }
  var n2;
  if ("code" === e.type) return t.addShape("roundRect", { x: e.x, y: e.y, w: e.w, h: e.h, rectRadius: 0.06, fill: { color: e.background }, line: { transparency: 100 } }), e.showLanguage && e.language && t.addText(e.language.toUpperCase(), { x: e.x + e.w - 1.65, y: e.y + 0.12, w: 1.4, h: 0.25, fontFace: r2.theme.bodyFontFace, fontSize: 9, bold: true, color: e.accent ?? r2.theme.accent, align: "right", margin: 0 }), void t.addText(e.code, { x: e.x, y: e.y, w: e.w, h: e.h, fontFace: e.fontFace, fontSize: e.fontSize, color: e.color, margin: e.padding, valign: "middle", breakLine: false, fit: "shrink" });
  if ("shape" === e.type) {
    const n3 = "roundRect" === e.shape ? "roundRect" : e.shape;
    return void t.addShape(n3, { objectName: e.id, x: e.x, y: e.y, w: e.w, h: e.h, fill: e.fill ? { color: e.fill, transparency: e.fillTransparency } : { color: r2.theme.background, transparency: 100 }, line: e.lineWidth > 0 ? { color: e.line ?? r2.theme.foreground, width: e.lineWidth, dashType: e.dash, beginArrowType: e.beginArrow, endArrowType: e.endArrow } : { transparency: 100 }, rotate: e.rotation, hyperlink: e.hyperlink });
  }
  if ("chart" === e.type) {
    const n3 = "column" === e.chartType ? "bar" : e.chartType, o2 = { bottom: "b", left: "l", right: "r", top: "t", topRight: "tr" }[e.legendPosition], i3 = e.dataLabelPosition ? { bottom: "b", bestFit: "bestFit", center: "ctr", left: "l", right: "r", top: "t", insideEnd: "inEnd", outsideEnd: "outEnd" }[e.dataLabelPosition] : void 0, a2 = { objectName: e.id, x: e.x, y: e.y, w: e.w, h: e.h, catAxisLabelFontFace: r2.theme.bodyFontFace, valAxisLabelFontFace: r2.theme.bodyFontFace, showLegend: e.showLegend, showTitle: e.showTitle, title: e.title, showValue: e.showValue, showLabel: e.showLabel, showSerName: e.showSeriesName, showPercent: e.showPercent ?? ("pie" === e.chartType || "doughnut" === e.chartType), chartColors: e.series.map((t2) => t2.color ?? r2.theme.accent), legendPos: o2, legendFontFace: r2.theme.bodyFontFace, legendFontSize: 12, dataLabelPosition: i3, dataLabelFontFace: r2.theme.bodyFontFace, dataLabelFontSize: 11, catAxisTitle: e.categoryAxisTitle, showCatAxisTitle: Boolean(e.categoryAxisTitle), valAxisTitle: e.valueAxisTitle, showValAxisTitle: Boolean(e.valueAxisTitle), valAxisMinVal: e.valueAxisMin, valAxisMaxVal: e.valueAxisMax, valLabelFormatCode: e.valueFormatCode, valGridLine: { color: e.gridLineColor ?? r2.theme.muted, size: 0.6, style: e.showGridLines ? "solid" : "none" }, chartArea: { fill: { color: r2.theme.background, transparency: 100 }, border: { color: r2.theme.background, pt: 0 } }, plotArea: { fill: { color: r2.theme.background, transparency: 100 }, border: { color: r2.theme.background, pt: 0 } }, lineSize: e.lineSize, lineSmooth: e.smoothLine, lineDataSymbol: e.marker, holeSize: e.doughnutHoleSize };
    return "bar" !== e.chartType && "column" !== e.chartType || (a2.barDir = "column" === e.chartType ? "col" : "bar", a2.barGrouping = e.grouping, a2.barOverlapPct = "clustered" === e.grouping ? 0 : 100), void t.addChart(n3, e.series.map((t2) => ({ name: t2.name, labels: e.categories, values: t2.values })), a2);
  }
  const i2 = e.rows.map((t2, n3) => {
    const o2 = n3 < e.headerRows, i3 = o2 ? e.headerFill ?? r2.theme.accent : e.highlightRows.includes(n3) ? e.highlightFill ?? r2.theme.accent : e.alternateRowFill && n3 % 2 == e.headerRows % 2 ? e.alternateRowFill : e.bodyFill ?? r2.theme.background;
    return t2.map((t3, n4) => ({ text: t3, options: { bold: o2 || e.firstColumnBold && 0 === n4, color: o2 ? e.headerColor ?? "FFFFFF" : e.color ?? r2.theme.foreground, fill: { color: i3 }, align: e.align, valign: e.valign, margin: e.cellMargin } }));
  });
  t.addTable(i2, { objectName: e.id, x: e.x, y: e.y, w: e.w, h: e.h, fontFace: r2.theme.bodyFontFace, fontSize: e.fontSize, border: { color: e.borderColor ?? "D1D5DB", pt: e.borderWidth }, margin: e.cellMargin, colW: e.columnWidths, rowH: e.rowHeights, autoPage: false });
}
function T(t) {
  return `<p:bg><p:bgPr><a:gradFill rotWithShape="1"><a:gsLst>${t.stops.map((t2) => {
    const e = Math.round(1e3 * (100 - t2.transparency));
    return `<a:gs pos="${Math.round(1e5 * t2.position)}"><a:srgbClr val="${t2.color}"><a:alpha val="${e}"/></a:srgbClr></a:gs>`;
  }).join("")}</a:gsLst><a:lin ang="${Math.round(6e4 * t.angle)}" scaled="1"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>`;
}
function S(t) {
  const e = { slow: "slow", medium: "med", fast: "fast" }[t.speed], r2 = { left: "l", right: "r", up: "u", down: "d" }[t.direction], n2 = void 0 === t.advanceAfterSeconds ? "" : ` advTm="${Math.round(1e3 * t.advanceAfterSeconds)}"`, o2 = { cut: '<p:cut thruBlk="0"/>', fade: "<p:fade/>", push: `<p:push dir="${r2}"/>`, wipe: `<p:wipe dir="${r2}"/>`, split: `<p:split orient="${"horizontal" === t.orientation ? "horz" : "vert"}" dir="${t.splitDirection}"/>`, randomBars: `<p:randomBar dir="${"horizontal" === t.orientation ? "horz" : "vert"}"/>` }[t.type];
  return `<p:transition spd="${e}" advClick="${t.advanceOnClick ? 1 : 0}"${n2}>${o2}</p:transition>`;
}
function j(t) {
  return t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function E(t, e) {
  const r2 = e.elements.flatMap((t2) => t2.animations.map((e2) => ({ elementId: t2.id, animation: e2 })));
  if (!r2.length) return;
  const n2 = /* @__PURE__ */ new Map();
  for (const l2 of t.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"[^>]*\bname="([^"]*)"/gi)) n2.set(j(l2[2]), Number(l2[1]));
  const o2 = r2.map((t2) => {
    const r3 = n2.get(t2.elementId);
    if (!r3) throw new Error(`Animation target ${t2.elementId} was not found in generated slide ${e.id}`);
    return { ...t2, shapeId: r3 };
  }), i2 = [];
  for (const l2 of o2) "click" === l2.animation.start || 0 === i2.length ? i2.push([l2]) : i2[i2.length - 1].push(l2);
  let a2 = 3;
  const s2 = () => a2++;
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${i2.map((t2) => {
    const e2 = s2(), r3 = [];
    for (const o3 of t2) "withPrevious" === o3.animation.start && r3.length ? r3[r3.length - 1].push(o3) : r3.push([o3]);
    let n3 = 0;
    return `<p:par><p:cTn id="${e2}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>${r3.map((t3, e3) => {
      const r4 = s2(), o3 = 0 === e3 ? 0 : n3, i3 = t3.map((t4, r5) => (function(t5, e4, r6, n4) {
        const o4 = (function(t6) {
          const e5 = t6.direction;
          if ("appear" === t6.effect) return { presetId: 1, presetSubtype: 0 };
          if ("fade" === t6.effect) return { presetId: 9, presetSubtype: 0, filter: "fade" };
          if ("dissolve" === t6.effect) return { presetId: 10, presetSubtype: 0, filter: "dissolve" };
          if ("wipe" === t6.effect) return { presetId: 22, presetSubtype: "down" === e5 ? 4 : "up" === e5 ? 1 : "left" === e5 ? 8 : 2, filter: `wipe(${"horizontal" === e5 || "vertical" === e5 ? "right" : e5})` };
          if ("wedge" === t6.effect) return { presetId: 37, presetSubtype: 0, filter: "wedge" };
          if ("wheel" === t6.effect) return { presetId: 21, presetSubtype: t6.spokes, filter: `wheel(${t6.spokes})` };
          if ("circle" === t6.effect) {
            const t7 = "in" === e5;
            return { presetId: t7 ? 18 : 19, presetSubtype: 12, filter: `circle(${t7 ? "in" : "out"})` };
          }
          if ("strips" === t6.effect) {
            const t7 = "right" === e5 || "down" === e5 ? "downRight" : "up" === e5 ? "upLeft" : "downLeft";
            return { presetId: 25, presetSubtype: { downLeft: 0, downRight: 1, upLeft: 2, upRight: 3 }[t7] ?? 0, filter: `strips(${t7})` };
          }
          if ("blinds" === t6.effect) {
            const t7 = "vertical" === e5 ? "vertical" : "horizontal";
            return { presetId: 42, presetSubtype: "horizontal" === t7 ? 10 : 5, filter: `blinds(${t7})` };
          }
          if ("checkerboard" === t6.effect) {
            const t7 = "down" === e5 || "vertical" === e5 ? "down" : "across";
            return { presetId: 43, presetSubtype: "across" === t7 ? 0 : 1, filter: `checkerboard(${t7})` };
          }
          if ("barnDoor" === t6.effect) {
            const t7 = "horizontal" === e5 ? "Horizontal" : "Vertical", r8 = "in" === e5;
            return { presetId: 45, presetSubtype: r8 ? 0 : "Horizontal" === t7 ? 3 : 2, filter: `barn(${r8 ? "in" : "out"}${t7})` };
          }
          const r7 = "vertical" === e5 ? "vertical" : "horizontal";
          return { presetId: 52, presetSubtype: "horizontal" === r7 ? 0 : 1, filter: `randombar(${r7})` };
        })(e4), i4 = n4(), a3 = "entrance" === e4.phase, s3 = `<p:set><p:cBhvr><p:cTn id="${n4()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${a3 ? 0 : Math.max(0, e4.durationMs - 1)}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${t5}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${a3 ? "visible" : "hidden"}"/></p:to></p:set>`, l2 = o4.filter ? `<p:animEffect transition="${a3 ? "in" : "out"}" filter="${o4.filter}"><p:cBhvr><p:cTn id="${n4()}" dur="${e4.durationMs}"/><p:tgtEl><p:spTgt spid="${t5}"/></p:tgtEl></p:cBhvr></p:animEffect>` : "", p2 = a3 ? `${s3}${l2}` : `${l2}${s3}`;
        return `<p:par><p:cTn id="${i4}"${o4.filter ? ` dur="${e4.durationMs}"` : ""} fill="hold" nodeType="${r6}" grpId="0" presetID="${o4.presetId}" presetClass="${a3 ? "entr" : "exit"}" presetSubtype="${o4.presetSubtype}"><p:stCondLst><p:cond delay="${e4.delayMs}"/></p:stCondLst><p:childTnLst>${p2}</p:childTnLst></p:cTn></p:par>`;
      })(t4.shapeId, t4.animation, 0 === e3 && 0 === r5 ? "clickEffect" : 0 === r5 ? "afterEffect" : "withEffect", s2)).join("");
      return n3 += Math.max(...t3.map((t4) => t4.animation.delayMs + t4.animation.durationMs)), `<p:par><p:cTn id="${r4}" fill="hold"><p:stCondLst><p:cond delay="${o3}"/></p:stCondLst><p:childTnLst>${i3}</p:childTnLst></p:cTn></p:par>`;
    }).join("")}</p:childTnLst></p:cTn></p:par>`;
  }).join("")}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst>${[...new Set(o2.map((t2) => t2.shapeId))].map((t2) => `<p:bldP spid="${t2}" grpId="0"/>`).join("")}</p:bldLst></p:timing>`;
}
function F(t, e) {
  let r2 = 0;
  return t.replace(/<c:ser\b[\s\S]*?<\/c:ser>/g, (t2) => {
    const n2 = e.series[r2++];
    if (!n2?.pointColors?.some(Boolean)) return t2;
    const o2 = t2.replace(/<c:dPt\b[\s\S]*?<\/c:dPt>\s*/g, ""), i2 = n2.pointColors.map((t3, e2) => t3 ? (function(t4, e3) {
      return `<c:dPt><c:idx val="${t4}"/><c:spPr><a:solidFill><a:srgbClr val="${e3}"/></a:solidFill></c:spPr></c:dPt>`;
    })(e2, t3) : "").join("");
    return i2 ? /<c:dLbls\b/.test(o2) ? o2.replace(/(<c:dLbls\b)/, `${i2}$1`) : /<c:cat\b/.test(o2) ? o2.replace(/(<c:cat\b)/, `${i2}$1`) : o2.replace(/(<\/c:ser>)/, `${i2}$1`) : o2;
  });
}
if (!r) throw new Error("presentationCompiler.worker must run in a worker thread");
let C = Promise.resolve();
r.on("message", (t) => {
  C = C.then(async () => {
    const e = { id: t.id, ok: false };
    try {
      const r2 = d.parse(t.spec);
      await (async function(t2, e2 = t2.outputPath) {
        const r3 = p(t2);
        if (!r3.valid) throw new Error(`Presentation validation failed: ${r3.errors.map((t3) => t3.message).join("; ")}`);
        await n.mkdir(o.dirname(e2), { recursive: true });
        const i2 = new $();
        i2.layout = "wide" === t2.layout ? "LAYOUT_WIDE" : "LAYOUT_4X3", i2.author = t2.author, i2.company = t2.company ?? "", i2.subject = t2.subject ?? t2.story.coreMessage, i2.title = t2.title, i2.lang = "zh-CN", i2.theme = { headFontFace: t2.theme.headFontFace, bodyFontFace: t2.theme.bodyFontFace };
        for (const n2 of t2.slides) {
          const e3 = i2.addSlide();
          e3.background = { color: n2.background ?? t2.theme.background };
          for (const r4 of [...n2.elements].sort((t3, e4) => t3.zIndex - e4.zIndex)) await L(e3, r4, t2);
          n2.speakerNotes && e3.addNotes(n2.speakerNotes);
        }
        await i2.writeFile({ fileName: e2, compression: true }), await (async function(t3, e3) {
          const r4 = e3.slides.some((t4) => t4.backgroundGradient || t4.transition || t4.elements.some((t5) => t5.animations.length)), o2 = e3.slides.flatMap((t4) => [...t4.elements].sort((t5, e4) => t5.zIndex - e4.zIndex).filter((t5) => "chart" === t5.type)), i3 = o2.some((t4) => t4.series.some((t5) => t5.pointColors?.some(Boolean)));
          if (!r4 && !i3) return;
          const a2 = await s.loadAsync(await n.readFile(t3));
          if (r4) for (const [n2, s2] of e3.slides.entries()) {
            if (!s2.backgroundGradient && !s2.transition && !s2.elements.some((t5) => t5.animations.length)) continue;
            const t4 = `ppt/slides/slide${n2 + 1}.xml`, e4 = a2.file(t4);
            if (!e4) throw new Error(`Generated presentation is missing ${t4}`);
            const r5 = await e4.async("text"), o3 = s2.backgroundGradient ? T(s2.backgroundGradient) : void 0, i4 = (o3 ? /<p:bg>[\s\S]*?<\/p:bg>/i.test(r5) ? r5.replace(/<p:bg>[\s\S]*?<\/p:bg>/i, o3) : r5.replace(/(<p:cSld\b[^>]*>)/i, `$1${o3}`) : r5).replace(/<p:transition\b[\s\S]*?<\/p:transition>/i, ""), l3 = (s2.transition ? i4.replace(/(<\/p:clrMapOvr>)/i, `$1${S(s2.transition)}`) : i4).replace(/<p:timing\b[\s\S]*?<\/p:timing>/i, ""), p2 = E(l3, s2), c2 = p2 ? /<\/p:transition>/i.test(l3) ? l3.replace(/(<\/p:transition>)/i, `$1${p2}`) : l3.replace(/(<\/p:clrMapOvr>)/i, `$1${p2}`) : l3;
            if (c2 === r5) throw new Error(`Could not apply native slide enhancements to slide ${s2.id}`);
            a2.file(t4, c2);
          }
          const l2 = Object.keys(a2.files).filter((t4) => /^ppt\/charts\/chart\d+\.xml$/.test(t4)).sort((t4, e4) => Number(t4.match(/chart(\d+)\.xml$/)?.[1] ?? 0) - Number(e4.match(/chart(\d+)\.xml$/)?.[1] ?? 0));
          for (const [n2, s2] of o2.entries()) {
            if (!s2.series.some((t5) => t5.pointColors?.some(Boolean))) continue;
            const t4 = l2[n2];
            if (!t4) throw new Error(`Generated presentation is missing the OOXML part for chart ${s2.id}`);
            const e4 = a2.file(t4);
            if (!e4) throw new Error(`Generated presentation is missing ${t4}`);
            const r5 = await e4.async("text"), o3 = F(r5, s2);
            if (o3 === r5) throw new Error(`Could not apply point colors to chart ${s2.id}`);
            a2.file(t4, o3);
          }
          await n.writeFile(t3, await a2.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
        })(e2, t2);
      })(r2, t.targetPath), e.ok = true;
    } catch (i2) {
      e.error = i2 instanceof Error ? i2.message : String(i2);
    }
    r?.postMessage(e);
  });
});
