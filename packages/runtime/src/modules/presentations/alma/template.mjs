/*
 * [INPUT]: Fixed Alma 0.4.196 index.js presentation helpers.
 * [OUTPUT]: Selected original helper logic with local exports and explicit byte boundary.
 * [POS]: Presentation kernel support; no implicit filesystem or model access.
 * [PROTOCOL]: Update source-manifest.json and owning .folder.md when changed.
 */
import Ct from 'jszip';
function oD(e2, t2) {
  return t2.exec(e2)?.[1];
}
function sD(e2) {
  return e2.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function iD(e2) {
  const t2 = {}, n2 = oD(e2, /<a:clrScheme\b[^>]*>([\s\S]*?)<\/a:clrScheme>/i);
  if (!n2) return t2;
  const r2 = /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)\b[^>]*>([\s\S]*?)<\/a:\1>/gi;
  let o2;
  for (; o2 = r2.exec(n2); ) {
    const e3 = oD(o2[2], /<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/i) ?? oD(o2[2], /<a:sysClr\b[^>]*\blastClr="([0-9A-Fa-f]{6})"/i);
    e3 && (t2[o2[1]] = e3.toUpperCase());
  }
  return t2;
}
function aD(e2) {
  const t2 = oD(e2, /<a:majorFont\b[^>]*>([\s\S]*?)<\/a:majorFont>/i), n2 = oD(e2, /<a:minorFont\b[^>]*>([\s\S]*?)<\/a:minorFont>/i);
  return { headFontFace: t2 ? oD(t2, /<a:latin\b[^>]*\btypeface="([^"]*)"/i) : void 0, bodyFontFace: n2 ? oD(n2, /<a:latin\b[^>]*\btypeface="([^"]*)"/i) : void 0 };
}
async function cD(e2) {
  const t2 = await Ct.loadAsync(e2), n2 = Object.keys(t2.files).filter((e3) => /^ppt\/slides\/slide\d+\.xml$/i.test(e3)).length, r2 = t2.file("ppt/presentation.xml") ? await t2.file("ppt/presentation.xml").async("text") : "", o2 = /<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/i.exec(r2), s2 = t2.file("ppt/theme/theme1.xml"), i2 = s2 ? await s2.async("text") : "", a2 = Object.keys(t2.files).filter((e3) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(e3)).sort(), c2 = [];
  for (const l2 of a2) {
    const e3 = oD(await t2.file(l2).async("text"), /<p:cSld\b[^>]*\bname="([^"]+)"/i);
    c2.push(e3 ? sD(e3) : l2.split("/").pop().replace(".xml", ""));
  }
  return { slideCount: n2, widthInches: o2 ? Number(o2[1]) / 914400 : void 0, heightInches: o2 ? Number(o2[2]) / 914400 : void 0, ...aD(i2), colors: iD(i2), layouts: c2 };
}

export { cD as inspectTemplate };
