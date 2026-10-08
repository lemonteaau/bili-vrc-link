import { beforeEach, describe, it, expect, vi } from "vitest";
import { GET } from "../api/index";
const cdn = (host: string) =>
  `https://${host}/v.mp4?deadline=${Math.floor(Date.now() / 1000) + 7200}`;
const ok = (data: unknown) => new Response(JSON.stringify({ code: 0, data }));
const get = (path: string) => GET(new Request("https://s.test" + path));
let f: ReturnType<typeof vi.fn>;
beforeEach(() => {
  f = vi.fn(async (url: string) => {
    if (url.includes("/pagelist?")) return ok([{ cid: 11 }, { cid: 22 }]);
    if (url.includes("/playurl?"))
      return ok({ durl: [{ url: cdn("upos-sz-mirrorcosov.bilivideo.com") }] });
    throw new Error("unexpected " + url);
  });
  vi.stubGlobal("fetch", f);
});
const cidOf = (call: number) =>
  new URL(f.mock.calls[call]![0]).searchParams.get("cid");
describe("跳转服务", () => {
  it("?url= 编码的完整链接，按分 P 跳转并带浏览器请求头", async () => {
    const r = await get(
      "/?url=" +
        encodeURIComponent(
          "https://www.bilibili.com/video/BV1xx411c7mD/?p=2&spm=x",
        ),
    );
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toContain("upos-sz-mirrorcosov");
    expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(r.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(cidOf(1)).toBe("22");
    expect(f.mock.calls[0]![1].headers.Referer).toBe(
      "https://www.bilibili.com/",
    );
  });
  it("接受 BV 号、未编码的链接和 /BV号.mp4", async () => {
    expect((await get("/?url=BV1Ab411c7mE&p=2")).status).toBe(302);
    expect(cidOf(1)).toBe("22");
    expect(
      (await get("/?url=https://www.bilibili.com/video/BV1Bb411c7mF?p=2"))
        .status,
    ).toBe(302);
    expect(cidOf(3)).toBe("22");
    expect((await get("/BV1Cb411c7mG.mp4")).status).toBe(302);
    expect(cidOf(5)).toBe("11");
  });
  it("从 App 分享文本中提取链接或 BV 号", async () => {
    const share =
      "【漫威争锋】简单教学双奶奥创-哔哩哔哩】 https://b23.tv/BV1Gb411c7mK";
    vi.mocked(f).mockImplementationOnce(async () =>
      Object.defineProperty(new Response(null), "url", {
        value: "https://www.bilibili.com/video/BV1Gb411c7mK?p=2&share_source=x",
      }),
    );
    expect((await get("/?url=" + encodeURIComponent(share))).status).toBe(302);
    expect(f.mock.calls[0]![0]).toBe("https://b23.tv/BV1Gb411c7mK");
    expect(cidOf(2)).toBe("22");
    expect(
      (await get("/?url=" + encodeURIComponent("看这个 BV1Hb411c7mL 好看")))
        .status,
    ).toBe(302);
    expect(f.mock.calls[3]![0]).toContain("bvid=BV1Hb411c7mL");
  });
  it("同一视频复用未过期的地址", async () => {
    await get("/?url=BV1Db411c7mH");
    await get("/?url=BV1Db411c7mH");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("首页说明，错误输入 400，解析失败 502", async () => {
    expect((await get("/")).status).toBe(200);
    for (const bad of ["/?url=", "/?url=https://evil.test/video/BV1xx411c7mD"])
      expect((await get(bad)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
    f.mockResolvedValueOnce(new Response(JSON.stringify({ code: -404 })));
    const r = await get("/?url=BV1Eb411c7mJ");
    expect(r.status).toBe(502);
    expect(await r.text()).toContain("不存在");
  });
});
