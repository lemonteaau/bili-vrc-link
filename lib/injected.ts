// These functions are serialized by scripting.executeScript; keep them self-contained.
export async function copyInPage(
  text: string,
  message: string,
): Promise<boolean> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    const previous = document.activeElement as HTMLElement | null;
    const field = document.createElement("textarea");
    field.value = text;
    field.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.documentElement.append(field);
    field.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      /* manual copy remains available */
    }
    field.remove();
    previous?.focus({ preventScroll: true });
  }
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:24px;top:24px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });
  const note = document.createElement("div");
  note.style.cssText =
    "background:#162d29;color:#e1f6ed;padding:16px 22px;border-radius:12px;font:14px/1.6 sans-serif;box-shadow:0 8px 35px #0004;max-width:360px;";
  note.textContent = copied
    ? `Bili → VRC · ${message}`
    : "Bili → VRC · 已解析，请在插件中点击复制";
  note.setAttribute("role", "status");
  shadow.append(note);
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 5000);
  return copied;
}
export function extractFromPage(
  keywords: string,
  selector: string,
  attribute: string,
  timeout = 25000,
): Promise<{ url?: string; error?: string }> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const fold = (s: string) =>
      s.toLowerCase().replaceAll("節", "节").replaceAll("點", "点");
    const matches = (s: string) =>
      keywords
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .every((k) => fold(s).includes(fold(k)));
    const urls = (root: Element): string[] => {
      const found = new Set<string>();
      const add = (s: string | null | undefined) => {
        if (!s) return;
        const value = s.trim();
        try {
          const u = new URL(value);
          if (
            ["http:", "https:"].includes(u.protocol) &&
            !u.username &&
            !u.password &&
            !/(^|\.)(bilibili\.com|b23\.tv)$/.test(u.hostname) &&
            u.href !== location.href
          )
            found.add(u.href);
        } catch {}
      };
      for (const el of [
        root,
        ...root.querySelectorAll(
          "a,input,textarea,button,[data-clipboard-text],[data-url],[onclick]",
        ),
      ]) {
        if (attribute) {
          add(el.getAttribute(attribute));
          continue;
        }
        add(el.getAttribute("data-clipboard-text"));
        add(el.getAttribute("data-url"));
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
          add(el.value);
        if (el instanceof HTMLAnchorElement) add(el.getAttribute("href"));
        // Read a literal URL only; never evaluate inline handlers or page JavaScript.
        for (const match of (el.getAttribute("onclick") || "").matchAll(
          /['"](https?:\/\/[^'"\s]+)['"]/g,
        ))
          add(match[1]);
      }
      // A complete standalone address can be presented as plain text.
      for (const el of [
        root,
        ...root.querySelectorAll(".result-url,code,pre"),
      ]) {
        const value = el.textContent?.trim();
        if (value && !value.includes("...") && !value.includes("…")) add(value);
      }
      return [...found];
    };
    const done = (result: { url?: string; error?: string }) => {
      clearTimeout(timer);
      observer.disconnect();
      resolve(result);
    };
    const scan = () => {
      try {
        let candidates: Element[];
        if (selector) candidates = [...document.querySelectorAll(selector)];
        else {
          const labels = [
            ...document.querySelectorAll(
              "h1,h2,h3,h4,h5,label,strong,.result-title,td,span,div",
            ),
          ].filter(
            (e) =>
              matches(e.textContent || "") &&
              ![...e.children].some((child) =>
                matches(child.textContent || ""),
              ),
          );
          candidates = labels.flatMap((e) => {
            let row: Element | null = e;
            for (
              let i = 0;
              i < 4 && row && row !== document.body;
              i++, row = row.parentElement
            ) {
              if (urls(row).length) return [row];
            }
            return [];
          });
        }
        const found = [...new Set(candidates.flatMap(urls))];
        if (found.length === 1) done({ url: found[0] });
        // Ambiguous matches keep waiting rather than silently selecting the wrong node.
      } catch {
        done({ error: "CSS 选择器无效，请在插件设置中修改" });
      }
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    timer = setTimeout(
      () =>
        done({
          error:
            "未找到唯一匹配的流地址。网页已保留，可手动复制，或在设置中调整匹配词 / CSS 选择器。",
        }),
      timeout,
    );
    scan();
  });
}
