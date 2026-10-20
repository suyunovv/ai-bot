import { Telegraf, type Context } from "telegraf";
import { createServer } from "http";
import { config } from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { registerUser, findUserByUsername } from "./users.js";

config();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Xatolik: BOT_TOKEN topilmadi! .env faylini tekshiring.");
  process.exit(1);
}

const bot = new Telegraf(token);

// Google Gemini AI sozlamasi
const geminiApiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (geminiApiKey) {
  aiClient = new GoogleGenAI({ apiKey: geminiApiKey });
}

// Bot ma'lumotlarini saqlash
let botInfo: { username?: string } = {};

// Tezkor javoblar keshi (tezlikni 0 soniya qilish uchun)
const quickReplies: Record<string, string> = {
  "salom": "Salom! Qalaysiz, kayfiyatlar yaxshimi? 😊",
  "assalomu alaykum": "Va alaykum assalom! Kuningiz xayrli o'tsin!",
  "qalaysan": "Rahmat, juda yaxshiman! O'zingizdan gapiring, tinchlikmi?",
  "qalay": "Zo'r, rahmat! O'zingiz yaxshimisiz?",
  "nima gap": "Tinchlik, shukur! Sizda qanday yangiliklar bor?",
  "yaxshiman": "Zo'r, doim shunday bo'lsin! Qanday rejalaringiz bor bugunga?",
  "rahmat": "Arzimaydi, doim xizmatingizdaman! 😊",
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
    `Assalomu alaykum, ${name}! 👋\n\nMen siz bilan samimiy suhbatlashishga va anonim xabarlarni yetkazishga tayyorman!\n\n` +
    `💡 Anonim xabar yuborish:\n@username matn\n(Misol: @alisher Salom, bugun ko'rishamizmi?)\n\n` +
    `Menga xohlagan savolingizni berishingiz yoki gaplashishingiz mumkin. Yuboruvchi kimligi mutlaqo sir saqlanadi! 🤫`
  );
});

// Gemini AI orqali tezkor va hayotiy javob olish
async function getAIReply(userText: string, userName: string): Promise<string> {
  if (!aiClient) {
    return "Salom! Yaxshimisiz, qanday yangiliklar bor?";
  }

  const systemInstruction =
    "Sen samimiy, xushmuomala, aqlli va tabiiy insondek gapiradigan o'zbek do'stsan. " +
    "Javoblaring juda qisqa (1-2 gap), jonli, hayotiy va suhbatdoshga mos bo'lsin. " +
    "Ortiqcha cho'zma, rasmiy gapirma. " +
    "MUHIM: Agar 'seni kim yaratgan?' deb so'rashsa: 'Meni Suyunov Parviz Jasurovich yaratgan!' deb ayt.";

  // Eng tezkor modellar ketma-ketligi
  const modelsToTry = [
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite"
  ];

  for (const model of modelsToTry) {
    try {
      const response = await aiClient.models.generateContent({
        model,
        contents: userText,
        config: {
          systemInstruction,
          maxOutputTokens: 100, // Tezlikni oshirish uchun qisqa va aniq
        },
      });

      const reply = response.text?.trim();
      if (reply) return reply;
    } catch {
      continue;
    }
  }

  return "Tushundim sizni! Hozir internet biroz sekinroq, yana bir bor yozingchi.";
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

  // Buyruqlarni o'tkazib yuboramiz
  if (text.startsWith("/")) return next();

  // @username bilan boshlansa - anonim xabar
  if (text.startsWith("@")) {
    return sendAnonymousMessage(ctx, text);
  }

  // 1. Yaratuvchi haqidagi savollarga darhol (0 soniyada) javob:
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

  // 2. Keng tarqalgan oddiy salom-aliklarga keshdan zumda (0 soniyada) javob:
  if (quickReplies[lower]) {
    return ctx.reply(quickReplies[lower]);
  }

  // 3. AI orqali qisqa, tezkor va jonli javob:
  ctx.sendChatAction("typing").catch(() => {});
  const reply = await getAIReply(text, ctx.from?.first_name || "do'stim");
  await ctx.reply(reply);
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
