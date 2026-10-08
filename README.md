# Bili → VRC

一个 Chrome / Firefox 扩展：在 B 站视频上点右键，就能复制一条可以直接粘贴进 VRChat 视频播放器的链接。

## 怎么用

1. 在 B 站视频页或视频链接上点**右键**。
2. 选「复制这个视频 / 当前视频的 VRChat 播放链接」。
3. 到 VRChat 世界里的视频播放器，把链接**粘贴**进地址栏。

也可以点浏览器工具栏上的扩展图标，再点「复制当前视频的播放链接」。

- 用 Bili-Gate 首页的话，按住 Option（⌥，Mac）或 Alt（Windows / Linux）再右键视频封面，就能看到本扩展的菜单。
- VRChat 没有把 B 站列入网址白名单：公开房间（Public）通常无法播放；好友房或私人房间需要在 VRChat 设置里开启「Allow Untrusted URLs」。

## 解析方式

插件会按设置页里的顺序**从上到下**依次尝试，第一个成功的就会被复制；可以在设置页用 ↑ ↓ 调整顺序，也可以添加自己的解析源。默认顺序：

| 顺序 | 方式                                 | 说明                                                                                                                   |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1    | 柠檬茶在线解析（`vrc.lemontea.xyz`） | 复制一个长期有效的链接，房间里每个人播放时都会实时取最新的视频地址。                                                   |
| 2    | 本机直接获取                         | 不经过第三方，由浏览器直接向 B 站获取音画合一的 MP4。通常 720P，链接约 2 小时后失效；登录 B 站时链接里会带有你的 UID。 |
| 3    | 糕站 · 1440P                         | 第三方解析站，取 1440P FLV 主节点，仅支持第 1 个分 P。                                                                 |
| 4    | 91VRChat                             | 打开第三方解析网页并自动读取结果，需要先在设置里授权。                                                                 |

柠檬茶在线解析也可以手动拼接：在 `https://vrc.lemontea.xyz/` 后面直接接 BV 号或 B 站视频链接，例如 `https://vrc.lemontea.xyz/BV1z6hJ6vEZy`、`https://vrc.lemontea.xyz/https://www.bilibili.com/video/BV1z6hJ6vEZy/?p=2`。也可以写成 `?url=`，后面填链接或 App 分享出来的文字。目前不支持番剧。

## 安装 / 开发

从 [GitHub Releases](https://github.com/lemonteaau/bili-vrc-link/releases) 下载，解压后在浏览器的扩展管理页加载。Firefox 永久安装需要 Mozilla 签名。

```sh
pnpm install --frozen-lockfile
pnpm run dev           # Chrome
pnpm run dev:firefox   # Firefox
pnpm run check && pnpm test
pnpm run deploy:server # 手动部署柠檬茶在线解析到 Vercel
```

柠檬茶在线解析的代码在 [api/index.ts](api/index.ts)，和扩展共用 `lib/core.ts` 的解析逻辑，部署在 Vercel 香港区域，前面套 Cloudflare 代理，并按访客 IP 限速。推送到 `main` 且改动涉及 `api/`、`lib/` 或 Vercel 配置时会自动部署，其他分支和无关改动不部署。没有用 Cloudflare Workers 托管，因为 B 站会拒绝 Workers 出口 IP 的请求（HTTP 412）。

## 致谢

- [糕站 VRCBilibili](https://vrcbilibili.糕.tw/) 与 [91VRChat](https://biliplayer.91vrchat.com/)：内置的第三方解析源。
- [gizmo-ds/bilibili-real-url](https://github.com/gizmo-ds/bilibili-real-url)（屑站解析）：在线解析“每次请求实时 302 跳转”的做法参考了它。
- [mmyo456/BiliAnalysis](https://github.com/mmyo456/BiliAnalysis)：在本机直接获取 B 站直链、替换 CDN 域名的思路参考了它。

## 许可证

[MIT](LICENSE)
