/*
 * [INPUT]: Fixed Alma 0.4.196 presentationRenderer.worker.js.
 * [OUTPUT]: Cancellation and shutdown wait for owned child exit; no speculative renderer restart.
 * [OUTPUT]: Migrated presentation kernel; formatting and local import adaptation, release telemetry preamble removed.
 * [POS]: Internal host worker/model; not an employee-facing tool or permission boundary.
 * [PROTOCOL]: Update source-manifest.json and owning .folder.md when changed.
 */
import { parentPort as n } from "node:worker_threads";
import r from "node:fs/promises";
import o from "node:os";
import i from "node:path";
import { randomUUID as a } from "node:crypto";
import { pathToFileURL as s } from "node:url";
import { spawn as d } from "node:child_process";
import { createCanvas as l } from "@napi-rs/canvas";
import { getDocument as c } from "pdfjs-dist/legacy/build/pdf.mjs";
let f, w = null;
function u() {
  f && clearTimeout(f), f = void 0;
}
async function p() {
  u();
  const active = w;
  w = null;
  if (!active) return;
  if (active.child.exitCode === null && active.child.signalCode === null) {
    await new Promise((resolve) => {
      const timer = setTimeout(() => active.child.kill("SIGKILL"), 500);
      active.child.once("close", () => { clearTimeout(timer); resolve(); });
      active.child.kill("SIGTERM");
    });
  }
  await r.rm(active.profileDir, { recursive: true, force: true });
}
function m() {
  u(), f = setTimeout(() => {
    p();
  }, 6e4), f.unref?.();
}
async function y(e) {
  const t = e.readyAt - Date.now();
  if (t > 0 && await new Promise((e2) => setTimeout(e2, t)), null !== e.child.exitCode || null !== e.child.signalCode) throw new Error("Resident presentation renderer exited while warming");
}
async function g(e) {
  if (w?.rendererPath === e && null === w.child.exitCode && null === w.child.signalCode) return m(), await y(w), w;
  await p();
  const t = await r.mkdtemp(i.join(o.tmpdir(), "alma-presentation-renderer-")), n2 = `alma-presentation-${process.pid}-${a()}`, l2 = d(e, ["--headless", "--nologo", "--nodefault", "--nolockcheck", "--nofirststartwizard", `--accept=pipe,name=${n2};urp;StarOffice.ComponentContext`, `-env:UserInstallation=${s(t).href}`], { stdio: "ignore", windowsHide: true });
  return w = { rendererPath: e, profileDir: t, pipeName: n2, readyAt: Date.now() + 1e3, child: l2 }, await new Promise((e2, t2) => {
    const n3 = setTimeout(() => {
      i2(), e2();
    }, 1e3), r2 = (e3) => {
      clearTimeout(n3), i2(), t2(e3);
    }, o2 = (e3, t3) => r2(new Error(`Resident presentation renderer exited during startup (${e3 ?? t3 ?? "unknown"})`)), i2 = () => {
      l2.off("error", r2), l2.off("exit", o2);
    };
    l2.once("error", r2), l2.once("exit", o2);
  }), m(), await y(w), w;
}
function h() {
  const e = new Error("Presentation rendering was cancelled");
  return e.name = "AbortError", e;
}
async function b(e) {
  const t = e.page.getViewport({ scale: 1 }), n2 = Math.min(e.width / t.width, e.height / t.height), o2 = e.page.getViewport({ scale: n2 }), i2 = l(e.width, e.height), s2 = i2.getContext("2d");
  s2.fillStyle = "#ffffff", s2.fillRect(0, 0, e.width, e.height);
  const d2 = e.page.render({ canvasContext: s2, viewport: o2, transform: [1, 0, 0, 1, (e.width - o2.width) / 2, (e.height - o2.height) / 2] });
  let c2, f2;
  const w2 = () => {
    d2.cancel(), f2?.(h());
  };
  try {
    e.signal?.throwIfAborted(), e.signal?.addEventListener("abort", w2, { once: true }), await Promise.race([d2.promise, new Promise((e2, t3) => {
      f2 = t3;
    }), new Promise((t3, n3) => {
      c2 = setTimeout(() => {
        d2.cancel(), n3(new Error(`Presentation page rendering exceeded ${e.timeoutMs}ms and was terminated`));
      }, e.timeoutMs);
    })]);
    const t2 = `${e.destination}.${a()}.tmp`;
    try {
      await r.writeFile(t2, await i2.encode("png")), await r.rename(t2, e.destination);
    } finally {
      await r.rm(t2, { force: true }).catch(() => {
      });
    }
  } finally {
    c2 && clearTimeout(c2), e.signal?.removeEventListener("abort", w2), e.page.cleanup();
  }
}
if (process.once("exit", () => {
  null === w?.child.exitCode && null === w.child.signalCode && w.child.kill("SIGKILL");
}), !n) throw new Error("presentationRenderer.worker must run in a worker thread");
let $ = Promise.resolve();
const v = /* @__PURE__ */ new Set();
let P = null;
n.on("message", (e) => {
  if (!("type" in e) || "shutdown" !== e.type) return "type" in e && "cancel" === e.type ? (v.add(e.id), void (P?.id === e.id && P.controller.abort())) : void ($ = $.then(async () => {
    if (v.delete(e.id)) return;
    const t = { id: e.id, ok: false }, o2 = new AbortController();
    P = { id: e.id, controller: o2 };
    try {
      t.images = await (async function(e2) {
        const t2 = e2.width ?? 1600, n2 = e2.height ?? 900, o3 = e2.timeoutMs ?? 12e4, l2 = Date.now();
        e2.signal?.throwIfAborted(), await r.mkdir(e2.outputDir, { recursive: true });
        const f2 = i.join(e2.outputDir, `.render-${a()}`), w2 = i.join(f2, "pdf"), u2 = i.join(w2, `${i.basename(e2.presentationPath, i.extname(e2.presentationPath))}.pdf`);
        await r.mkdir(w2, { recursive: true });
        try {
          const a2 = await g(e2.rendererPath);
          e2.signal?.throwIfAborted();
          const f3 = o3 - (Date.now() - l2);
          if (f3 <= 0) throw new Error(`Presentation rendering exceeded ${o3}ms and was terminated`);
          try {
            await (function(e3, t3, n3, r2) {
              return new Promise((o4, i2) => {
                if (r2?.aborted) return void i2(h());
                const a3 = d(e3, t3, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
                let s2 = "", l3 = "", c2 = false, stopError;
                const f4 = () => {
                  clearTimeout(u3), r2?.removeEventListener("abort", w3);
                }, w3 = () => {
                  c2 || (stopError = h(), a3.kill("SIGKILL"));
                }, u3 = setTimeout(() => {
                  c2 || (stopError = new Error(`Presentation rendering exceeded ${n3}ms and was terminated`), a3.kill("SIGKILL"));
                }, n3);
                r2?.addEventListener("abort", w3, { once: true }), a3.stdout.on("data", (e4) => {
                  s2 += e4.toString();
                }), a3.stderr.on("data", (e4) => {
                  l3 += e4.toString();
                }), a3.on("error", (e4) => {
                  c2 || (c2 = true, f4(), i2(e4));
                }), a3.on("close", (e4) => {
                  c2 || (c2 = true, f4(), stopError ? i2(stopError) : 0 === e4 ? o4({ stdout: s2, stderr: l3 }) : i2(new Error(`Presentation renderer exited with code ${e4}: ${l3 || s2}`)));
                });
              });
            })(e2.rendererPath, ["--headless", "--nologo", "--nodefault", "--nolockcheck", "--nofirststartwizard", `-env:UserInstallation=${s(a2.profileDir).href}`, "--convert-to", "pdf:impress_pdf_Export", "--outdir", w2, e2.presentationPath], f3, e2.signal), await p();
          } catch (m2) {
            throw await p(), m2;
          }
          const y2 = new Uint8Array(await r.readFile(u2));
          return await (async function(e3) {
            const t3 = e3.startedAt ?? Date.now(), n3 = await c({ data: e3.pdfData, useSystemFonts: true }).promise, r2 = [];
            try {
              if (n3.numPages !== e3.slideIds.length) throw new Error(`Rendered PDF contains ${n3.numPages} page(s), but presentation state contains ${e3.slideIds.length} slide(s)`);
              const o4 = e3.pageIndexes ?? e3.slideIds.map((e4, t4) => t4);
              if (o4.some((t4) => !Number.isInteger(t4) || t4 < 0 || t4 >= e3.slideIds.length)) throw new Error("Presentation page selection contains an invalid slide index");
              for (const a3 of o4) {
                e3.signal?.throwIfAborted();
                const o5 = Date.now() - t3, s2 = e3.timeoutMs - o5;
                if (s2 <= 0) throw new Error(`Presentation rendering exceeded ${e3.timeoutMs}ms and was terminated`);
                const d2 = await n3.getPage(a3 + 1), l3 = e3.slideIds[a3].replace(/[^a-zA-Z0-9_-]+/g, "-"), c2 = i.join(e3.outputDir, `${String(a3 + 1).padStart(3, "0")}-${l3}.png`);
                await b({ page: d2, destination: c2, width: e3.width, height: e3.height, timeoutMs: s2, signal: e3.signal }), r2.push(c2);
              }
              return r2;
            } finally {
              await n3.destroy();
            }
          })({ pdfData: y2, outputDir: e2.outputDir, slideIds: e2.slideIds, pageIndexes: e2.pageIndexes, width: t2, height: n2, timeoutMs: o3, startedAt: l2, signal: e2.signal });
        } finally {
          await r.rm(f2, { recursive: true, force: true }).catch(() => {
          });
        }
      })({ ...e.input, signal: o2.signal }), t.ok = true;
    } catch (l2) {
      t.error = l2 instanceof Error ? l2.message : String(l2);
    } finally {
      P?.id === e.id && (P = null);
    }
    v.delete(e.id) || n?.postMessage(t);
  }));
  $.finally(p).finally(() => n?.postMessage({ type: "shutdown-complete" }));
}), n.on("close", () => {
  p();
});
