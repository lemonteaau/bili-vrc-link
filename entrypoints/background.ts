import { browser } from "wxt/browser";
import {
  defaults,
  type Settings,
  normalizeVideo,
  resolveApi,
  resolveLocal,
  sourceUrl,
  originPattern,
  needsAccess,
  checkRedirect,
  type Source,
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
      title: "复制这个视频的 VRChat 播放链接",
      contexts: ["link"],
      targetUrlPatterns: linkPatterns,
    });
    browser.contextMenus.create({
      id: "page",
      title: "复制当前视频的 VRChat 播放链接",
      contexts: ["page", "video", "selection", "image"],
      documentUrlPatterns: linkPatterns,
    });
  }
  browser.runtime.onInstalled.addListener((details) => {
    void menus();
    if (details?.reason !== "update") return;
    const from = details.previousVersion ?? "";
    void (async () => {
      if (/^0\.[12]\./.test(from)) await migrateSources();
      if (/^0\.([12]\.|3\.[01]$)/.test(from)) await migrate91();
    })();
  });
  // Up to 0.3.1 the built-in 91VRChat source opened its parse page and read the result.
  // Its link redirects by itself, so an unmodified one now just gets concatenated.
  async function migrate91() {
    const stored = (await browser.storage.local.get("settings")).settings as
      Settings | undefined;
    const now = defaults.sources.find((d) => d.id === "91")!;
    const old = (s: Source) =>
      s.id === "91" && s.mode === "page" && s.prefix === now.prefix;
    if (!stored?.sources.some(old)) return;
    await browser.storage.local.set({
      settings: {
        sources: stored.sources.map((s) =>
          old(s) ? { ...s, mode: now.mode, keywords: now.keywords } : s,
        ),
      },
    });
  }
  // Before 0.3 one source was "active"; now list order is the fallback order.
  // Put the new built-in sources first, then the previously active one.
  async function migrateSources() {
    const stored = (await browser.storage.local.get("settings")).settings as
      (Settings & { activeId?: string }) | undefined;
    if (!stored) return;
    const added = defaults.sources.filter(
      (d) =>
        ["vrc", "local"].includes(d.id) &&
        !stored.sources.some((s) => s.id === d.id),
    );
    const active = stored.sources.filter((s) => s.id === stored.activeId);
    const rest = stored.sources.filter((s) => s.id !== stored.activeId);
    await browser.storage.local.set({
      settings: { sources: [...added, ...active, ...rest] },
    });
  }
  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
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
          args: [
            result.url,
            `已复制${result.title}，到 VRChat 播放器里粘贴即可` +
              (job.attempts?.length
                ? `（已自动换用「${job.source.name}」）`
                : ""),
          ],
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
    job.error = message(error);
    await saveJob(job);
    await badge(job, "!");
    if (open) await showResult(job);
  }
  // Resolves with the stream, or null once a parse page opens and will finish later.
  async function attempt(
    job: Job,
    source: Source,
  ): Promise<{ url: string; title: string } | null> {
    if (
      needsAccess(source) &&
      !(await browser.permissions.contains({
        origins: [originPattern(source)],
      }))
    )
      throw new Error("还没有授权访问这个网站，请在设置里选中它并点「保存」");
    switch (source.mode) {
      case "redirect":
        return checkRedirect(source, job.input);
      case "local":
        return resolveLocal(source, job.input);
      case "api":
        return resolveApi(source, job.input);
      case "direct":
        return {
          url: sourceUrl(source, job.input),
          title: "拼接链接（由播放器解析）",
        };
      case "page": {
        // Start on about:blank so the pending record exists before navigation completes.
        const tab = await browser.tabs.create({ url: "about:blank" });
        if (tab.id === undefined) throw new Error("无法打开解析网页");
        await browser.storage.session.set({ [`pending:${tab.id}`]: job.id });
        await browser.tabs.update(tab.id, {
          url: sourceUrl(source, job.input),
        });
        return null;
      }
    }
  }
  // Tries sources in list order until one works; a chosen sourceId tries only that one.
  async function run(
    input: string,
    tabId?: number,
    sourceId?: string,
  ): Promise<string> {
    const cfg = await settings();
    const sources = sourceId
      ? cfg.sources.filter((s) => s.id === sourceId)
      : cfg.sources;
    if (!sources[0]) throw new Error("请先在设置里添加解析源");
    const job: Job = {
      id: crypto.randomUUID(),
      input,
      source: sources[0],
      state: "pending",
      started: Date.now(),
      attempts: [],
    };
    await startJob(job);
    await badge(job, "…");
    try {
      job.input = normalizeVideo(input);
    } catch (error) {
      await fail(job, error);
      return job.id;
    }
    for (const source of sources) {
      job.source = source;
      try {
        const result = await attempt(job, source);
        if (result) await finish(job, result, tabId);
        else await saveJob(job);
        return job.id;
      } catch (error) {
        job.attempts!.push({ source: source.name, error: message(error) });
        await saveJob(job);
      }
    }
    await fail(
      job,
      job.attempts!.length > 1
        ? "所有解析方式都没有成功"
        : job.attempts![0]!.error,
    );
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
            "解析网页跳到了另一个网站，请在网页里手动完成，或把新网址添加为解析源",
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
        if (!result?.url)
          throw new Error(result?.error || "没有在网页里找到视频地址");
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
        if (job) await fail(job, new Error("解析网页被关掉了"), false);
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
