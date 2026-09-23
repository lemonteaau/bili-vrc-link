import { browser } from "wxt/browser";
import { defaults, type Settings, type Source } from "./core";
export type Job = {
  id: string;
  input: string;
  source: Source;
  state: "pending" | "ready" | "error";
  started: number;
  url?: string;
  title?: string;
  error?: string;
  copied?: boolean;
};
export async function settings(): Promise<Settings> {
  return (
    ((await browser.storage.local.get("settings")).settings as
      Settings | undefined) ?? structuredClone(defaults)
  );
}
export async function saveJob(job: Job) {
  await browser.storage.local.set({ [`job:${job.id}`]: job });
}
export async function getJob(id: string): Promise<Job | undefined> {
  return (await browser.storage.local.get(`job:${id}`))[`job:${id}`] as
    Job | undefined;
}
export async function startJob(job: Job) {
  const all = await browser.storage.local.get(null);
  const stale = Object.keys(all).filter(
    (k) =>
      k.startsWith("job:") &&
      Date.now() - ((all[k] as Job | undefined)?.started || 0) > 86400000,
  );
  if (stale.length) await browser.storage.local.remove(stale);
  await browser.storage.local.set({ latest: job.id, [`job:${job.id}`]: job });
}
