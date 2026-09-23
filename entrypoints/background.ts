import { browser } from "wxt/browser";
import {
  normalizeVideo,
  resolveApi,
  sourceUrl,
  originPattern,
} from "../lib/core";
import { settings, startJob, saveJob, getJob, type Job } from "../lib/store";
import { copyInPage, extractFromPage } from "../lib/injected";
export default defineBackground(() => {
  const linkPatterns = [
    "*://*.bilibili.com/video/*",
    "*://*.bilibili.com/bangumi/play/*",
    "*://*.bilibili.com/*bvid=*",
    "*://b23.tv/*",
  ];
  async function menus() {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: "link",
      title: "将此视频链接解析为 VRChat 播放器链接",
      contexts: ["link"],
      targetUrlPatterns: linkPatterns,
    });
    browser.contextMenus.create({
      id: "page",
      title: "将当前视频解析为 VRChat 播放器链接",
      contexts: ["page", "video", "selection", "image"],
      documentUrlPatterns: linkPatterns,
    });
  }
  browser.runtime.onInstalled.addListener(() => {
    void menus();
  });
  browser.runtime.onStartup.addListener(() => {
    void menus();
  });
  async function showResult(job: Job) {
    await browser.tabs.create({
      url:
        browser.runtime.getURL("/result.html") +
        "?id=" +
        encodeURIComponent(job.id),
    });
  }
  async function badge(job: Job, text: string) {
    if ((await browser.storage.local.get("latest")).latest !== job.id) return;
    await browser.action.setBadgeText({ text });
    await browser.action.setBadgeBackgroundColor({
      color: job.state === "error" ? "#b84e35" : "#266857",
    });
  }
  async function finish(
    job: Job,
    result: { url: string; title: string },
    tabId?: number,
  ) {
    Object.assign(job, result, { state: "ready" });
    if (tabId !== undefined) {
      try {
        const response = await browser.scripting.executeScript({
          target: { tabId },
          func: copyInPage,
          args: [result.url, "已复制 " + result.title],
        });
        job.copied = response[0]?.result === true;
      } catch {
        job.copied = false;
      }
    }
    await saveJob(job);
    await badge(job, job.copied ? "✓" : "1");
    if (!job.copied) await showResult(job);
  }
  async function fail(job: Job, error: unknown, open = true) {
    job.state = "error";
    job.error = error instanceof Error ? error.message : String(error);
    await saveJob(job);
    await badge(job, "!");
    if (open) await showResult(job);
  }
  async function run(
    input: string,
    tabId?: number,
    sourceId?: string,
  ): Promise<string> {
    const cfg = await settings();
    const source =
      cfg.sources.find((s) => s.id === (sourceId || cfg.activeId)) ||
      cfg.sources[0];
    if (!source) throw new Error("请先添加解析源");
    const job: Job = {
      id: crypto.randomUUID(),
      input,
      source,
      state: "pending",
      started: Date.now(),
    };
    await startJob(job);
    await badge(job, "…");
    try {
      job.input = normalizeVideo(input);
      if (source.mode === "direct") {
        await finish(
          job,
          {
            url: sourceUrl(source, job.input),
            title: "解析入口链接（由播放器解析）",
          },
          tabId,
        );
      } else if (source.mode === "api") {
        if (
          !(await browser.permissions.contains({
            origins: [originPattern(source)],
          }))
        )
          throw new Error(
            "需要该解析源的访问权限，请在设置中点击「保存并授权」",
          );
        await finish(job, await resolveApi(source, job.input), tabId);
      } else {
        if (
          !(await browser.permissions.contains({
            origins: [originPattern(source)],
          }))
        )
          throw new Error(
            "请先在设置中选中此源并点击「保存并授权」，允许提取该站结果",
          );
        // Start on about:blank so the pending record exists before navigation completes.
        const tab = await browser.tabs.create({ url: "about:blank" });
        if (tab.id === undefined) throw new Error("无法打开解析页面");
        await browser.storage.session.set({ [`pending:${tab.id}`]: job.id });
        await browser.tabs.update(tab.id, {
          url: sourceUrl(source, job.input),
        });
      }
    } catch (error) {
      await fail(job, error);
    }
    return job.id;
  }
  browser.contextMenus.onClicked.addListener((info, tab) => {
    const input =
      info.menuItemId === "link" ? info.linkUrl : info.pageUrl || tab?.url;
    if (input) void run(input, tab?.id);
  });
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status !== "complete") return;
    void (async () => {
      const key = `pending:${tabId}`;
      const id = (await browser.storage.session.get(key))[key];
      if (typeof id !== "string") return;
      const tab = await browser.tabs.get(tabId);
      if (!tab.url || tab.url === "about:blank") return;
      await browser.storage.session.remove(key);
      const job = await getJob(id);
      if (!job) return;
      try {
        if (
          new URL(tab.url).origin !==
          new URL(sourceUrl(job.source, job.input)).origin
        )
          throw new Error(
            "解析站跳转到了另一个域名；请手动完成，或将新域名添加为解析源",
          );
        const results = await browser.scripting.executeScript({
          target: { tabId },
          func: extractFromPage,
          args: [
            job.source.keywords,
            job.source.selector,
            job.source.attribute,
          ],
        });
        const result = results[0]?.result;
        if (!result?.url) throw new Error(result?.error || "没有读取到流地址");
        await finish(
          job,
          { url: result.url, title: job.source.keywords || "自定义提取结果" },
          tabId,
        );
      } catch (error) {
        await fail(job, error);
      }
    })();
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      const key = `pending:${tabId}`;
      const id = (await browser.storage.session.get(key))[key];
      await browser.storage.session.remove(key);
      if (typeof id === "string") {
        const job = await getJob(id);
        if (job) await fail(job, new Error("解析页面已关闭"), false);
      }
    })();
  });
  browser.runtime.onMessage.addListener((message, sender) => {
    if (
      sender.id !== browser.runtime.id ||
      !sender.url?.startsWith(browser.runtime.getURL("/"))
    )
      return;
    if (message?.type === "resolve" && typeof message.input === "string")
      return run(message.input, message.tabId, message.sourceId).then((id) => ({
        id,
      }));
  });
});
