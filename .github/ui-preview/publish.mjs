/*
 * [INPUT]: PR diff, isolated BOAI Electron and DeepSeek planning configuration.
 * [OUTPUT]: Screenshots and native GitHub video attachments in the PR description; upload failures stay visible.
 * [POS]: UI preview; upstream yetone/magpie@396e0e463805dd5ded971ade37ded08a52512ae5 (MIT).
 * [PROTOCOL]: Update this header and .github/ui-preview/.folder.md when changed.
 */
// The trusted half of the UI preview: never runs the PR's code.
//
//   node publish.mjs detect   — does the PR touch the UI? (GITHUB_OUTPUT: ui,
//                               sha, number) and, when it does, puts the
//                               "recording" note in the PR's description
//   node publish.mjs publish  — the recording (OUT_DIR, from record.mjs) onto
//                               the media branch and a native GitHub video
//                               attachment in the PR's description
//
// The preview lives in one fixed block at the foot of the description,
// between the markers below; each run replaces that block and leaves the
// rest of the description as the author wrote it.
//
// env: GITHUB_TOKEN, UI_PREVIEW_UPLOAD_TOKEN, GITHUB_REPOSITORY, PR, OUT_DIR, RECORD_RESULT, RUN_URL
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const BEGIN = "<!-- boai-ui-preview:begin -->";
const END = "<!-- boai-ui-preview:end -->";
const BRANCH = "ui-previews";
const repo = process.env.GITHUB_REPOSITORY;
const pr = Number(process.env.PR);
const token = process.env.GITHUB_TOKEN;
const runURL = process.env.RUN_URL || "";
// What counts as BOAI UI: renderer, shared UI/tokens and app icons.
export const isUiFile = (f) => /^(apps\/electron\/src\/renderer\/|packages\/(ui|tokens)\/|resources\/app-icons\/)/.test(f) || /^(vite|tailwind)\.config\./.test(f);
const UI = isUiFile;

async function gh(p, init = {}) {
  const res = await fetch(`https://api.github.com${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${p}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

async function files() {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await gh(`/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`);
    out.push(...batch.map((f) => f.filename));
    if (batch.length < 100) break;
  }
  return out;
}

// the description with the block in place of the old one, or at its foot
export function withBlock(body, block) {
  body = body || "";
  const a = body.indexOf(BEGIN), b = body.indexOf(END);
  if (a >= 0 && b > a) return body.slice(0, a) + block + body.slice(b + END.length);
  return body.replace(/\s*$/, "") + "\n\n" + block;
}
export async function setBlock(inner, videoPath) {
  // read just before writing, so an edit the author just made is kept
  const cur = await gh(`/repos/${repo}/pulls/${pr}`);
  const next = withBlock(cur.body, `${BEGIN}\n${inner.trim()}\n${END}`);
  if (videoPath) {
    // Only this trusted publish process receives the upload credential. The
    // Actions installation token cannot upload native GitHub attachments.
    const uploadToken = process.env.UI_PREVIEW_UPLOAD_TOKEN;
    if (!uploadToken) throw new Error("Set UI_PREVIEW_UPLOAD_TOKEN in the ui-preview-publish environment; GITHUB_TOKEN cannot upload video attachments");
    execFileSync("gh", ["pr", "edit", String(pr), "--repo", repo, "--body-file", "-", "--attach", videoPath], {
      input: next, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, GH_TOKEN: uploadToken, GITHUB_TOKEN: uploadToken, GH_PROMPT_DISABLED: "1" },
    });
  } else if (next !== cur.body) await gh(`/repos/${repo}/pulls/${pr}`, { method: "PATCH", body: JSON.stringify({ body: next }) });
}

export async function videoAttachment(dir, filename) {
  // The artifact came from PR code. Never let its manifest select a host file
  // (or symlink) for the privileged uploader to send to GitHub.
  if (filename !== "preview.mp4") throw new Error("Unexpected recording filename; expected preview.mp4");
  const file = path.resolve(dir, filename);
  if (!(await fs.lstat(file)).isFile()) throw new Error("Recording must be a regular file");
  return { file, markdown: `![](<${file}>)` };
}

const short = (sha) => sha.slice(0, 7);
const head = (sha) => `---\n### 🎬 界面预览\n<sub>CI 用这个 PR 的代码构建并真实运行 BOAI（沙盒环境，DeepSeek 规划操作，独立演示数据），按改动自动操作、截图和录屏 · <code>${short(sha)}</code>${runURL ? ` · [运行记录](${runURL})` : ""}</sub>\n`;

async function detect() {
  const p = await gh(`/repos/${repo}/pulls/${pr}`);
  const changed = await files();
  const forced = p.labels.some((l) => l.name === "ui-preview");
  const ui = forced || changed.some(UI);
  const out = process.env.GITHUB_OUTPUT;
  const lines = [`ui=${ui}`, `sha=${p.head.sha}`, `number=${pr}`];
  if (out) await fs.appendFile(out, lines.join("\n") + "\n");
  console.log(lines.join(" "), "·", changed.filter(UI).join(", ") || "no UI files");
  if (ui && p.state === "open") await setBlock(`${head(p.head.sha)}\n⏳ 正在录制这次提交的界面改动…`);
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// the recording onto the ui-previews branch: one commit, replaced each time
// so the branch never piles up old videos; another PR's run pushing in
// between makes this one start over from theirs
async function pushMedia(sha, dir) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "ui-previews-"));
  const remote = `https://x-access-token:${token}@github.com/${repo}.git`;
  git(["init", "-q"], work);
  git(["config", "user.name", "github-actions[bot]"], work);
  git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], work);
  const open = new Set((await gh(`/repos/${repo}/pulls?state=open&per_page=100`)).map((p) => p.number));
  for (let attempt = 0; attempt < 6; attempt++) {
    let base = "";
    try {
      git(["fetch", "-q", "--depth=1", remote, BRANCH], work);
      base = git(["rev-parse", "FETCH_HEAD"], work);
      git(["checkout", "-q", "-f", "--detach", "FETCH_HEAD"], work);
    } catch { /* the first one */ }
    // this PR's latest run only, and no PR that's been closed
    for (const d of await fs.readdir(work).catch(() => [])) {
      const m = /^pr-(\d+)$/.exec(d);
      if (m && (Number(m[1]) === pr || !open.has(Number(m[1])))) await fs.rm(path.join(work, d), { recursive: true, force: true });
    }
    const to = path.join(work, `pr-${pr}`, short(sha));
    await fs.mkdir(to, { recursive: true });
    for (const f of await fs.readdir(dir)) await fs.copyFile(path.join(dir, f), path.join(to, f));
    await fs.writeFile(path.join(to, "index.html"), player(sha, JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"))));
    await fs.writeFile(path.join(work, ".nojekyll"), "");
    await fs.writeFile(path.join(work, "index.html"), `<!doctype html><meta charset="utf-8"><title>BOAI UI previews</title><p>Screenshots and recordings of <a href="https://github.com/${repo}/pulls">${repo}</a> pull requests, made by .github/workflows/ui-preview.yml.</p>`);
    git(["checkout", "-q", "--orphan", `tmp-${attempt}`], work);
    git(["add", "-A"], work);
    git(["commit", "-q", "-m", `ui preview for #${pr} at ${short(sha)}`], work);
    try {
      git(["push", "-q", `--force-with-lease=${BRANCH}:${base}`, remote, `HEAD:refs/heads/${BRANCH}`], work);
      await fs.rm(work, { recursive: true, force: true });
      return;
    } catch (e) {
      console.log(`push lost a race (${e.message.split("\n")[0]}), again`);
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 4000));
    }
  }
  throw new Error("couldn't push the preview");
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Optional static index for existing Pages users; PR playback uses attachments.
function player(sha, m) {
  const shots = m.scenes.flatMap((s) => s.shots.map((x) => ({ ...x, scene: s.title })));
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>#${pr} 界面预览 · ${short(sha)}</title>
<style>:root{color-scheme:light dark;--bg:#f6f6f7;--fg:#1d1d1f;--muted:#6e6e73;--card:#fff;--line:#e5e5ea}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--fg:#f2f2f4;--muted:#9a9aa0;--card:#1c1c1f;--line:#2c2c30}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,"Segoe UI","PingFang SC","Noto Sans CJK SC",sans-serif}
main{max-width:1100px;margin:0 auto;padding:28px 16px 60px}h1{font-size:20px;margin:0 0 4px}.m{color:var(--muted);font-size:13px;margin:0 0 20px}
video,img{display:block;width:100%;border-radius:10px;border:1px solid var(--line);background:var(--card)}figure{margin:0 0 28px}figcaption{color:var(--muted);font-size:13px;margin-top:8px}
a{color:inherit}</style>
<main><h1>#${pr} 界面预览</h1><p class="m">commit ${short(sha)} · <a href="https://github.com/${repo}/pull/${pr}">回到 PR</a>${m.summary ? " · " + esc(m.summary) : ""}</p>
${m.video ? `<figure><video src="${m.video}" controls autoplay muted playsinline poster="${m.poster || ""}"></video><figcaption>红线是鼠标走过的轨迹，红色圆环是一次点击；底部文字是这一步在做什么。空格暂停，← → 逐段查看。</figcaption></figure>` : ""}
${shots.map((x) => `<figure><img src="${esc(x.file)}" alt="${esc(x.caption)}"><figcaption>${esc(x.scene)} · ${esc(x.caption)}</figcaption></figure>`).join("\n")}
</main></html>`;
}

export async function publish() {
  const p = await gh(`/repos/${repo}/pulls/${pr}`);
  const sha = process.env.SHA || p.head.sha;
  const dir = process.env.OUT_DIR;
  const result = process.env.RECORD_RESULT || "success";
  let m = null;
  try { m = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8")); } catch {}
  if (result === "cancelled" && !m) return; // a newer commit took over
  if (!m || m.leak || (!m.scenes.some((s) => s.shots.length) && !m.video)) {
    const why = m?.leak ? "录制时屏幕上出现了密钥，已全部丢弃，没有发布任何截图"
      : m?.skipped === "no visible UI change found in the diff" ? "看了改动，没有找到用户能看到的界面变化，所以没有录制"
      : `这次没录成（${result}）`;
    const errs = m?.errors?.length ? `\n\n<details><summary>细节</summary>\n\n${m.errors.map((e) => "- " + e).join("\n")}\n</details>` : "";
    await setBlock(`${head(sha)}\n${m?.summary ? `**改动**（按代码）：${m.summary}\n\n` : ""}${m?.mismatch ? `> [!WARNING]\n> **描述与代码不符**：${m.mismatch}\n\n` : ""}${why}。${runURL ? `详见[运行记录](${runURL})。` : ""}${errs}`);
    return;
  }
  const video = m.video ? await videoAttachment(dir, m.video) : null;
  await pushMedia(sha, dir);
  const raw = `https://raw.githubusercontent.com/${repo}/${BRANCH}/pr-${pr}/${short(sha)}/`;
  let md = `${head(sha)}\n`;
  if (m.summary) md += `**改动**（按代码）：${m.summary}\n\n`;
  if (m.mismatch) md += `> [!WARNING]\n> **描述与代码不符**：${m.mismatch}\n\n`;
  if (m.unseen) md += `> [!NOTE]\n> **沙盒里看不到**：${m.unseen}\n\n`;
  if (video) {
    // gh rewrites this standalone local reference to an attachment URL, which
    // GitHub renders as a player. Linking a poster to a raw mp4 only downloads.
    md += `${video.markdown}\n\n`;
    md += `<sub>可直接播放、暂停和拖动进度 · [直接下载 mp4](${raw}${m.video}) · 红线是鼠标轨迹，红色圆环是点击</sub>\n\n`;
  }
  for (const s of m.scenes) {
    if (!s.shots.length) continue;
    md += `#### ${s.title}\n\n`;
    // shown at its own size (they're taken at 2x), a full page no wider than 760
    for (const x of s.shots) md += `<img src="${raw}${x.file}" width="${Math.min(760, Math.round((x.width || 1520) / 2))}" alt="${esc(x.caption)}">\n\n${x.caption}\n\n`;
  }
  if (m.errors?.length) md += `<details><summary>⚠️ 有 ${m.errors.length} 步没能照计划执行</summary>\n\n${m.errors.map((e) => "- " + e).join("\n")}\n</details>\n`;
  try {
    await setBlock(md, video?.file);
  } catch (error) {
    if (video) {
      // Keep screenshots and the original download available, without leaving
      // a "recording" placeholder or claiming that the video can play inline.
      const failed = md.replace(video.markdown, "> [!WARNING]\n> 视频附件发布失败，请查看运行记录；可通过下方链接下载原始录屏。")
        .replace("可直接播放、暂停和拖动进度 · ", "");
      await setBlock(failed);
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  (cmd === "detect" ? detect() : cmd === "publish" ? publish() : Promise.reject(new Error("detect | publish")))
    .catch((e) => { console.error(e); process.exit(1); });
}
