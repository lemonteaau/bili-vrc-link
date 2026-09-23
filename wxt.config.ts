import { defineConfig } from "wxt";
export default defineConfig({
  manifestVersion: 3,
  vite: () => ({ build: { target: ["chrome120", "firefox140"] } }),
  manifest: ({ browser }) => ({
    name: "Bili → VRC",
    ...(browser === "chrome" ? { minimum_chrome_version: "120" } : {}),
    description:
      "点选右键菜单解析 B 站视频，复制 1440P FLV 主节点；支持自定义解析源。",
    permissions: [
      "contextMenus",
      "storage",
      "activeTab",
      "scripting",
      "clipboardWrite",
    ],
    host_permissions: ["https://vrcbilibili.xn--o8z.tw/*"],
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
