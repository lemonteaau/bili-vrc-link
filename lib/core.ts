export type Source = {
  id: string;
  name: string;
  prefix: string;
  mode: "api" | "page" | "direct";
  keywords: string;
  selector: string;
  attribute: string;
};
export type Settings = { activeId: string; sources: Source[] };
export const defaults: Settings = {
  activeId: "gao",
  sources: [
    {
      id: "gao",
      name: "糕 · 1440P 主节点",
      prefix: "https://vrcbilibili.糕.tw/?url=",
      mode: "api",
      keywords: "1440P FLV 主節點",
      selector: "",
      attribute: "",
    },
    {
      id: "91",
      name: "91VRChat",
      prefix: "https://biliplayer.91vrchat.com/player/?url=",
      mode: "page",
      keywords: "1440P FLV 主節點",
      selector: "",
      attribute: "",
    },
  ],
};
export function httpUrl(value: string): URL {
  const u = new URL(value);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw new Error("只支持不含账号密码的 HTTP / HTTPS 链接");
  return u;
}
export function normalizeVideo(value: string): string {
  const u = httpUrl(value.trim());
  const host = u.hostname.toLowerCase();
  if (host === "b23.tv" && /^\/[a-zA-Z0-9]+\/?$/.test(u.pathname))
    return `https://b23.tv${u.pathname}`;
  if (host !== "bilibili.com" && !host.endsWith(".bilibili.com"))
    throw new Error("请选择 B 站视频链接");
  const pathId = u.pathname.match(
    /^\/video\/(BV[a-zA-Z0-9]{10}|av\d+)(?:\/|$)/i,
  )?.[1];
  const queryId = u.searchParams.get("bvid");
  const id =
    pathId || (queryId && /^BV[a-zA-Z0-9]{10}$/.test(queryId) ? queryId : null);
  const bangumi = u.pathname.match(
    /^\/bangumi\/play\/(ep\d+|ss\d+)(?:\/|$)/,
  )?.[1];
  if (!id && !bangumi) throw new Error("当前页面不是可识别的 B 站视频页");
  const out = new URL(
    id
      ? `https://www.bilibili.com/video/${id}`
      : `https://www.bilibili.com/bangumi/play/${bangumi}`,
  );
  const p = u.searchParams.get("p");
  if (p && /^[1-9]\d*$/.test(p)) out.searchParams.set("p", p);
  return out.href;
}
export function sourceUrl(source: Source, video: string): string {
  const prefix = source.prefix.trim();
  const built = prefix.includes("{url}")
    ? prefix.replaceAll("{url}", encodeURIComponent(video))
    : prefix.includes("{rawUrl}")
      ? prefix.replaceAll("{rawUrl}", video)
      : prefix + encodeURIComponent(video);
  return httpUrl(built).href;
}
export function originPattern(source: Source): string {
  return `${httpUrl(sourceUrl(source, "https://www.bilibili.com/video/BV1xx411c7mD")).origin}/*`;
}
export function validateSource(source: Source): Source {
  if (!source.name.trim()) throw new Error("请填写解析源名称");
  if (!["api", "page", "direct"].includes(source.mode))
    throw new Error("未知解析模式");
  if (
    !source.prefix.trim().includes("{url}") &&
    !source.prefix.trim().includes("{rawUrl}") &&
    !source.prefix.trim().endsWith("=")
  )
    throw new Error("填入以 = 结尾的前缀，或使用 {url} 占位符");
  originPattern(source);
  if (
    source.mode === "page" &&
    !source.keywords.trim() &&
    !source.selector.trim()
  )
    throw new Error("网页提取需要匹配词或 CSS 选择器");
  return { ...source, name: source.name.trim(), prefix: source.prefix.trim() };
}
export function matchesTitle(title: string, keywords: string): boolean {
  const fold = (s: string) =>
    s
      .toLowerCase()
      .replaceAll("節", "节")
      .replaceAll("點", "点")
      .replaceAll("節", "节");
  return keywords
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((k) => fold(title).includes(fold(k)));
}
export function selectStream(
  payload: unknown,
  keywords: string,
): { url: string; title: string } {
  const data = payload as {
    success?: boolean;
    data?: unknown;
    message?: string;
  };
  if (!data || data.success !== true || !Array.isArray(data.data))
    throw new Error("解析站未返回有效结果，请打开源站检查");
  const candidates = data.data.filter(
    (x): x is { title: string; url: string; type?: string } =>
      !!x &&
      typeof x === "object" &&
      typeof x.title === "string" &&
      typeof x.url === "string" &&
      (!x.type || x.type === "stream") &&
      matchesTitle(x.title, keywords),
  );
  if (!candidates.length)
    throw new Error("没有找到 1440P FLV 主节点；未复制其他清晰度或原始链接");
  if (new Set(candidates.map((c) => c.url)).size !== 1)
    throw new Error("匹配到多个流地址，请缩小匹配条件");
  const selected = candidates[0]!;
  httpUrl(selected.url);
  return { url: selected.url, title: selected.title };
}
export async function resolveApi(
  source: Source,
  input: string,
  fetcher: typeof fetch = fetch,
) {
  const origin = new URL(sourceUrl(source, input)).origin;
  async function json(path: string) {
    const r = await fetcher(origin + path, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(18000),
    });
    if (!r.ok)
      throw new Error(`解析站返回 HTTP ${r.status}，可重试或更换解析源`);
    try {
      return await r.json();
    } catch {
      throw new Error("解析站返回了网页而非结果，可能需要在源站完成人机验证");
    }
  }
  let video = normalizeVideo(input);
  if (new URL(video).hostname === "b23.tv") {
    const data = await json(
      `/api/parse/shortlink?url=${encodeURIComponent(video)}`,
    );
    if (!data.success || typeof data.fullUrl !== "string")
      throw new Error("短链接展开失败，请使用完整 B 站视频链接");
    video = normalizeVideo(data.fullUrl);
  }
  // The observed upstream API accepts only a BV ID, not a page/CID. Never silently resolve P1 for P2.
  if (Number(new URL(video).searchParams.get("p") || 1) > 1)
    throw new Error(
      "该源的接口只支持第 1 分 P，不能准确解析当前分 P；请切换支持分 P 的解析源",
    );
  const bvid = new URL(video).pathname.match(
    /\/video\/(BV[a-zA-Z0-9]{10})/i,
  )?.[1];
  if (!bvid)
    throw new Error("该接口需要 BV 号，请打开对应视频后重试或更换解析源");
  return selectStream(
    await json(`/api/parse/video/${bvid}`),
    source.keywords || "1440P FLV 主節點",
  );
}
