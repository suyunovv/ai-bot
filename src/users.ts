import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const DATA_DIR = join(process.cwd(), "data");
const USERS_FILE = join(DATA_DIR, "users.json");

export const UserSchema = z.object({
  userId: z.string(),
  username: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  registeredAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

export type UsersMap = Record<string, User>;

export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function loadUsers(): Promise<UsersMap> {
  try {
    await ensureDataDir();
    const raw = await readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as UsersMap;
  } catch {
    return {};
  }
}

export async function saveUsers(users: UsersMap): Promise<void> {
  await ensureDataDir();
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

export async function registerUser(user: {
  userId: string | number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}): Promise<User> {
  const users = await loadUsers();
  const userId = String(user.userId);
  const existing = users[userId];
  const now = new Date().toISOString();
  const u: User = existing
    ? {
        ...existing,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
      }
    : {
        userId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        registeredAt: now,
      };
  users[userId] = u;
  await saveUsers(users);
  return u;
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const users = await loadUsers();
  const target = username.toLowerCase();
  for (const u of Object.values(users)) {
    if (u.username && u.username.toLowerCase() === target) {
      return u;
    }
  }
  return null;
}

export async function listUsers(): Promise<User[]> {
  const users = await loadUsers();
  return Object.values(users);
}
