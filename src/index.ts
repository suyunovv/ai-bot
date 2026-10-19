import { Telegraf, type Context } from "telegraf";
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

// Har bir kelgan foydalanuvchini bazaga yozib boramiz
bot.use(async (ctx: Context, next: () => Promise<void>) => {
  if (ctx.from) {
    try {
      await registerUser({
        userId: ctx.from.id,
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        lastName: ctx.from.last_name ?? null,
      });
    } catch (e) {
      console.error("Foydalanuvchini saqlashda xatolik:", e);
    }
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

// Gemini AI orqali hayotiy, tabiiy javob olish
async function getAIReply(userText: string, userName: string): Promise<string> {
  if (!aiClient) {
    return "Salom! Yaxshimisiz, qanday yangiliklar bor?";
  }

  const systemInstruction =
    "Sen samimiy, xushmuomala, aqlli va tabiiy insondek gapiradigan o'zbek do'stsan. " +
    "Javoblaring qisqa, jonli, hayotiy va suhbatga qiziqish uyg'otadigan bo'lsin. " +
    "Quruq yoki rasmiy robotdek gapirma. O'zbek tilida so'zlashuv ohangida, kerak bo'lganda hazil va samimiyat bilan javob ber.";

  const modelsToTry = [
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-pro-latest"
  ];

  for (const model of modelsToTry) {
    try {
      const response = await aiClient.models.generateContent({
        model,
        contents: userText,
        config: {
          systemInstruction,
        },
      });

      const reply = response.text?.trim();
      if (reply) return reply;
    } catch (error) {
      console.warn(`Model ${model} vaqtincha band yoki xato, boshqasi tekshirilmoqda...`);
    }
  }

  return "Eshitdim sizni! Hozir biroz aloqa sekinroq, lekin men shu yerdaman. Davom etavering!";
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

  // Foydalanuvchini qidiramiz
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

    // Anonim xabar yuborish: kim yozgani mutlaqo bildirilmaydi!
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

  // Yozish holatini ko'rsatish
  await ctx.sendChatAction("typing");

  // Gemini AI orqali tirik, hayotiy javob
  const reply = await getAIReply(text, ctx.from?.first_name || "do'stim");
  await ctx.reply(reply);
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
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
