import { Telegraf, Markup } from "telegraf";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtempSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { promisify } from "node:util";
import express from "express";


const execFileAsync = promisify(execFile);

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) { console.error("Missing BOT_TOKEN env var"); process.exit(1); }

const bot = new Telegraf(BOT_TOKEN);

// ~2GB is Telegram hard limit; keep headroom
const MAX_TG_BYTES = 1900 * 1024 * 1024;

// store the last URL per chat while waiting for format choice
const pendingUrl = new Map();

/** Helper: small sleep between sends to avoid rate limits */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

bot.start((ctx) => ctx.reply(
    "Send me a URL (you must have rights). I’ll fetch it and return either MP4 (video) or MP3 (audio).\n" +
    "Playlists are supported — I’ll loop through all items (≤ ~2GB each)."
));

bot.on("text", async (ctx) => {
    const url = (ctx.message.text || "").trim();
    if (!/^https?:\/\//i.test(url)) {
        return ctx.reply("Please send a valid http/https URL.");
    }

    pendingUrl.set(ctx.chat.id, url);

    return ctx.reply(
        "Choose format:",
        Markup.inlineKeyboard([
            [Markup.button.callback("🎬 MP4 (video)", "CHOICE_MP4"),
            Markup.button.callback("🎵 MP3 (audio)", "CHOICE_MP3")]
        ])
    );
});

bot.action(["CHOICE_MP4", "CHOICE_MP3"], async (ctx) => {
    const url = pendingUrl.get(ctx.chat.id);
    if (!url) return ctx.answerCbQuery("No URL found. Send the link again.");

    const fmt = ctx.update.callback_query.data === "CHOICE_MP4" ? "mp4" : "mp3";
    await ctx.answerCbQuery(`Ok, ${fmt.toUpperCase()}.`);
    pendingUrl.delete(ctx.chat.id);

    const workDir = mkdtempSync(join(tmpdir(), "ytdlp-"));
    const outTemplate = join(workDir, "%(title)s.%(ext)s"); // handle playlists (multiple files)
    const statusMsg = await ctx.reply(`Working… (${fmt.toUpperCase()})`);

    try {
        // Build yt-dlp args
        let args;
        if (fmt === "mp4") {
            // Windows-friendly: mp4 + AAC
            args = [
                "-S", "ext:mp4",
                "--recode-video", "mp4",
                "--merge-output-format", "mp4",
                "-o", outTemplate,
                url
            ];
        } else {
            // Extract audio as MP3
            args = [
                "-x", "--audio-format", "mp3", "--audio-quality", "0",
                "-o", outTemplate,
                url
            ];
        }

        // Hint: no --no-playlist => full playlist is processed automatically
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, "Downloading & converting…");
        await execFileAsync("yt-dlp", args, { timeout: 1000 * 60 * 60 }); // up to 60m for big playlists

        // Collect produced files
        const exts = fmt === "mp4" ? new Set([".mp4"]) : new Set([".mp3"]);
        let files = readdirSync(workDir)
            .filter(f => exts.has(extname(f).toLowerCase()))
            .map(f => ({ name: f, full: join(workDir, f), mtime: statSync(join(workDir, f)).mtimeMs }));

        if (files.length === 0) {
            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined,
                "No output files created. (Site may block downloads, be DRM/paywalled, or invalid URL.)"
            );
            return;
        }

        // Sort by time (nice for playlists)
        files.sort((a, b) => a.mtime - b.mtime);

        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined,
            `Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`
        );

        // Loop through playlist items and send each
        let sent = 0, skipped = 0;
        for (const f of files) {
            const size = statSync(f.full).size;
            if (size > MAX_TG_BYTES) {
                skipped++;
                await ctx.reply(
                    `Skipping “${f.name}” — larger than Telegram’s ~2GB limit.`
                );
                continue;
            }
            try {
                if (fmt === "mp4") {
                    await ctx.replyWithVideo({ source: createReadStream(f.full) }, { caption: f.name });
                } else {
                    // MP3 — use audio so it shows as playable track
                    await ctx.replyWithAudio({ source: createReadStream(f.full) }, { caption: f.name });
                }
                sent++;
                await sleep(1500); // gentle pacing to avoid flood limits
            } catch (sendErr) {
                console.error("Send failed:", sendErr);
                await ctx.reply(`Failed to send “${f.name}”.`);
            }
        }

        await ctx.reply(`Done. Sent: ${sent}${skipped ? `, skipped oversized: ${skipped}` : ""}.`);

    } catch (err) {
        console.error(err);
        await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsg.message_id, undefined,
            "Failed to download/convert. Ensure the site allows it and it’s not DRM/paywalled."
        );
    } finally {
        try { rmSync(workDir, { recursive: true, force: true }); } catch { }
    }
});

bot.launch();
console.log("Bot running (long polling) …");

// Minimal web server so Render Free "web service" stays happy
const app = express();
app.get("/", (_req, res) => res.status(200).send("tg-yt-dlp-bot is running"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("HTTP server listening on", PORT));