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
  const click = (linkUrl = "https://www.bilibili.com/video/BV1xx411c7mD?p=2") =>
    mock.listeners.click(
      { menuItemId: "link", linkUrl, pageUrl: "https://www.bilibili.com/" },
      { id: 3 },
    );
  const copied = async () => {
    await vi.waitFor(() =>
      expect(mock.browser.scripting.executeScript).toHaveBeenCalled(),
    );
    return mock.browser.scripting.executeScript.mock.calls[0][0].args as [
      string,
      string,
    ];
  };
  const job = () => mock.data[`job:${mock.data.latest}`];
  const service =
    "https://vrc.lemontea.xyz/?url=" +
    encodeURIComponent("https://www.bilibili.com/video/BV1xx411c7mD?p=2");
  it("默认先确认在线解析服务能跳转，再复制它的长期链接", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: "https://x" } }),
    );
    click();
    expect((await copied())[0]).toBe(service);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(service);
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({
      redirect: "manual",
    });
    expect(job().attempts).toEqual([]);
  });
  it("在线解析失败时自动换用本机直接获取，并记录原因", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response("B 站接口返回 -412", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 0, data: [{ cid: 1 }, { cid: 2 }] }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: { durl: [{ url: "https://upos-a.bilivideo.com/v.mp4" }] },
          }),
        ),
      );
    click();
    const [url, message] = await copied();
    expect(url).toBe("https://upos-a.bilivideo.com/v.mp4");
    expect(message).toContain("已自动换用「本机直接获取」");
    expect(vi.mocked(fetch).mock.calls[1]![0]).toContain("api.bilibili.com");
    expect(job().attempts).toEqual([
      { source: "柠檬茶在线解析", error: "B 站接口返回 -412" },
    ]);
  });
  it("全部失败时列出每一种方式的原因并打开结果页", async () => {
    mock.data.settings = {
      sources: [
        {
          id: "a",
          name: "甲",
          prefix: "https://a.test/?url=",
          mode: "redirect",
        },
        {
          id: "b",
          name: "乙",
          prefix: "https://b.test/?url=",
          mode: "redirect",
        },
      ],
    };
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    click();
    await vi.waitFor(() => expect(job()?.state).toBe("error"));
    expect(job().error).toBe("所有解析方式都没有成功");
    expect(job().attempts.map((a: any) => a.source)).toEqual(["甲", "乙"]);
    expect(mock.browser.tabs.create).toHaveBeenCalled();
  });
  it("指定解析源重试时不再自动换源", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    const { id } = await mock.listeners.message(
      {
        type: "resolve",
        input: "https://www.bilibili.com/video/BV1xx411c7mD",
        sourceId: "vrc",
      },
      { id: "test", url: "chrome-extension://test/result.html" },
    );
    await vi.waitFor(() => expect(mock.data[`job:${id}`]?.state).toBe("error"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mock.data[`job:${id}`].error).toContain("连不上解析服务");
  });
  it("非视频链接直接报错，不尝试任何解析源", async () => {
    click("https://www.bilibili.com/");
    await vi.waitFor(() => expect(job()?.state).toBe("error"));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("从 0.1 / 0.2 升级时补上内置源，原来选中的源排在其后，只做一次", async () => {
    mock.data.settings = {
      activeId: "91",
      sources: [{ id: "gao" }, { id: "91" }],
    };
    mock.listeners.install({ reason: "update", previousVersion: "0.1.1" });
    await vi.waitFor(() => expect(mock.data.settings.activeId).toBeUndefined());
    expect(mock.data.settings.sources.map((s: any) => s.id)).toEqual([
      "vrc",
      "local",
      "91",
      "gao",
    ]);
    mock.data.settings = {
      activeId: "local",
      sources: [{ id: "gao" }, { id: "local" }],
    };
    mock.listeners.install({ reason: "update", previousVersion: "0.2.0" });
    await vi.waitFor(() =>
      expect(mock.data.settings.sources.map((s: any) => s.id)).toEqual([
        "vrc",
        "local",
        "gao",
      ]),
    );
    const before = { sources: [{ id: "91" }] };
    mock.data.settings = before;
    mock.listeners.install({ reason: "update", previousVersion: "0.3.0" });
    await Promise.resolve();
    expect(mock.data.settings).toBe(before);
  });
  it("只有点选链接菜单后解析，使用目标链接而不是当前页面", async () => {
    mock.data.settings = {
      sources: [
        {
          id: "gao",
          name: "糕",
          prefix: "https://vrcbilibili.xn--o8z.tw/?url=",
          mode: "api",
          keywords: "1440P FLV 主節點",
          selector: "",
          attribute: "",
        },
      ],
    };
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
        args: [
          "https://cdn.test/main",
          "已复制1440P FLV 主節點，到 VRChat 播放器里粘贴即可",
        ],
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
