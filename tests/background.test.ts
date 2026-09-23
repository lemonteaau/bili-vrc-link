import { beforeEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => {
  const listeners: Record<string, Function> = {};
  const data: Record<string, any> = {};
  const event = (name: string) => ({
    addListener: vi.fn((fn: Function) => {
      listeners[name] = fn;
    }),
  });
  const area = {
    get: vi.fn(async (key: string | null) =>
      key ? { [key]: data[key] } : { ...data },
    ),
    set: vi.fn(async (value: object) => {
      Object.assign(data, value);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of [keys].flat()) delete data[k];
    }),
  };
  const browser = {
    runtime: {
      id: "test",
      getURL: (p: string) => "chrome-extension://test" + p,
      onInstalled: event("install"),
      onStartup: event("startup"),
      onMessage: event("message"),
    },
    contextMenus: {
      removeAll: vi.fn(),
      create: vi.fn(),
      onClicked: event("click"),
    },
    tabs: {
      create: vi.fn(async () => ({ id: 8 })),
      update: vi.fn(),
      get: vi.fn(),
      onUpdated: event("updated"),
      onRemoved: event("removed"),
    },
    storage: { local: area, session: area },
    permissions: { contains: vi.fn(async () => true) },
    scripting: { executeScript: vi.fn(async () => [{ result: true }]) },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
  };
  return { listeners, data, browser };
});
vi.mock("wxt/browser", () => ({ browser: mock.browser }));
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const k of Object.keys(mock.data)) delete mock.data[k];
  vi.stubGlobal("defineBackground", (fn: Function) => fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                title: "1440P FLV 主節點",
                url: "https://cdn.test/main",
                type: "stream",
              },
            ],
          }),
        ),
    ),
  );
  await import("../entrypoints/background");
});
describe("原生右键菜单", () => {
  it("启动时只注册监听，不注入 B 站、不请求、不复制", () => {
    expect(fetch).not.toHaveBeenCalled();
    expect(mock.browser.scripting.executeScript).not.toHaveBeenCalled();
  });
  it("安装后创建两个有范围限制的原生菜单项", async () => {
    await mock.listeners.install();
    await vi.waitFor(() =>
      expect(mock.browser.contextMenus.create).toHaveBeenCalledTimes(2),
    );
    expect(mock.browser.contextMenus.create.mock.calls[0][0]).toMatchObject({
      id: "link",
      contexts: ["link"],
    });
    expect(mock.browser.contextMenus.create.mock.calls[1][0]).toMatchObject({
      id: "page",
      contexts: ["page", "video", "selection", "image"],
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("只有点选链接菜单后解析，使用目标链接而不是当前页面", async () => {
    mock.listeners.click(
      {
        menuItemId: "link",
        linkUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
        pageUrl: "https://www.bilibili.com/",
      },
      { id: 3 },
    );
    await vi.waitFor(() =>
      expect(mock.browser.scripting.executeScript).toHaveBeenCalled(),
    );
    expect(mock.browser.scripting.executeScript.mock.calls[0][0]).toMatchObject(
      {
        target: { tabId: 3 },
        args: ["https://cdn.test/main", "已复制 1440P FLV 主節點"],
      },
    );
    expect(mock.browser.tabs.create).not.toHaveBeenCalled();
  });
  it("结果页也能发送重试消息", async () => {
    const result = await mock.listeners.message(
      { type: "resolve", input: "https://www.bilibili.com/video/BV1xx411c7mD" },
      {
        id: "test",
        url: "chrome-extension://test/result.html",
        tab: { id: 9 },
      },
    );
    expect(result.id).toBeTruthy();
  });
  it("不接受网页发来的解析消息", () => {
    expect(
      mock.listeners.message(
        {
          type: "resolve",
          input: "https://www.bilibili.com/video/BV1xx411c7mD",
        },
        { id: "test", url: "https://www.bilibili.com/", tab: { id: 9 } },
      ),
    ).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
