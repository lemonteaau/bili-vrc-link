import "../../lib/ui.css";
import { browser } from "wxt/browser";
import { getJob, settings, type Job } from "../../lib/store";
import { sourceUrl, originPattern } from "../../lib/core";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const id = new URLSearchParams(location.search).get("id") || "";
let job: Job | undefined;
const cfg = await settings();
for (const s of cfg.sources)
  $<HTMLSelectElement>("source").add(new Option(s.name, s.id));
async function render() {
  job = await getJob(id);
  if (!job) {
    $("status").textContent =
      "此记录不存在或已清理，请重新从视频右键菜单解析。";
    for (const k of ["retry", "open"]) $<HTMLButtonElement>(k).disabled = true;
    return;
  }
  $("title").textContent =
    job.state === "ready"
      ? "播放器链接已就绪"
      : job.state === "error"
        ? "这次没有解析成功"
        : "正在解析";
  $("status").textContent =
    job.error ||
    job.title ||
    "请稍候；如果解析站长时间无响应，可以重试或打开源站。";
  $("status").dataset.error = String(job.state === "error");
  $<HTMLTextAreaElement>("url").value = job.url || "";
  $("url").hidden = !job.url;
  $("copy").hidden = !job.url;
  $("input").textContent = "视频：" + job.input;
}
$("copy").onclick = async () => {
  if (!job?.url) return;
  try {
    await navigator.clipboard.writeText(job.url);
    $("status").textContent = "已复制，可直接粘贴到 VRChat 播放器。";
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
  const source = cfg.sources.find(
    (s) => s.id === $<HTMLSelectElement>("source").value,
  );
  if (!source) return;
  const btn = $<HTMLButtonElement>("retry");
  btn.disabled = true;
  try {
    if (
      source.mode !== "direct" &&
      !(await browser.permissions.request({ origins: [originPattern(source)] }))
    )
      throw new Error("未授权该解析源");
    $("status").textContent = "正在重新解析…";
    const response = await browser.runtime.sendMessage({
      type: "resolve",
      input: job.input,
      sourceId: source.id,
    });
    location.search = "?id=" + encodeURIComponent(response.id);
  } catch (e) {
    $("status").textContent = String(e);
  } finally {
    btn.disabled = false;
  }
};
browser.storage.onChanged.addListener(() => {
  void render();
});
await render();
$<HTMLSelectElement>("source").value = job?.source.id || cfg.activeId;
