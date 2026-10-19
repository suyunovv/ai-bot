import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const DATA_DIR = join(process.cwd(), "data");
const JOBS_FILE = join(DATA_DIR, "jobs.json");

export const PHRASE = "qanday yaxshimisan nima qilyapsan";

export const JobSchema = z.object({
  chatId: z.string(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  phrase: z.string().default(PHRASE),
  createdAt: z.string().datetime(),
});

export type Job = z.infer<typeof JobSchema>;

export type JobsMap = Record<string, Job>;

export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function loadJobs(): Promise<JobsMap> {
  try {
    await ensureDataDir();
    const raw = await readFile(JOBS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as JobsMap;
  } catch {
    return {};
  }
}

export async function saveJobs(jobs: JobsMap): Promise<void> {
  await ensureDataDir();
  await writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), "utf8");
}

export async function getJob(chatId: string): Promise<Job | null> {
  const jobs = await loadJobs();
  return jobs[chatId] ?? null;
}

export async function setJob(chatId: string, time: string): Promise<Job> {
  const jobs = await loadJobs();
  const job: Job = {
    chatId,
    time,
    phrase: PHRASE,
    createdAt: new Date().toISOString(),
  };
  jobs[chatId] = job;
  await saveJobs(jobs);
  return job;
}

export async function removeJob(chatId: string): Promise<boolean> {
  const jobs = await loadJobs();
  const existed = chatId in jobs;
  delete jobs[chatId];
  await saveJobs(jobs);
  return existed;
}
