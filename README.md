# Bili → VRC

Chrome / Firefox 扩展：通过右键菜单解析 B 站视频，获取 VRChat 播放器链接。默认提取 **1440P FLV 主节点**。

## 使用

- 右键 B 站视频链接，或视频页空白处，选择对应的解析菜单项。
- Bili-Gate 首页：按住 Option（Mac）或 Alt（Windows / Linux）再右键视频封面。
- 默认使用 VRCBilibili；在扩展设置中可更换或添加解析源，例如 `https://biliplayer.91vrchat.com/player/?url=`。

只在选择菜单项后解析；普通右键不会触发。

## 安装 / 开发

从 [GitHub Releases](https://github.com/lemonteaau/bili-vrc-link/releases) 下载，解压后在浏览器扩展管理页加载。Firefox 永久安装需要 Mozilla 签名。

```sh
npm ci
npm run dev           # Chrome
npm run dev:firefox   # Firefox
npm run check && npm test
```

## 许可证

[MIT](LICENSE)
