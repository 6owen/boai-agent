/*
 * [INPUT]: Fixed Alma 0.4.196 presentationMaterialExtractor.worker.js.
 * [OUTPUT]: Migrated presentation kernel; formatting and local import adaptation, release telemetry preamble removed.
 * [POS]: Internal host worker/model; not an employee-facing tool or permission boundary.
 * [PROTOCOL]: Update source-manifest.json and owning .folder.md when changed.
 */
import { parentPort as a } from "node:worker_threads";
import n from "node:fs/promises";
import o from "node:path";
import { createHash as s, randomUUID as i } from "node:crypto";
import r from "jszip";
const c = 83886080, f = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".emf", ".wmf"]), l = /* @__PURE__ */ new Set([".pptx", ".docx", ".xlsx", ".pdf", ".txt", ".md", ".csv", ".json"]);
function u(t) {
  return t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function d(t) {
  return Number(/slide(\d+)\.xml$/i.exec(t)?.[1] ?? Number.MAX_SAFE_INTEGER);
}
function w(t) {
  const e = [];
  for (const a2 of t.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi)) {
    const t2 = [...a2[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)].map((t3) => u(t3[1])).join("").trim();
    t2 && e.push(t2);
  }
  return e;
}
function m(t, e = []) {
  const a2 = [];
  let n2 = [], o2 = 0;
  for (const s2 of t) n2.length && o2 + s2.length > 6e3 && (a2.push(n2), n2 = [], o2 = 0), n2.push(s2), o2 += s2.length;
  return !n2.length && a2.length || a2.push(n2), a2.map((t2, a3) => ({ number: a3 + 1, text: t2, speakerNotes: [], images: 0 === a3 ? e : [], tables: [], charts: [] }));
}
function p(t) {
  const e = /* @__PURE__ */ new Map();
  for (const a2 of t.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const t2 = a2[1], n2 = /\bId="([^"]+)"/i.exec(t2)?.[1], o2 = /\bType="([^"]+)"/i.exec(t2)?.[1], s2 = /\bTarget="([^"]+)"/i.exec(t2)?.[1];
    n2 && o2 && s2 && e.set(n2, { type: o2, target: u(s2) });
  }
  return e;
}
function b(t, e) {
  return e.startsWith("/") ? o.posix.normalize(e.slice(1)) : o.posix.normalize(o.posix.join(o.posix.dirname(t), e));
}
function h(t) {
  const e = [...t.matchAll(/<c:pt\b[^>]*>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>[\s\S]*?<\/c:pt>/gi)].map((t2) => u(t2[1]));
  return e.length ? e : [...t.matchAll(/<c:v>([\s\S]*?)<\/c:v>/gi)].map((t2) => u(t2[1]));
}
function g(t) {
  const e = w(/<c:title\b[^>]*>([\s\S]*?)<\/c:title>/i.exec(t)?.[1] ?? "").join(" ") || void 0, a2 = [];
  let n2 = [];
  for (const o2 of t.matchAll(/<c:ser\b[^>]*>([\s\S]*?)<\/c:ser>/gi)) {
    const t2 = o2[1], e2 = h(/<c:tx\b[^>]*>([\s\S]*?)<\/c:tx>/i.exec(t2)?.[1] ?? "")[0] ?? `Series ${a2.length + 1}`, s2 = /<c:cat\b[^>]*>([\s\S]*?)<\/c:cat>/i.exec(t2)?.[1] ?? "", i2 = /<c:val\b[^>]*>([\s\S]*?)<\/c:val>/i.exec(t2)?.[1] ?? "";
    n2.length || (n2 = h(s2));
    const r2 = h(i2).map((t3) => {
      const e3 = Number(t3);
      return Number.isFinite(e3) && "" !== t3.trim() ? e3 : t3;
    });
    a2.push({ name: e2, values: r2 });
  }
  return { title: e, categories: n2, series: a2 };
}
function x(t) {
  return [...t.matchAll(/<a:tbl\b[^>]*>([\s\S]*?)<\/a:tbl>/gi)].map((t2) => [...t2[1].matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/gi)].map((t3) => [...t3[1].matchAll(/<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/gi)].map((t4) => w(t4[1]).join("\n"))));
}
async function y(t, e) {
  await n.mkdir(o.dirname(t), { recursive: true });
  const a2 = `${t}.${i()}.tmp`;
  try {
    await n.writeFile(a2, e), await n.rename(a2, t);
  } finally {
    await n.rm(a2, { force: true }).catch(() => {
    });
  }
}
async function S(t) {
  const e = [];
  for (const a2 of t.names) {
    const i2 = o.extname(a2).toLowerCase(), r2 = t.zip.file(a2);
    if (!r2 || !f.has(i2)) continue;
    const l2 = await r2.async("nodebuffer");
    if (t.byteBudget.used += l2.byteLength, t.byteBudget.used > c) throw new Error("Source contains too much embedded image data");
    const u2 = s("sha256").update(l2).digest("hex"), d2 = ".jpeg" === i2 ? ".jpg" : i2, w2 = o.join(t.materialRoot, "assets", `${u2}${d2}`);
    try {
      await n.access(w2);
    } catch {
      await y(w2, l2);
    }
    e.push({ relationshipId: a2, sourceName: o.posix.basename(a2), extractedPath: w2, sha256: u2 });
  }
  return e;
}
if (!a) throw new Error("presentationMaterialExtractor.worker must run in a worker thread");
let v = Promise.resolve();
a.on("message", (t) => {
  v = v.then(async () => {
    const e = { id: t.id, ok: false };
    try {
      e.result = await (async function(t2) {
        const e2 = o.extname(t2.filePath).toLowerCase();
        if (!l.has(e2)) throw new Error(`Presentation material extraction does not support ${e2 || "files without an extension"}`);
        const a2 = await n.readFile(t2.filePath);
        if (a2.byteLength > 262144e3) throw new Error("Source exceeds 250 MB");
        const i2 = s("sha256").update(a2).digest("hex"), h2 = o.join(t2.outputRoot, i2), v2 = o.join(h2, "material.json"), j = await (async function(t3, e3) {
          try {
            const a3 = JSON.parse(await n.readFile(t3, "utf8"));
            if (1 === a3.version && a3.sourceSha256 === e3) return a3;
          } catch {
          }
        })(v2, i2);
        if (j) return { manifest: j, manifestPath: v2, cacheHit: true };
        if (".pptx" !== e2) {
          let n2;
          if (".pdf" === e2) n2 = await (async function(t3) {
            const { getDocument: e3 } = await import("pdfjs-dist/legacy/build/pdf.mjs"), a3 = await e3({ data: new Uint8Array(t3), isEvalSupported: false, useWorkerFetch: false }).promise, n3 = [];
            try {
              for (let t4 = 1; t4 <= a3.numPages; t4 += 1) {
                const e4 = await a3.getPage(t4), o3 = (await e4.getTextContent()).items.map((t5) => "str" in t5 ? t5.str : "").join(" ").replace(/\s+/g, " ").trim();
                n3.push({ number: t4, text: o3 ? [o3] : [], speakerNotes: [], images: [], tables: [], charts: [] }), e4.cleanup();
              }
            } finally {
              await a3.destroy();
            }
            return n3;
          })(a2);
          else if (".docx" === e2) {
            const t3 = await r.loadAsync(a2);
            if (Object.keys(t3.files).length > 2e4) throw new Error("DOCX source contains too many archive entries");
            const e3 = t3.file("word/document.xml");
            if (!e3) throw new Error("DOCX source is missing word/document.xml");
            const o3 = { used: 0 }, s2 = await S({ zip: t3, names: Object.keys(t3.files).filter((t4) => t4.startsWith("word/media/")), materialRoot: h2, byteBudget: o3 });
            n2 = m([...(await e3.async("text")).matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi)].map((t4) => [...t4[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((t5) => u(t5[1])).join("").trim()).filter(Boolean), s2);
          } else if (".xlsx" === e2) {
            const t3 = await import("xlsx"), e3 = "default" in t3 ? t3.default : t3, o3 = e3.read(a2, { type: "buffer", cellText: true, cellDates: true }), s2 = await r.loadAsync(a2), i3 = { used: 0 }, c2 = await S({ zip: s2, names: Object.keys(s2.files).filter((t4) => t4.startsWith("xl/media/")), materialRoot: h2, byteBudget: i3 });
            n2 = o3.SheetNames.map((t4, a3) => {
              const n3 = e3.utils.sheet_to_json(o3.Sheets[t4], { header: 1, raw: false }).map((t5) => t5.map((t6) => String(t6 ?? "")));
              return { number: a3 + 1, text: [t4, ...n3.map((t5) => t5.join("	"))], speakerNotes: [], images: 0 === a3 ? c2 : [], tables: n3.length ? [n3] : [], charts: [] };
            });
          } else n2 = m(a2.toString("utf8").split(/\r?\n/).map((t3) => t3.trim()).filter(Boolean));
          const o2 = { version: 1, sourcePath: t2.filePath, sourceSha256: i2, extractedAt: (/* @__PURE__ */ new Date()).toISOString(), slideCount: n2.length, slides: n2 };
          return await y(v2, `${JSON.stringify(o2, null, 2)}
`), { manifest: o2, manifestPath: v2, cacheHit: false };
        }
        const $ = await r.loadAsync(a2);
        if (Object.keys($.files).length > 2e4) throw new Error("PPTX source contains too many archive entries");
        const N = Object.keys($.files).filter((t3) => /^ppt\/slides\/slide\d+\.xml$/i.test(t3)).sort((t3, e3) => d(t3) - d(e3)), P = [];
        let E = 0;
        for (const [r2, l2] of N.entries()) {
          const t3 = await $.file(l2).async("text"), e3 = `${o.posix.dirname(l2)}/_rels/${o.posix.basename(l2)}.rels`, a3 = p($.file(e3) ? await $.file(e3).async("text") : ""), i3 = [], u2 = [];
          let d2 = [];
          for (const [r3, m2] of a3) {
            const t4 = b(l2, m2.target);
            if (m2.type.endsWith("/image")) {
              const e4 = o.extname(t4).toLowerCase(), a4 = $.file(t4);
              if (!a4 || !f.has(e4)) continue;
              const l3 = await a4.async("nodebuffer");
              if (E += l3.byteLength, E > c) throw new Error("PPTX source contains too much embedded image data");
              const u3 = s("sha256").update(l3).digest("hex"), d3 = ".jpeg" === e4 ? ".jpg" : e4, w2 = o.join(h2, "assets", `${u3}${d3}`);
              try {
                await n.access(w2);
              } catch {
                await y(w2, l3);
              }
              i3.push({ relationshipId: r3, sourceName: o.posix.basename(t4), extractedPath: w2, sha256: u3 });
            } else if (m2.type.endsWith("/chart")) {
              const e4 = $.file(t4);
              e4 && u2.push(g(await e4.async("text")));
            } else if (m2.type.endsWith("/notesSlide")) {
              const e4 = $.file(t4);
              e4 && (d2 = w(await e4.async("text")));
            }
          }
          P.push({ number: r2 + 1, text: w(t3), speakerNotes: d2, images: i3, tables: x(t3), charts: u2 });
        }
        const O = { version: 1, sourcePath: t2.filePath, sourceSha256: i2, extractedAt: (/* @__PURE__ */ new Date()).toISOString(), slideCount: P.length, slides: P };
        return await y(v2, `${JSON.stringify(O, null, 2)}
`), { manifest: O, manifestPath: v2, cacheHit: false };
      })(t.input), e.ok = true;
    } catch (i2) {
      e.error = i2 instanceof Error ? i2.message : String(i2);
    }
    a?.postMessage(e);
  });
});
