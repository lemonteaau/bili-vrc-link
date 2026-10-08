import "../../lib/ui.css";
import { browser } from "wxt/browser";
import { settings } from "../../lib/store";
import {
  type Source,
  validateSource,
  originPattern,
  needsAccess,
} from "../../lib/core";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
let cfg = await settings();
let editing = cfg.activeId;
const status = (text: string, error = false) => {
  $("status").textContent = text;
  $("status").dataset.error = String(error);
};
function modeHelp() {
  const mode = $<HTMLSelectElement>("mode").value;
  $("extract").hidden = mode === "direct" || mode === "local";
  // Local mode reuses the prefix field for an optional CDN host.
  const local = mode === "local";
  input("prefix").required = !local;
  input("prefix").placeholder = local
    ? "upos-sz-mirrorali.bilivideo.com"
    : "https://example.com/?url=";
  $("prefixLabel").textContent = local
    ? "替换 CDN 域名（可选）"
    : "解析链接前缀";
  $("prefixHelp").textContent = local
    ? "留空使用 B 站返回的节点。公开世界有白名单时，可换成世界允许的 B 站 CDN 域名。"
    : "直接粘贴网站提供的前缀。也可使用 {url}（编码）或 {rawUrl}（原样）占位符。";
  $("advanced").hidden = mode !== "page";
  $("modeHelp").textContent =
    mode === "api"
      ? "后台解析并复制，通常无需离开 B 站。仅适用于提供 /api/parse/video/BV… 接口的站点，目前仅第 1 分 P。"
      : mode === "page"
        ? "打开解析网页，等待并提取匹配的流地址。未匹配或有人机验证时保留网页，供手动操作。"
        : mode === "local"
          ? "不经过任何服务器：用你的浏览器直接请求 B 站接口，复制音画合一的 MP4 直链。链接约 2 小时后过期；登录后链接中会带有你的 UID；不支持番剧。"
          : "仅适用于网站明确支持将前缀链接直接交给 VRChat 的情况；不会将网页冒充已解析的流地址。";
}
function list() {
  const root = $("sources");
  root.replaceChildren();
  for (const s of cfg.sources) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "source" + (s.id === editing ? " selected" : "");
    const title = document.createElement("b");
    title.textContent = s.name;
    const sub = document.createElement("small");
    sub.textContent =
      s.id === cfg.activeId
        ? "● 当前默认源"
        : s.mode === "local"
          ? s.prefix || "B 站接口"
          : new URL(s.prefix).hostname;
    btn.append(title, sub);
    btn.onclick = () => load(s);
    root.append(btn);
  }
}
function load(s: Source) {
  editing = s.id;
  for (const key of [
    "name",
    "prefix",
    "keywords",
    "selector",
    "attribute",
  ] as const)
    input(key).value = s[key];
  $<HTMLSelectElement>("mode").value = s.mode;
  input("active").checked = s.id === cfg.activeId;
  $<HTMLButtonElement>("delete").disabled =
    cfg.sources.length < 2 || !cfg.sources.some((x) => x.id === s.id);
  status("");
  modeHelp();
  list();
}
$("mode").onchange = modeHelp;
$("add").onclick = () =>
  load({
    id: crypto.randomUUID(),
    name: "",
    prefix: "",
    mode: "page",
    keywords: "1440P FLV 主節點",
    selector: "",
    attribute: "",
  });
$("form").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const s = validateSource({
      id: editing,
      name: input("name").value,
      prefix: input("prefix").value,
      mode: $<HTMLSelectElement>("mode").value as Source["mode"],
      keywords: input("keywords").value,
      selector: input("selector").value.trim(),
      attribute: input("attribute").value.trim(),
    });
    if (s.selector) document.querySelector(s.selector);
    // request must run directly inside the user's click, before unrelated asynchronous work (Firefox).
    if (
      needsAccess(s) &&
      !(await browser.permissions.request({ origins: [originPattern(s)] }))
    )
      throw new Error("未获得访问权限，设置尚未保存。也可选择仅复制拼接链接。");
    const index = cfg.sources.findIndex((x) => x.id === s.id);
    if (index < 0) cfg.sources.push(s);
    else cfg.sources[index] = s;
    if (input("active").checked) cfg.activeId = s.id;
    await browser.storage.local.set({ settings: cfg });
    list();
    status("已保存。下次点选右键菜单时生效。");
    $<HTMLButtonElement>("delete").disabled = cfg.sources.length < 2;
  } catch (e) {
    status(e instanceof Error ? e.message : String(e), true);
  }
};
$("delete").onclick = async () => {
  if (cfg.sources.length < 2) return;
  cfg.sources = cfg.sources.filter((s) => s.id !== editing);
  if (cfg.activeId === editing) cfg.activeId = cfg.sources[0]!.id;
  await browser.storage.local.set({ settings: cfg });
  load(cfg.sources.find((s) => s.id === cfg.activeId)!);
  status("已删除解析源。");
};
load(cfg.sources.find((s) => s.id === editing) || cfg.sources[0]!);
