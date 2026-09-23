import { describe, it, expect, vi } from "vitest";
import {
  normalizeVideo,
  sourceUrl,
  defaults,
  selectStream,
  resolveApi,
  validateSource,
} from "../lib/core";
const s = defaults.sources[0];
const video = "https://www.bilibili.com/video/BV1xx411c7mD";
describe("视频链接", () => {
  it("保留分 P，移除追踪参数", () =>
    expect(normalizeVideo(video + "/?p=3&vd_source=tracking#reply")).toBe(
      video + "?p=3",
    ));
  it("支持短链接和 bvid 查询", () => {
    expect(normalizeVideo("https://b23.tv/abc123?share=1")).toBe(
      "https://b23.tv/abc123",
    );
    expect(
      normalizeVideo("https://www.bilibili.com/list/123?bvid=BV1xx411c7mD"),
    ).toBe(video);
  });
  it.each([
    "https://bilibili.com.attacker.test/video/BV1xx411c7mD",
    "javascript:alert(1)",
    "https://www.bilibili.com/",
    "https://user:secret@www.bilibili.com/video/BV1xx411c7mD",
  ])("拒绝错误输入 %s", (v) => expect(() => normalizeVideo(v)).toThrow());
  it("前缀编码保留嵌套参数", () => {
    const u = new URL(sourceUrl(s, video + "?p=2"));
    expect(u.searchParams.get("url")).toBe(video + "?p=2");
    expect(u.hostname).toBe("vrcbilibili.xn--o8z.tw");
  });
  it("支持 url 和 rawUrl 模板", () => {
    expect(
      sourceUrl(
        { ...s, prefix: "https://a.test/?url={url}&mode=vrc" },
        video + "?p=2",
      ),
    ).toContain("&mode=vrc");
    expect(
      sourceUrl({ ...s, prefix: "https://a.test/?url={rawUrl}" }, video),
    ).toBe("https://a.test/?url=" + video);
  });
});
describe("只选指定流", () => {
  const payload = {
    success: true,
    data: [
      { title: "影片資訊", type: "info", url: video },
      { title: "1440P FLV 流地址 (原始)", url: "https://cdn.test/original" },
      { title: "1080P FLV 流地址 (主節點)", url: "https://cdn.test/1080" },
      {
        title: "1440P FLV 流地址 (主節點)",
        url: "https://cdn.test/main?sign=a&b=c",
        type: "stream",
      },
    ],
  };
  it("按标签取主节点，保留签名而非检查文件后缀", () =>
    expect(selectStream(payload, s.keywords).url).toBe(
      "https://cdn.test/main?sign=a&b=c",
    ));
  it("兼容简繁体", () =>
    expect(selectStream(payload, "1440p flv 主节点").url).toContain("/main"));
  it("无目标不回退", () =>
    expect(() =>
      selectStream({ ...payload, data: payload.data.slice(0, 3) }, s.keywords),
    ).toThrow("没有找到"));
  it("拒绝多个不同结果", () =>
    expect(() =>
      selectStream(
        {
          ...payload,
          data: [
            ...payload.data,
            { title: payload.data[3].title, url: "https://other.test/x" },
          ],
        },
        s.keywords,
      ),
    ).toThrow("多个"));
  it("拒绝失败响应和危险协议", () => {
    expect(() => selectStream({ success: false }, s.keywords)).toThrow();
    expect(() =>
      selectStream(
        {
          success: true,
          data: [{ title: payload.data[3].title, url: "javascript:alert(1)" }],
        },
        s.keywords,
      ),
    ).toThrow();
  });
});
describe("API", () => {
  it("不将 P2 误解析为 P1", async () => {
    const f = vi.fn();
    await expect(resolveApi(s, video + "?p=2", f)).rejects.toThrow("分 P");
    expect(f).not.toHaveBeenCalled();
  });
  it("短链接展开后解析，且不发送凭证", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, fullUrl: video })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ title: s.keywords, url: "https://cdn.test/v" }],
          }),
        ),
      );
    expect((await resolveApi(s, "https://b23.tv/abc", f)).url).toBe(
      "https://cdn.test/v",
    );
    expect(f.mock.calls[1][0]).toMatch(/\/api\/parse\/video\/BV1xx411c7mD$/);
    expect(f.mock.calls[1][1].credentials).toBe("omit");
  });
  it("报告 403 和 HTML 验证页", async () => {
    await expect(
      resolveApi(
        s,
        video,
        vi.fn().mockResolvedValue(new Response("", { status: 403 })),
      ),
    ).rejects.toThrow("403");
    await expect(
      resolveApi(
        s,
        video,
        vi.fn().mockResolvedValue(new Response("<html>challenge</html>")),
      ),
    ).rejects.toThrow("网页");
  });
  it("配置校验", () => {
    expect(() => validateSource({ ...s, prefix: "https://a.test/" })).toThrow();
    expect(() =>
      validateSource({ ...s, mode: "page", keywords: "", selector: "" }),
    ).toThrow();
  });
});
