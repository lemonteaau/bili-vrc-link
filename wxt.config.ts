import { defineConfig } from "wxt";
export default defineConfig({
  manifestVersion: 3,
  vite: () => ({ build: { target: ["chrome120", "firefox140"] } }),
  manifest: ({ browser }) => ({
    name: "Bili → VRC",
    ...(browser === "chrome" ? { minimum_chrome_version: "120" } : {}),
    description:
      "在 B 站视频上点右键，复制可直接粘贴到 VRChat 视频播放器的链接。",
    permissions: [
      "contextMenus",
      "storage",
      "activeTab",
      "scripting",
      "clipboardWrite",
    ],
    host_permissions: [
      // The built-in redirect service (api/index.ts).
      "https://vrc.lemontea.xyz/*",
      "https://api.bilibili.com/*",
      // Expanding b23.tv short links lands on the video page.
      "https://b23.tv/*",
      "https://www.bilibili.com/*",
      "https://vrcbilibili.xn--o8z.tw/*",
    ],
    optional_host_permissions: ["https://*/*", "http://*/*"],
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "bili-vrc-link@local.extension",
              strict_min_version: "140.0",
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
});
