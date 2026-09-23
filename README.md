# Bili → VRC

一个 WXT + TypeScript 浏览器扩展，为 Chrome / Firefox 的**原生右键菜单**添加视频解析选项。

## 使用方式

- 右键 B 站视频链接 → **将此视频链接解析为 VRChat 播放器链接**。
- 在 B 站视频页面空白处右键 → **将当前视频解析为 VRChat 播放器链接**。
- **只有点选以上菜单项才运行。** 普通右键、浏览或播放不会触发解析。没有常驻 B 站 content script、不监听或拦截 contextmenu、不改变播放器；点击菜单成功后会临时显示 5 秒的复制提示。
- 默认源直接请求「糕」站公开接口，严格选出 **1440P FLV 流地址 (主節點)** 并复制；不会擅自选择原始节点或其他画质。
- 复制失败时提供插件结果页手动复制。插件图标可以重看最近结果、切换源和进入设置。

## 安装

需要 Node.js 22+（推荐 24）。

```sh
npm ci
npm run build
npm run build:firefox
```

### Chrome 120+

打开 `chrome://extensions`，启用开发者模式 → 加载已解压的扩展程序 → 选择本项目的 `.output/chrome-mv3`。

### Firefox 140+

打开 `about:debugging#/runtime/this-firefox` → 临时载入附加组件 → 选择 `.output/firefox-mv3/manifest.json`。临时加载在浏览器重启后失效。长期安装需通过 Mozilla 签名；生成的 ZIP 未签名，不能直接当作已签名 XPI 永久安装。

## 自定义解析源

设置中可新增、编辑、删除解析源并设为默认。内置：

- `https://vrcbilibili.糕.tw/?url=`：已按公开 API 适配，默认源。
- `https://biliplayer.91vrchat.com/player/?url=`：网页模式。开发时该站在当前网络被 Cloudflare 拦截，**未验证其实际结果结构**，必要时调整匹配词 / CSS 选择器。

前缀默认附加 `encodeURIComponent(videoUrl)`。支持 `https://example.com/?url={url}&other=1`；仅对明确需要不编码输入的网站使用 `{rawUrl}`。

三种模式：

1. **直接取主节点**：使用该域名 `/api/parse/video/<BV>`，返回 `{success:true,data:[{title,url,type}]}`。适合糕站和兼容 API 的镜像；不是对任意网站通用的 API。
2. **打开网页并提取**：打开前缀链接，最多等待 25 秒，按标题全部匹配词提取唯一地址。支持链接、输入框、data-clipboard-text、data-url 和复制按钮中静态 URL 字面量；不执行页面提供的代码。无法匹配、跨域跳转或验证时明确提示并保留网页。高级设置可填写结果容器 CSS 选择器及 URL 所在属性。仅支持顶层页面，iframe 内结果需手动处理。
3. **复制拼接链接**：网站明确支持 VRChat 播放器直接请求此前缀时使用。该模式只构造入口，不保证它是媒体流，不进行结果提取。

自定义源只在保存并授权时申请该站域名权限。未授权时不会访问 / 提取，会提示前往设置。

## 已知边界

- 原站 API 仅接受 BV ID，会忽略 `p`。插件对 `p > 1` 明确报错，避免把 P2 解析成 P1；网页和前缀模式保留 `p` 参数，但效果取决于解析源。
- 短链接通过所选兼容站的 shortlink API 展开；AV / 番剧链接需使用支持它们的自定义源，或在 B 站获取 BV 链接。
- 1440P FLV 是解析站提供的标签，返回 URL 可能以 `.mp4` 结尾，不能以扩展名判断是否匹配；实际分辨率、可播性和 VRChat 世界限制由上游决定。
- 不静默切换解析源，避免把链接发送给未选择的服务。失败后可在结果页选其他源重试。
- 完整签名参数原样保存 / 复制；流地址可能过期，届时重新解析。

## 权限与数据

- `contextMenus`：创建原生菜单项。
- `activeTab`、`scripting`：用户点选菜单后临时复制并提示；或提取用户所选解析网页。
- `clipboardWrite`：只写入解析结果，不读取剪贴板。
- `storage`：本地设置与解析记录；旧记录在下次解析时清理（24 小时前）。不做云同步。
- 默认仅访问糕站；自定义域名按需授权。`optional_host_permissions` 的通配模式只是允许用户添加任意源，并非默认读取所有站点。
- 不读取 B 站 Cookie、不自动扫描浏览记录。仅向当前选定的解析源发送主动选择的视频链接；网页模式会按浏览器正常规则访问所选站点。

## 开发与检查

```sh
npm run dev
npm run dev:firefox
npm run check
npm test
npm run zip
npm run zip:firefox
```

两个浏览器都构建为 Manifest V3：Chrome service worker、Firefox background scripts 由 WXT 生成。测试覆盖链接规范化、分 P、短链、节点精确选择、失败返回、动态 DOM 提取、菜单主动触发和消息来源校验。

官方参考：[WXT 多浏览器构建](https://wxt.dev/guide/essentials/target-different-browsers)、[scripting.executeScript](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/executeScript)。
