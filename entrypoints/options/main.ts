import "../../lib/ui.css";
import { browser } from "wxt/browser";
import { settings } from "../../lib/store";
import {
  type Source,
  defaults,
  modes,
  validateSource,
  originPattern,
  needsAccess,
} from "../../lib/core";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
let cfg = await settings();
let editing = cfg.sources[0]?.id ?? "";
const status = (text: string, error = false) => {
  $("status").textContent = text;
  $("status").dataset.error = String(error);
};
const save = () => browser.storage.local.set({ settings: cfg });
for (const [value, { label }] of Object.entries(modes))
  $<HTMLSelectElement>("mode").add(new Option(label, value));
function modeHelp() {
  const mode = $<HTMLSelectElement>("mode").value as Source["mode"];
  $("modeHelp").textContent = modes[mode].help;
  $("advanced").hidden = mode !== "api" && mode !== "page";
  $("pageOnly").hidden = mode !== "page";
  // Local mode reuses the address field for an optional CDN host.
  const local = mode === "local";
  input("prefix").required = !local;
  input("prefix").placeholder = local
    ? "upos-sz-mirrorali.bilivideo.com"
    : "https://example.com/?url=";
  $("prefixLabel").textContent = local
    ? "替换 CDN 域名（可选，一般留空）"
    : "网址";
  $("prefixHelp").textContent = local
    ? "留空就用 B 站给的节点。某些公开世界只允许特定域名时，可以换成世界允许的 B 站 CDN 域名。"
    : "填网站提供的地址，视频链接会接在最后面；也可以用 {url} 标出视频链接的位置。";
}
function list() {
  const root = $("sources");
  root.replaceChildren();
  cfg.sources.forEach((s, i) => {
    const item = document.createElement("li");
    item.className = "source-item" + (s.id === editing ? " selected" : "");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "source";
    const order = document.createElement("span");
    order.className = "order";
    order.textContent = String(i + 1);
    const title = document.createElement("b");
    title.textContent = s.name;
    const sub = document.createElement("small");
    sub.textContent = `${i === 0 ? "首选" : "备用"} · ${modes[s.mode]?.label ?? s.mode}`;
    btn.append(order, title, sub);
    btn.onclick = () => load(s);
    const move = document.createElement("div");
    move.className = "move";
    for (const [label, delta] of [
      ["↑", -1],
      ["↓", 1],
    ] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.setAttribute(
        "aria-label",
        `把「${s.name}」${delta < 0 ? "上移" : "下移"}`,
      );
      b.disabled = !cfg.sources[i + delta];
      b.onclick = async () => {
        [cfg.sources[i], cfg.sources[i + delta]] = [
          cfg.sources[i + delta]!,
          cfg.sources[i]!,
        ];
        await save();
        list();
        status("顺序已保存。");
      };
      move.append(b);
    }
    item.append(btn, move);
    root.append(item);
  });
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
  const saved = cfg.sources.some((x) => x.id === s.id);
  $("heading").textContent = saved ? "修改解析源" : "添加解析源";
  $<HTMLButtonElement>("delete").disabled = cfg.sources.length < 2 || !saved;
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
    mode: "redirect",
    keywords: "1440P FLV 主節點",
    selector: "",
    attribute: "",
  });
$("reset").onclick = async () => {
  if (!confirm("恢复默认的解析方式和顺序？你添加的解析源会被删除。")) return;
  cfg = structuredClone(defaults);
  await save();
  load(cfg.sources[0]!);
  status("已恢复默认设置。");
};
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
      throw new Error("没有获得访问这个网站的权限，设置还没保存。");
    const index = cfg.sources.findIndex((x) => x.id === s.id);
    if (index < 0) cfg.sources.push(s);
    else cfg.sources[index] = s;
    await save();
    load(s);
    status(
      index < 0
        ? "已保存，并加到了列表最后。可以用 ↑ 调整它的顺序。"
        : "已保存。",
    );
  } catch (e) {
    status(e instanceof Error ? e.message : String(e), true);
  }
};
$("delete").onclick = async () => {
  if (cfg.sources.length < 2) return;
  cfg.sources = cfg.sources.filter((s) => s.id !== editing);
  await save();
  load(cfg.sources[0]!);
  status("已删除。");
};
load(cfg.sources.find((s) => s.id === editing) ?? cfg.sources[0]!);
