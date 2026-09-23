// @vitest-environment jsdom
import { it, expect, afterEach, vi } from "vitest";
import { extractFromPage } from "../lib/injected";
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});
it("从真实站点样式的复制按钮读取完整 URL", async () => {
  document.body.innerHTML = `<div class="result-item"><div class="result-title">1440P FLV 流地址 (主節點)</div><div class="result-url">https://cdn.test/abc...</div><button onclick="bilibiliParser.copyToClipboard('https://cdn.test/full?sig=a&b=c')">复制</button></div>`;
  expect(await extractFromPage("1440P FLV 主节点", "", "")).toEqual({
    url: "https://cdn.test/full?sig=a&b=c",
  });
});
it("等待异步渲染的结果", async () => {
  const result = extractFromPage("1440P FLV 主节点", "", "");
  document.body.innerHTML =
    '<section><strong>1440P FLV 主節點</strong><input value="https://cdn.test/video"></section>';
  expect(await result).toEqual({ url: "https://cdn.test/video" });
});
it("不选原始或备份节点，不选截断 URL", async () => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<div><strong>1440P FLV 原始</strong><input value="https://cdn.test/wrong"></div>';
  const result = extractFromPage("1440P FLV 主节点", "", "", 100);
  await vi.advanceTimersByTimeAsync(100);
  expect((await result).url).toBeUndefined();
});
it("支持自定义选择器和属性", async () => {
  document.body.innerHTML =
    '<button id="copy" data-link="https://cdn.test/custom">copy</button>';
  expect(await extractFromPage("ignored", "#copy", "data-link")).toEqual({
    url: "https://cdn.test/custom",
  });
});
it("选择器非法时明确报错", async () =>
  expect((await extractFromPage("", "[[", "")).error).toContain("选择器"));
it("匹配到多个地址不擅自选择", async () => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<section class="x"><a href="https://a.test/a">a</a><a href="https://a.test/b">b</a></section>';
  const result = extractFromPage("", ".x", "", 100);
  await vi.advanceTimersByTimeAsync(100);
  expect((await result).url).toBeUndefined();
});
