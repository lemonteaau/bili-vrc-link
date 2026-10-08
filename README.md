# Bili → VRC

Chrome / Firefox 扩展：通过右键菜单解析 B 站视频，获取 VRChat 播放器链接。默认在浏览器本地请求 B 站接口，复制音画合一的 MP4 直链；也可换用提供 1440P 的第三方解析源。

## 使用

- 右键 B 站视频链接，或视频页空白处，选择对应的解析菜单项。
- Bili-Gate 首页：按住 Option（Mac）或 Alt（Windows / Linux）再右键视频封面。
- 默认使用本地解析：不经过任何服务器，以你的 B 站登录状态请求接口（未登录为 720P）。链接约 2 小时后过期；登录后链接中带有你的 UID；不支持番剧。可在设置中把 CDN 域名换成其他 B 站节点。
- 在扩展设置中可更换或添加解析源，例如 `https://biliplayer.91vrchat.com/player/?url=`。
- VRChat 未将 B 站域名列入白名单：公开房间无法播放，其他房间需开启 Allow Untrusted URLs。

只在选择菜单项后解析；普通右键不会触发。

## 安装 / 开发

从 [GitHub Releases](https://github.com/lemonteaau/bili-vrc-link/releases) 下载，解压后在浏览器扩展管理页加载。Firefox 永久安装需要 Mozilla 签名。

```sh
pnpm install --frozen-lockfile
pnpm run dev           # Chrome
pnpm run dev:firefox   # Firefox
pnpm run check && pnpm test
```

## 许可证

[MIT](LICENSE)
