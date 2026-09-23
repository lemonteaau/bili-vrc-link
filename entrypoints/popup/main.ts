import "../../lib/ui.css";
import { browser } from "wxt/browser";
import { settings, getJob } from "../../lib/store";
import { normalizeVideo } from "../../lib/core";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const cfg = await settings();
for (const s of cfg.sources) {
  const option = new Option(s.name, s.id);
  $<HTMLSelectElement>("source").add(option);
}
$<HTMLSelectElement>("source").value = cfg.activeId;
$("source").onchange = async () => {
  cfg.activeId = $<HTMLSelectElement>("source").value;
  await browser.storage.local.set({ settings: cfg });
};
$("settings").onclick = () => {
  void browser.runtime.openOptionsPage();
};
let latest = "";
async function render() {
  const stored = (await browser.storage.local.get("latest")).latest;
  latest = typeof stored === "string" ? stored : "";
  const job = latest ? await getJob(latest) : undefined;
  $("status").textContent = !job
    ? "还没有解析记录。"
    : job.state === "pending"
      ? Date.now() - job.started > 60000
        ? "解析未完成，可查看结果后重试。"
        : "正在解析…"
      : job.state === "error"
        ? job.error || "解析失败"
        : `${job.copied ? "已复制" : "已就绪"} · ${job.title}`;
  $("status").dataset.error = String(job?.state === "error");
  $<HTMLTextAreaElement>("url").value = job?.url || "";
  $("url").hidden = !job?.url;
  $("copy").hidden = !job?.url;
  $("detail").hidden = !job;
}
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($<HTMLTextAreaElement>("url").value);
    $("status").textContent = "已复制，可粘贴到 VRChat 播放器。";
  } catch {
    $("status").textContent = "复制失败，请选中链接手动复制。";
    $<HTMLTextAreaElement>("url").select();
  }
};
$("detail").onclick = () => {
  void browser.tabs.create({
    url:
      browser.runtime.getURL("/result.html") +
      "?id=" +
      encodeURIComponent(latest),
  });
};
const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
try {
  normalizeVideo(tab?.url || "");
} catch {
  $<HTMLButtonElement>("current").disabled = true;
  $("current").textContent = "请打开 B 站视频";
}
$("current").onclick = () => {
  void browser.runtime
    .sendMessage({ type: "resolve", input: tab?.url, tabId: tab?.id })
    .catch((e) => {
      $("status").textContent = String(e);
    });
  window.close();
};
browser.storage.onChanged.addListener(() => {
  void render();
});
await render();
