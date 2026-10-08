import "../../lib/ui.css";
import { browser } from "wxt/browser";
import { getJob, settings, type Job } from "../../lib/store";
import { sourceUrl, originPattern, needsAccess } from "../../lib/core";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const id = new URLSearchParams(location.search).get("id") || "";
let job: Job | undefined;
const cfg = await settings();
$<HTMLSelectElement>("source").add(new Option("按设置的顺序自动尝试", ""));
for (const s of cfg.sources)
  $<HTMLSelectElement>("source").add(new Option("只用：" + s.name, s.id));
async function render() {
  job = await getJob(id);
  if (!job) {
    $("title").textContent = "找不到这条记录";
    $("status").textContent =
      "记录可能已经被清理了，请回到视频页重新右键复制。";
    $<HTMLButtonElement>("retry").disabled = true;
    return;
  }
  $("title").textContent =
    job.state === "ready"
      ? job.copied
        ? "已复制，去 VRChat 粘贴吧"
        : "链接准备好了"
      : job.state === "error"
        ? "这次没有解析成功"
        : "正在解析…";
  const fallback = job.attempts?.length
    ? `前面的方式没成功，已自动换用「${job.source.name}」。`
    : "";
  $("status").textContent =
    job.state === "ready"
      ? [job.title, fallback].filter(Boolean).join("\n")
      : job.state === "error"
        ? `${job.error}\n可以展开「尝试过程」查看原因，或在下面换一种方式再试。`
        : "请稍候。如果解析网页一直没反应，可以换一种方式再试。";
  $("status").dataset.error = String(job.state === "error");
  $<HTMLTextAreaElement>("url").value = job.url || "";
  $("url").hidden = !job.url;
  $("copy").hidden = !job.url;
  $("open").hidden = job.source.mode !== "page";
  const attempts = $("attempts");
  attempts.replaceChildren(
    ...(job.attempts ?? []).map((a) => {
      const li = document.createElement("li");
      const name = document.createElement("b");
      name.textContent = a.source;
      li.append(name, "：" + a.error);
      return li;
    }),
  );
  $("log").hidden = !job.attempts?.length;
  $("input").textContent = "视频：" + job.input;
}
$("copy").onclick = async () => {
  if (!job?.url) return;
  try {
    await navigator.clipboard.writeText(job.url);
    $("status").textContent = "已复制，到 VRChat 播放器里粘贴即可。";
  } catch {
    $<HTMLTextAreaElement>("url").select();
    $("status").textContent = "请按 Ctrl+C / ⌘C 复制已选中的链接。";
  }
};
$("open").onclick = () => {
  if (job) void browser.tabs.create({ url: sourceUrl(job.source, job.input) });
};
$("settings").onclick = () => {
  void browser.runtime.openOptionsPage();
};
$("retry").onclick = async () => {
  if (!job) return;
  const sourceId = $<HTMLSelectElement>("source").value;
  const source = cfg.sources.find((s) => s.id === sourceId);
  const btn = $<HTMLButtonElement>("retry");
  btn.disabled = true;
  try {
    if (
      source &&
      needsAccess(source) &&
      !(await browser.permissions.request({ origins: [originPattern(source)] }))
    )
      throw new Error("没有获得访问这个网站的权限");
    $("status").textContent = "正在重新解析…";
    const response = await browser.runtime.sendMessage({
      type: "resolve",
      input: job.input,
      sourceId: sourceId || undefined,
    });
    location.search = "?id=" + encodeURIComponent(response.id);
  } catch (e) {
    $("status").textContent = e instanceof Error ? e.message : String(e);
  } finally {
    btn.disabled = false;
  }
};
browser.storage.onChanged.addListener(() => {
  void render();
});
await render();
