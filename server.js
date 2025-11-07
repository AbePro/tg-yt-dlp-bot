// server.js
const express = require("express");
const helmet = require("helmet");
const { Telegraf } = require("telegraf");

const {
    BOT_TOKEN,                 // from @BotFather
    WEBHOOK_SECRET_PATH,       // any random string, e.g. 'tgwh_123abc'
    TG_SECRET_TOKEN,           // any random string for Telegram's header verification
    WEBHOOK_URL,               // e.g. https://<your-render-url>.onrender.com/webhook/tgwh_123abc
    PORT
} = process.env;

if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
if (!WEBHOOK_SECRET_PATH) throw new Error("Missing WEBHOOK_SECRET_PATH");
if (!TG_SECRET_TOKEN) throw new Error("Missing TG_SECRET_TOKEN");
if (!WEBHOOK_URL) throw new Error("Missing WEBHOOK_URL");

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// 1) Init bot
const bot = new Telegraf(BOT_TOKEN);

// 2) Bot behavior: reply “It works” to any text
bot.on("message", async (ctx) => {
    await ctx.reply("It works");
});

// 3) Mount webhook callback with secret token check
const webhookPath = `/webhook/${WEBHOOK_SECRET_PATH}`;
app.use(webhookPath, (req, res, next) => {
    // Verify Telegram header matches our secret (production hardening)
    const header = req.get("X-Telegram-Bot-Api-Secret-Token");
    if (header !== TG_SECRET_TOKEN) return res.sendStatus(401);
    return next();
}, bot.webhookCallback(webhookPath, { secretToken: TG_SECRET_TOKEN }));

// health + simple GET
app.get("/health", (_req, res) => res.status(200).send("OK"));
app.get("/", (_req, res) => res.status(200).send("It works"));

// 4) Helper to set Telegram webhook from code (optional route)
app.get("/set-webhook", async (_req, res) => {
    try {
        await bot.telegram.setWebhook(WEBHOOK_URL, { secret_token: TG_SECRET_TOKEN });
        res.status(200).send("Webhook set");
    } catch (e) {
        console.error(e);
        res.status(500).send("Failed to set webhook");
    }
});

const listenPort = PORT || 3000;
app.listen(listenPort, async () => {
    console.log(`HTTP server listening on :${listenPort}`);
    // Optional: try to set the webhook at startup as well.
    try {
        await bot.telegram.setWebhook(WEBHOOK_URL, { secret_token: TG_SECRET_TOKEN });
        console.log("Telegram webhook set OK");
    } catch (e) {
        console.error("Failed to set webhook at startup:", e?.response?.data || e.message);
    }
});
