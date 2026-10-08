import "../../lib/ui.css";
import { browser } from "wxt/browser";
import { settings, getJob } from "../../lib/store";
import { normalizeVideo } from "../../lib/core";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const cfg = await settings();
$("order").textContent =
  "会依次尝试：" + cfg.sources.map((s) => s.name).join(" → ");
$("settings").onclick = () => {
  void browser.runtime.openOptionsPage();
};
let latest = "";
async function render() {
  const stored = (await browser.storage.local.get("latest")).latest;
  latest = typeof stored === "string" ? stored : "";
  const job = latest ? await getJob(latest) : undefined;
  const fallback = job?.attempts?.length
    ? `\n前面的方式没成功，已自动换用「${job.source.name}」。`
    : "";
  $("status").textContent = !job
    ? "还没有复制过视频。"
    : job.state === "pending"
      ? Date.now() - job.started > 60000
        ? "解析一直没有完成，可以查看详情后重试。"
        : "正在解析…"
      : job.state === "error"
        ? job.error || "解析失败"
        : `${job.copied ? "已复制" : "已准备好"}：${job.title}${fallback}`;
  $("status").dataset.error = String(job?.state === "error");
  $<HTMLTextAreaElement>("url").value = job?.url || "";
  $("url").hidden = !job?.url;
  $("copy").hidden = !job?.url;
  $("detail").hidden = !job;
}
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($<HTMLTextAreaElement>("url").value);
    $("status").textContent = "已复制，到 VRChat 播放器里粘贴即可。";
  } catch {
    $("status").textContent = "没能自动复制，请选中上面的链接手动复制。";
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
  $("current").textContent = "先打开一个 B 站视频页";
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
