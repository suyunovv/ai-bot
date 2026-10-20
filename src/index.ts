import { Telegraf, type Context } from "telegraf";
import { createServer } from "http";
import { config } from "dotenv";
import { registerUser, findUserByUsername } from "./users.js";

config();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Xatolik: BOT_TOKEN topilmadi! .env faylini tekshiring.");
  process.exit(1);
}

const bot = new Telegraf(token);
const geminiApiKey = process.env.GEMINI_API_KEY;

let botInfo: { username?: string } = {};

// Har bir kelgan foydalanuvchini bazaga yozib boramiz
bot.use(async (ctx: Context, next: () => Promise<void>) => {
  if (ctx.from) {
    registerUser({
      userId: ctx.from.id,
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name ?? null,
      lastName: ctx.from.last_name ?? null,
    }).catch(() => {});
  }
  return next();
});

// /start buyrug'i
bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name || "do'stim";
  await ctx.reply(
    `Assalomu alaykum, ${name}! 👋\n\nMen siz bilan samimiy suhbatlashishga va anonim xabarlarni yetkazishga tayyorman!\n\n` +
    `💡 Anonim xabar yuborish:\n@username matn\n(Misol: @alisher Salom, bugun ko'rishamizmi?)\n\n` +
    `Menga xohlagan savolingizni berishingiz mumkin. Yuboruvchi kimligi mutlaqo sir saqlanadi! 🤫`
  );
});

// Barqaror va doimiy ishlaydigan modellar zaxirasi
const RELIABLE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash"
];

// Gemini AI orqali to'laqonli, chuqur va hayotiy javob olish
async function getAIReply(userText: string): Promise<string> {
  if (!geminiApiKey) {
    return "Salom! Sizga qanday yordam bera olaman?";
  }

  const systemPrompt =
    "Sen samimiy, xushmuomala, o'ta aqlli va hayotiy o'zbek do'stsan. " +
    "Savollarga zerikarli qisqa javob berma, xuddi qadrdon do'stdek samimiy, batafsil va qiziqarli tushuntir. " +
    "MUHIM: Agar 'seni kim yaratgan?' yoki yaratuvching haqida so'rashsa: 'Meni Suyunov Parviz Jasurovich yaratgan!' deb javob ber.";

  // Har bir modelni ketma-ket sinab ko'radi (biri band bo'lsa, ikkinchisi 100% javob beradi)
  for (const model of RELIABLE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\nFoydalanuvchi: ${userText}` }],
            },
          ],
        }),
      });

      const data: any = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (reply) return reply;
    } catch {
      continue;
    }
  }

  return "Salom! Kayfiyatlar yaxshimi, do'stim? Siz bilan gaplashib turganimdan xursandman. Yana nimalar haqida suhbatlashamiz?";
}

// === @username orqali anonim xabar yuborish ===
async function sendAnonymousMessage(ctx: Context, text: string): Promise<void> {
  const match = text.match(/^@([a-zA-Z0-9_]+)\s+([\s\S]+)/);

  if (!match) {
    await ctx.reply(
      "Xabarni yuborish uchun quyidagicha yozing:\n\n" +
      "@username Siz yubormoqchi bo'lgan xabar\n\n" +
      "Misol:\n@abdulloh Salom, bugun dars bormi?"
    );
    return;
  }

  const [, username, message] = match;
  const targetUsername = username.toLowerCase().trim();

  const targetUser = await findUserByUsername(targetUsername);

  if (!targetUser) {
    await ctx.reply(
      `Uzr, @${username} hali botimizga qo'shilmagan ko'rinadi.\n\n` +
      `💡 Telegram qoidasiga ko'ra, bot xabar yetkazishi uchun qabul qiluvchi kamida bitta marta botimizga kirgan bo'lishi kerak.`
    );
    return;
  }

  try {
    const botUserDisplay = botInfo.username ? `@${botInfo.username}` : "Bot";

    await ctx.telegram.sendMessage(
      targetUser.userId,
      `📩 Sizga anonim xabar keldi:\n\n"${message.trim()}"\n\n` +
      `🔒 Yuboruvchi maxfiy qolgan.\n🤖 Yetkazuvchi: ${botUserDisplay}`
    );

    await ctx.reply(`✅ Xabaringiz @${username} ga anonim tarzda muvaffaqiyatli yetkazildi!`);
  } catch (err) {
    console.error("Xabar yetkazishda xatolik:", err);
    await ctx.reply(`❌ Xabarni yetkazib bo'lmadi. Foydalanuvchi botni bloklagan bo'lishi mumkin.`);
  }
}

// === Matnli xabarlar handler ===
bot.on("text", async (ctx: Context, next: () => Promise<void>) => {
  const msg = ctx.message;
  if (!msg || !("text" in msg)) return next();

  const text = msg.text.trim();

  if (text.startsWith("/")) return next();

  if (text.startsWith("@")) {
    return sendAnonymousMessage(ctx, text);
  }

  // 1. "Seni kim yaratgan?" savoliga aniq va g'urur bilan javob:
  const lower = text.toLowerCase().replace(/[?!.,]/g, "").trim();
  if (
    lower.includes("kim yaratgan") ||
    lower.includes("yaratuvching") ||
    lower.includes("muallifing") ||
    lower.includes("kim qildi") ||
    lower.includes("kimning botisan") ||
    lower.includes("egasi kim")
  ) {
    return ctx.reply("Meni Suyunov Parviz Jasurovich yaratgan!");
  }

  // 2. Typing statusini ushlab turish:
  const typingTimer = setInterval(() => {
    ctx.sendChatAction("typing").catch(() => {});
  }, 3500);
  ctx.sendChatAction("typing").catch(() => {});

  try {
    const reply = await getAIReply(text);
    clearInterval(typingTimer);
    await ctx.reply(reply);
  } catch {
    clearInterval(typingTimer);
    await ctx.reply("Qiziq mavzu! Keling, davom etamiz, yana nima deb o'ylaysiz?");
  }
});

// === Render Web Service 24/7 port ===
const PORT = process.env.PORT || 10000;
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot 24/7 is running successfully! 🚀\n");
});

server.listen(PORT, () => {
  console.log(`Web Service port ${PORT} da muvaffaqiyatli tinglamoqda ✅`);
});

// === Avtomatik o'z-o'zini uyg'otish (Self-Ping Keep-Alive) ===
const SELF_URL = process.env.RENDER_EXTERNAL_URL || "https://ai-bot-1-ka8l.onrender.com";
setInterval(async () => {
  try {
    await fetch(SELF_URL);
  } catch {}
}, 2 * 60 * 1000);

// Botni ishga tushirish
bot.launch().then(async () => {
  try {
    const me = await bot.telegram.getMe();
    botInfo = me;
    console.log(`Bot muvaffaqiyatli ishga tushdi: @${me.username} ✅`);
  } catch {
    console.log("Bot ishga tushdi ✅");
  }
});

// To'xtatish signallari
process.once("SIGINT", () => {
  bot.stop("SIGINT");
  server.close();
});
process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  server.close();
});
