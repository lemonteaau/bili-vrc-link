// Vercel function: GET /?url=<B 站视频链接> (or /BV….mp4?p=2) 302-redirects to a fresh MP4 link.
// Every VRChat client requests it when loading, so the shared link never expires.
// Hosted on Vercel, not Cloudflare Workers: Bilibili bans Workers egress IPs with HTTP 412.
import { defaults, normalizeVideo, resolveLocal } from "../lib/core.js";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com/",
};
const local = defaults.sources.find((s) => s.mode === "local")!;
const cache = new Map<string, { url: string; expires: number }>();
const fetcher: typeof fetch = (input, init) =>
  fetch(input, {
    method: init?.method,
    signal: init?.signal,
    headers: HEADERS,
  });
const text = (status: number, body: string) =>
  new Response(body + "\n", {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
function target(u: URL): string {
  // Take ?url=, or else everything after the slash: /BV号, /av号.mp4, /https://www.bilibili.com/video/…
  const raw =
    u.searchParams.get("url") ??
    decodeURIComponent(u.pathname.slice(1))
      // Proxies may squeeze "https://" in a path down to "https:/".
      .replace(/^(https?:)\/(?!\/)/i, "$1//");
  // Accept app share text like "【标题】 https://b23.tv/xxx", a full link, or a bare BV / av ID.
  const link =
    raw.match(/https?:\/\/[^\s"'<>【】]+/i)?.[0] ??
    raw
      .match(/(?:[\w-]+\.)*(?:bilibili\.com|b23\.tv)\/[^\s"'<>【】]+/i)?.[0]
      ?.replace(/^/, "https://");
  const id = raw.match(
    /(?<![a-z0-9])(BV[a-zA-Z0-9]{10}|av\d+)(?![a-z0-9])/i,
  )?.[1];
  const video = new URL(
    normalizeVideo(link ?? `https://www.bilibili.com/video/${id ?? raw}`),
  );
  // A top-level ?p= wins, for links pasted without encoding the nested URL.
  const p = u.searchParams.get("p");
  if (p) video.searchParams.set("p", p);
  return normalizeVideo(video.href);
}
export async function GET(request: Request): Promise<Response> {
  const u = new URL(request.url);
  if (u.pathname === "/" && !u.searchParams.has("url"))
    return text(
      200,
      "柠檬茶在线解析：在 / 后面直接接 BV 号或 B 站视频链接（也可以用 ?url=），播放时实时跳转到 B 站 MP4 直链。",
    );
  let video: string;
  try {
    video = target(u);
  } catch {
    return text(400, "没认出 B 站视频：请在 / 后面接 BV 号或 B 站视频链接");
  }
  try {
    const hit = cache.get(video);
    const url =
      hit && hit.expires > Date.now()
        ? hit.url
        : (await resolveLocal(local, video, fetcher)).url;
    // Links carry a ~2 h deadline that also applies to range requests mid-playback,
    // so share one across viewers only briefly; enough for a whole instance loading at once.
    const deadline = Number(new URL(url).searchParams.get("deadline")) * 1000;
    const ttl = Math.min(5 * 60e3, deadline - Date.now() - 100 * 60e3);
    if (!hit && ttl > 0) {
      if (cache.size > 500) cache.clear();
      cache.set(video, { url, expires: Date.now() + ttl });
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // Let the CDN answer repeats for 5 minutes without invoking the function.
        "Cache-Control": "public, max-age=0, s-maxage=300",
        // The CDN rejects a non-Bilibili Referer, so never forward ours.
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return text(502, e instanceof Error ? e.message : "解析失败，请稍后重试");
  }
}
export const HEAD = GET;
