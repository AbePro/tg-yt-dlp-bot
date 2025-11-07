// server.js
const express = require("express");
const helmet = require("helmet");
const { Telegraf } = require("telegraf");

const {
    BOT_TOKEN,                 // from @BotFather

} = process.env;

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// Health check (Render/uptime checks)
app.get("/health", (_req, res) => res.status(200).send("OK"));

// The endpoint we'll hit (later Telegram will POST here)
app.post("/webhook", (req, res) => {
    // For now, ignore the body—just prove the server works
    res.status(200).send("It works");
});

// Optional: simple GET to test from a browser
app.get("/", (_req, res) => res.status(200).send("It works"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`HTTP server listening on :${PORT}`);
});
