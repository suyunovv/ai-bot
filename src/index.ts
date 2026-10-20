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

// Tezkor javoblar (0 soniyada javob qaytarish uchun)
const quickReplies: Record<string, string> = {
  "salom": "Salom! Qalaysiz, yaxshimisiz? 😊",
  "assalomu alaykum": "Va alaykum assalom! Kuningiz xayrli o'tsin!",
  "qalaysan": "Rahmat, juda yaxshiman! O'zingizdan gapiring, tinchlikmi?",
  "qalay": "Zo'r, rahmat! O'zingiz yaxshimisiz?",
  "nima gap": "Tinchlik, shukur! Sizda qanday yangiliklar bor?",
  "yaxshiman": "Zo'r, doim shunday bo'lsin! Qanday rejalaringiz bor bugunga?",
  "rahmat": "Arzimaydi, doim xizmatingizdaman! 😊",
  "kim bu": "Men Parviz Jasurovich yaratgan AI yordamchisiman!",
};

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
    `Assalomu alaykum, ${name}! 👋\n\nMen siz bilan suhbatlashishga va anonim xabarlarni yetkazishga tayyorman!\n\n` +
    `💡 Anonim xabar yuborish:\n@username matn\n(Misol: @alisher Salom, bugun ko'rishamizmi?)\n\n` +
    `Menga xohlagan savolingizni berishingiz mumkin. Yuboruvchi kimligi mutlaqo sir saqlanadi! 🤫`
  );
});

// To'g'ridan-to'g'ri HTTP orqali eng tezkor AI so'rovi (kutishni keskin kamaytiradi)
async function getFastAIReply(userText: string): Promise<string> {
  if (!geminiApiKey) {
    return "Salom! Sizga qanday yordam bera olaman?";
  }

  const systemPrompt =
    "Sen samimiy, xushmuomala o'zbek do'stsan. Javobing juda qisqa (ko'pi bilan 1-2 gap) bo'lsin. Rasmiy gapirma. " +
    "MUHIM: Agar 'seni kim yaratgan?' deb so'rashsa: 'Meni Suyunov Parviz Jasurovich yaratgan!' deb javob ber.";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000); // 9 soniyadan oshib ketmasin

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nFoydalanuvchi: ${userText}` }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.7,
        },
      }),
    });

    clearTimeout(timeout);
    const data: any = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (reply) return reply;
  } catch {
    clearTimeout(timeout);
  }

  return "Tushundim sizni! Yana biror narsa haqida gaplashamizmi?";
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

  // 1. "Seni kim yaratgan?" savoliga ZUMDA (0 soniyada) javob:
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

  // 2. Keng tarqalgan so'zlarga bir zumda javob:
  if (quickReplies[lower]) {
    return ctx.reply(quickReplies[lower]);
  }

  // 3. typing holati bilan uzluksiz tezkor AI javob:
  const typingTimer = setInterval(() => {
    ctx.sendChatAction("typing").catch(() => {});
  }, 4000);
  ctx.sendChatAction("typing").catch(() => {});

  try {
    const reply = await getFastAIReply(text);
    clearInterval(typingTimer);
    await ctx.reply(reply);
  } catch {
    clearInterval(typingTimer);
    await ctx.reply("Eshitdim! Yana gapiring-chi.");
  }
});

// === Render.com 24/7 o'chib qolmasligi uchun HTTP Server ===
const PORT = process.env.PORT || 10000;
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot 24/7 is running successfully! 🚀\n");
});

server.listen(PORT, () => {
  console.log(`Render Web Service port ${PORT} da muvaffaqiyatli tinglamoqda ✅`);
});

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
