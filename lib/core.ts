export type Source = {
  id: string;
  name: string;
  prefix: string;
  // local: prefix holds an optional replacement CDN host instead of a URL.
  mode: "redirect" | "local" | "api" | "page" | "direct";
  keywords: string;
  selector: string;
  attribute: string;
};
// Sources are tried in list order until one succeeds.
export type Settings = { sources: Source[] };
// Plain-language names and explanations shown in the UI.
export const modes: Record<Source["mode"], { label: string; help: string }> = {
  redirect: {
    label: "在线解析服务（推荐）",
    help: "复制一个长期有效的链接。房间里每个人播放时，服务都会实时取最新的视频地址，适合多人一起看。复制前会先确认服务能正常工作。",
  },
  local: {
    label: "在本机直接获取",
    help: "不经过任何第三方，由你的浏览器直接向 B 站获取视频地址。画质通常为 720P，登录 B 站后可能更高。链接约 2 小时后失效；登录时链接里会带有你的 B 站 UID。",
  },
  api: {
    label: "解析站接口（糕站格式）",
    help: "调用与糕站相同格式的接口，只取标题包含指定文字的那一路视频，例如 1440P FLV 主节点。目前只支持第 1 个分 P。",
  },
  page: {
    label: "打开解析网页并自动读取",
    help: "在新标签页打开解析网页，等结果出现后自动读取。遇到人机验证时会保留网页，你可以手动完成。",
  },
  direct: {
    label: "只拼接链接",
    help: "只把视频链接拼到地址后面，不做任何检查。仅在网站说明支持这样用时选择。",
  },
};
export const defaults: Settings = {
  sources: [
    {
      // Our own redirect service (api/index.ts): the copied link never expires.
      id: "vrc",
      name: "柠檬茶在线解析",
      prefix: "https://vrc.lemontea.xyz/?url=",
      mode: "redirect",
      keywords: "",
      selector: "",
      attribute: "",
    },
    {
      id: "local",
      name: "本机直接获取",
      prefix: "",
      mode: "local",
      keywords: "",
      selector: "",
      attribute: "",
    },
    {
      id: "gao",
      name: "糕站 · 1440P",
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
// local and the built-in service use host permissions granted at install time.
export function needsAccess(source: Source): boolean {
  return ["redirect", "api", "page"].includes(source.mode);
}
export function sourceUrl(source: Source, video: string): string {
  const prefix = source.prefix.trim();
  if (source.mode === "local") return httpUrl(video).href;
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
  if (!source.name.trim()) throw new Error("请给这个解析源起个名字");
  if (!(source.mode in modes)) throw new Error("未知解析方式");
  if (source.mode === "local") {
    const cdn = source.prefix
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "");
    if (cdn && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(cdn))
      throw new Error(
        "CDN 域名只填主机名，例如 upos-sz-mirrorali.bilivideo.com",
      );
    return { ...source, name: source.name.trim(), prefix: cdn };
  }
  if (
    !source.prefix.trim().includes("{url}") &&
    !source.prefix.trim().includes("{rawUrl}") &&
    !source.prefix.trim().endsWith("=")
  )
    throw new Error("地址需要以 = 结尾，或用 {url} 标出视频链接的位置");
  originPattern(source);
  if (
    source.mode === "page" &&
    !source.keywords.trim() &&
    !source.selector.trim()
  )
    throw new Error("请填写结果标题要包含的文字，或在高级设置里填 CSS 选择器");
  return { ...source, name: source.name.trim(), prefix: source.prefix.trim() };
}
// A redirect service answers 3xx when it resolved the video; anything else is its error.
export async function checkRedirect(
  source: Source,
  video: string,
  fetcher: typeof fetch = fetch,
) {
  const url = sourceUrl(source, video);
  let r: Response;
  try {
    r = await fetcher(url, {
      redirect: "manual",
      credentials: "omit",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("连不上解析服务，请检查网络");
  }
  if (r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400))
    return { url, title: "在线解析链接（长期有效）" };
  const body = r.headers.get("Content-Type")?.startsWith("text/plain")
    ? (await r.text().catch(() => "")).trim().slice(0, 200)
    : "";
  throw new Error(body || `解析服务返回 HTTP ${r.status}`);
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
const BILI_API = "https://api.bilibili.com/x/player";
// Malformed ID, not found, or made invisible by the uploader.
const MISSING = [-400, -404, 62002, 62004, 62012];
// Requests come from the user's own browser and IP, which Bilibili does not ban like datacenter IPs.
export async function resolveLocal(
  source: Source,
  input: string,
  fetcher: typeof fetch = fetch,
) {
  async function json(path: string, params: Record<string, string>) {
    const r = await fetcher(
      `${BILI_API}/${path}?${new URLSearchParams(params)}`,
      {
        credentials: "include",
        signal: AbortSignal.timeout(15000),
      },
    );
    let body: { code?: number; message?: string; data?: unknown };
    try {
      body = await r.json();
    } catch {
      throw new Error(`B 站接口返回 HTTP ${r.status}，请稍后重试`);
    }
    if (body.code === 0) return body.data;
    if (body.code === -412) throw new Error("请求被 B 站风控拦截，请稍后重试");
    if (MISSING.includes(body.code as number))
      throw new Error("视频不存在或不可见");
    throw new Error(`B 站接口返回 ${body.code}：${body.message || "未知错误"}`);
  }
  let video = normalizeVideo(input);
  if (new URL(video).hostname === "b23.tv") {
    // Only the final address matters; the video page itself may answer 412.
    const r = await fetcher(video, {
      method: "HEAD",
      credentials: "omit",
      signal: AbortSignal.timeout(15000),
    });
    video = normalizeVideo(r.url);
    if (new URL(video).hostname === "b23.tv")
      throw new Error("短链接展开失败，请使用完整 B 站视频链接");
  }
  const u = new URL(video);
  const id = u.pathname.match(/^\/video\/(BV[a-zA-Z0-9]{10}|av\d+)$/i)?.[1];
  if (!id) throw new Error("本地解析暂不支持番剧，请换用其他解析源");
  const aid = /^av/i.test(id) ? id.slice(2) : null;
  const p = Number(u.searchParams.get("p") || 1);
  const pages = (await json("pagelist", aid ? { aid } : { bvid: id })) as
    { cid?: number }[] | null;
  const cid = pages?.[p - 1]?.cid;
  if (!cid) throw new Error(`该视频没有第 ${p} 分 P`);
  const data = (await json("playurl", {
    ...(aid ? { avid: aid } : { bvid: id }),
    cid: String(cid),
    qn: "116",
    fnval: "1",
    platform: "html5",
    high_quality: "1",
  })) as {
    quality?: number;
    accept_quality?: number[];
    accept_description?: string[];
    durl?: { url?: unknown; backup_url?: unknown }[];
  } | null;
  const durl = data?.durl;
  if (!durl || durl.length !== 1) throw new Error("B 站没有返回单文件视频");
  const urls = [durl[0]!.url, ...[durl[0]!.backup_url ?? []].flat()]
    .filter((x): x is string => typeof x === "string")
    .map(httpUrl);
  // Prefer origin mirrors: PCDN nodes (mcdn, szbdyd) use odd ports and often fail outside mainland China.
  const mirror = urls.find((x) =>
    /^upos-[\w-]+\.(bilivideo\.com|akamaized\.net)$/.test(x.hostname),
  );
  const selected = mirror ?? urls[0];
  if (!selected) throw new Error("B 站没有返回可用的流地址");
  if (source.prefix) {
    if (!mirror) throw new Error("B 站只返回了 PCDN 节点，无法替换 CDN 域名");
    // The signature does not cover the host, so any upos mirror serves the same link.
    selected.host = source.prefix;
  }
  const label =
    data?.accept_description?.[
      data.accept_quality?.indexOf(data.quality ?? -1) ?? -1
    ] ?? "";
  return {
    url: selected.href,
    title: `${label.split(" ").pop() || "B 站"} 直链（2 小时内有效）`,
  };
}
