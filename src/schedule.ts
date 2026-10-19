import cron from "node-cron";
import { Telegraf } from "telegraf";
import type { Job } from "./jobs.js";

const tasks = new Map<string, cron.ScheduledTask>();

function timeToCron(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `0 ${minute} ${hour} * * *`;
}

export function startJob(chatId: string, time: string, bot: Telegraf): void {
  stopJob(chatId);
  const task = cron.schedule(timeToCron(time), () => {
    bot.telegram
      .sendMessage(chatId, "qanday yaxshimisan nima qilyapsan")
      .catch((err) => {
        console.error(`Failed to send scheduled message to ${chatId}:`, err);
      });
  }, { scheduled: true });
  tasks.set(chatId, task);
}

export function stopJob(chatId: string): void {
  const task = tasks.get(chatId);
  if (task) {
    task.stop();
    tasks.delete(chatId);
  }
}

export function stopAll(): void {
  for (const chatId of tasks.keys()) {
    stopJob(chatId);
  }
}

export function hasJob(chatId: string): boolean {
  return tasks.has(chatId);
}
