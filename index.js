require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { WebhookClient } = require('discord.js');
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

//connect to DB
const db = new Database(path.join('/app/data', 'data.db'));
let TELEGRAM_TOKEN = null;

try {
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='global_settings'").get();
    if (tableCheck) {
        const globalSettings = db.prepare('SELECT bot_token FROM global_settings WHERE id = 1').get();
        TELEGRAM_TOKEN = globalSettings?.bot_token;
    }
} catch (err) {
    console.error(`[BOT][❌] Error reading database: ${err.message}`);
}

if (!TELEGRAM_TOKEN) {
    console.log('\n======================================================');
    console.log('[BOT][⚠️] BOT TOKEN NOT FOUND!');
    console.log('[BOT][ℹ️] PLEASE SET YOUR TELEGRAM BOT TOKEN IN THE WEB INTERFACE TO START THE BOT');
    console.log('======================================================\n');
    return; 
}

console.log('[BOT][✅] BOT TOKEN FOUND');
const telegramBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Consts
const API_BASE = `http://localhost:${process.env.WEB_PORT || 4000}/api`;
const MAX_FILE_SIZE_IN_BITE = 10000000;
const TEXT_FOR_FILE_SO_BIG = 'File so big';
const TEXT_FOR_NO_OPTIMAL_FILE = 'No optimal file';
const TEXT_FOR_WHERE_SEND = "Send to?:"
const pendingMessages = new Map();
let isReady = false;
let WEBHOOKS;

// Init webhooks
(async () => {
    isReady = true;
})();

// Add logging function
function logToDashboard({ msg, msgType, payload, webhookName, status, errorMsg = null }) {
    try {
        let preview = "";
        if (msgType === 'MESSAGE_TEXT') {
            preview = payload?.content || msg.text || "";
        } else if (msgType === 'TIKTOK') {
            preview = msg.text || "TikTok Link";
        } else {
            preview = `[${msgType.replace('MESSAGE_', '')} File]`;
        }

        const stmt = db.prepare(`
            INSERT INTO dashboard_logs (telegram_id, username, msg_type, payload_preview, webhook_name, status, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            msg.from.id.toString(),
            msg.from.username ? `@${msg.from.username}` : msg.from.first_name,
            msgType,
            preview,
            webhookName,
            status ? 1 : 0,
            errorMsg
        );
    } catch (e) {
        console.error("[LOG][❌] error add log to DB:", e.message);
    }
}

// Events
telegramBot.on('message', async (msg) => {
    if (!msg.from) return;
    const userId = msg.from.id.toString();

    let detectedType = null;
    let payload = null;

    try {
        const configResponse = await axios.get(`${API_BASE}/config`);
        const { webhooks, webhookNames, users, settings } = configResponse.data;

        let available = users[userId] || [];

        if (!available.length) {
            available = users['0'] || [];
        }

        available = [...new Set(available)];

        if (!available.length) return;

        if (msg.photo && settings.MESSAGE_PHOTO) {
            const media = await getTelegramMediaUrl(msg);
            if (media.ok) { payload = { files: [{ attachment: media.url }] }; detectedType = 'MESSAGE_PHOTO'; } else { return telegramBot.sendMessage(msg.chat.id, 'File too big ('); console.log('[BOT][❌] File too big'); }
        } else if (msg.video && settings.MESSAGE_VIDEO) {
            const media = await getTelegramMediaUrl(msg);
            if (media.ok) { payload = { files: [{ attachment: media.url }] }; detectedType = 'MESSAGE_VIDEO'; } else { return telegramBot.sendMessage(msg.chat.id, 'File too big ('); console.log('[BOT][❌] File too big'); } 
        } else if (msg.document && settings.MESSAGE_GIF) {
            const media = await getTelegramMediaUrl(msg);
            if (media.ok) { payload = { files: [{ attachment: media.url }] }; detectedType = 'MESSAGE_GIF'; } else { return telegramBot.sendMessage(msg.chat.id, 'File too big ('); console.log('[BOT][❌] File too big'); }
        } else if (msg.video_note && settings.MESSAGE_VIDEO_NOTE) {
            const media = await getTelegramMediaUrl(msg);
            if (media.ok) { payload = { files: [{ attachment: media.url }] }; detectedType = 'MESSAGE_VIDEO_NOTE'; } else { return telegramBot.sendMessage(msg.chat.id, 'File too big ('); console.log('[BOT][❌] File too big'); }
        } else if (msg.text) {
            if (msg.text.includes('tiktok.com') && settings.TIKTOK) {
                detectedType = 'TIKTOK';
                const files = await downloadVideoviaCobalt(msg.text);
                if (files) {
                    payload = { files };
                } else {
                    return telegramBot.sendMessage(msg.chat.id, '❌');
                }
            } else if (msg.text.includes('instagram.com') && settings.INSTAGRAM) {
                detectedType = 'INSTAGRAM';
                const files = await downloadVideoviaCobalt(msg.text);
                if (files) {
                    payload = { files };
                } else {
                    return telegramBot.sendMessage(msg.chat.id, '❌');
                }
            } else if (settings.MESSAGE_TEXT) {
                payload = { content: msg.text };
                detectedType = 'MESSAGE_TEXT';
            }
        }

        if (!payload) return;
        
        const options = { username: msg.from.first_name, avatarURL: await getUserPhotoUrl(msg.chat.id) };

        if (available.length === 1) {
            const targetKey = available[0];
            const webhookUrl = webhooks[targetKey];
            const currentWebhookName = webhookNames?.[targetKey] || targetKey;

            if (!webhookUrl) {
                logToDashboard({ msg, msgType: detectedType, payload, webhookName: currentWebhookName, status: false, errorMsg: 'Webhook URL not found' });
                return telegramBot.sendMessage(msg.chat.id, '[BOT][❌] Webhook URL not found');
            }
            
            try {
                await sendToDiscord(webhookUrl, payload, options);
                logToDashboard({ msg, msgType: detectedType, payload, webhookName: currentWebhookName, status: true });
                return telegramBot.sendMessage(msg.chat.id, '✅');
            } catch (err) {
                logToDashboard({ msg, msgType: detectedType, payload, webhookName: currentWebhookName, status: false, errorMsg: err.message });
                return telegramBot.sendMessage(msg.chat.id, '❌');
            }
        }

        const buttons = available.map(k => {
            const name = webhookNames?.[k] || k;
            return [{ text: name, callback_data: `send:${k}` }];
        });

        const sentMessage = await telegramBot.sendMessage(msg.chat.id, TEXT_FOR_WHERE_SEND, { 
            reply_markup: { inline_keyboard: buttons },
            reply_to_message_id: msg.message_id
        });

        pendingMessages.set(`${msg.chat.id}:${sentMessage.message_id}`, { payload, options, detectedType, originalMsg: msg });

    } catch (err) {
        console.error("[BOT][❌] error while processing message:", err.message);
        await telegramBot.sendMessage(msg.chat.id, '❌');
        logToDashboard({ msg, msgType: detectedType, payload, webhookName: 'null', status: false, errorMsg: err.message });
    }
});

telegramBot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const [action, key] = query.data.split(':');
    
    const pendingKey = `${chatId}:${messageId}`;
    const pending = pendingMessages.get(pendingKey);

    if (action === 'send') {
        if (!pending) {
            console.log(`[BOT][❌] No pending message found for callback query with key ${pendingKey}`);
            await telegramBot.editMessageText(`❌`, { chat_id: chatId, message_id: messageId });
            return telegramBot.answerCallbackQuery(query.id);
        }

        let configResponse, webhookUrl, currentWebhookName;
        try {
            configResponse = await axios.get(`${API_BASE}/config`);
            webhookUrl = configResponse.data.webhooks[key];
            currentWebhookName = configResponse.data.webhookNames?.[key] || key;
        } catch (cfgErr) {
            console.error(cfgErr);
        }

        if (!webhookUrl) {
            await telegramBot.sendMessage(chatId, "❌");
            logToDashboard({ msg: pending.originalMsg, msgType: pending.detectedType, payload: pending.payload, webhookName: key, status: false, errorMsg: 'Webhook not found during callback' });
            return telegramBot.answerCallbackQuery(query.id);
        }

        try {
            await sendToDiscord(webhookUrl, pending.payload, pending.options);
            await telegramBot.editMessageText(`✅`, { chat_id: chatId, message_id: messageId });
            
            logToDashboard({ msg: pending.originalMsg, msgType: pending.detectedType, payload: pending.payload, webhookName: currentWebhookName, status: true });
            pendingMessages.delete(pendingKey);
        } catch (e) {
            console.error("[BOT][❌] error while sending via button:", e.message);
            await telegramBot.sendMessage(chatId, "❌");
            
            logToDashboard({ msg: pending.originalMsg, msgType: pending.detectedType, payload: pending.payload, webhookName: currentWebhookName, status: false, errorMsg: e.message });
        }
    }
    telegramBot.answerCallbackQuery(query.id);
});

// Cobalt function
async function downloadVideoviaCobalt(url) {
    let cobaltUrl = process.env.COBALT_LOCAL_URL;
    
    try {
        const row = db.prepare('SELECT cobalt_url FROM global_settings WHERE id = 1').get();
        if (row?.cobalt_url) cobaltUrl = row.cobalt_url.trim();
    } catch (e) {
        console.error(e);
    }

    if (!cobaltUrl) return null;

    const response = await axios.post(cobaltUrl, { localProcessing: "preferred", url: url }, {headers: { "Accept": "application/json", "Content-Type": "application/json" }});
    const data = response.data;
    if (!["redirect", "tunnel", "picker"].includes(data.status)) return null;
    if (data.status === "redirect" || data.status === "tunnel") {
        try {
            const videoBuffer = await downloadAsBuffer(data.url);
            return [{ attachment: videoBuffer, name: data.filename || 'video.mp4' }];
        } catch (e) { console.error("[COBALT][❌] error download video to buffer:", e.message); return null; }
    } else if (data.status === "picker") {
        const files = [];
        if (data.audio) {
            files.push({ 
                attachment: data.audio,
                name: 'music_from_video.mp3'
            });
        }
        if (Array.isArray(data.picker)) {
            data.picker.filter(item => item.type === 'photo').forEach((item, index) => {
                files.push({
                    attachment: item.url,
                    name: `photo_${Date.now()}_${index}.jpeg`
                });
            });
        }   
        return files.length > 0 ? files : null;
    }
    return null;
}

async function sendToDiscord(webhookUrl, payload, options) {
    try {
        const client = new WebhookClient({ url: webhookUrl });
        await client.send({ ...payload, ...options });
    } catch (err) {
        console.error(`❌ error discord SDK:`, err.message);
        throw err;
    }
}

// Functions
async function getUserPhotoUrl(userId) {
    const senderPick = await telegramBot.getUserProfilePhotos(userId);
    if(senderPick.total_count == 0) return null;
    let senderLastPick = senderPick.photos[senderPick.photos.length - 1]
    senderLastPick = senderLastPick[senderLastPick.length - 2]
    const senderLastPickUrl = await getTelegramFileUrl(senderLastPick.file_id)
    return senderLastPickUrl.fileUrl
}

async function getTelegramFileUrl(fileId) {
    const file = await telegramBot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
    const fileSize = file.file_size;
    return { fileUrl, fileSize };
}

async function getTelegramMediaUrl(msg) {
    const media = msg.video || msg.video_note || msg.document || (msg.photo ? getBestMedia(msg.photo) : null);
    if (!media) return { ok: false, msg: TEXT_FOR_NO_OPTIMAL_FILE }; 
    if (media.file_size && !canSendTelegramMedia(media.file_size)) return { ok: false, msg: TEXT_FOR_FILE_SO_BIG };
    const url = await getTelegramFileUrl(media.file_id);
    return { ok: true, url: url.fileUrl };
}

function canSendTelegramMedia(_bite){
    return MAX_FILE_SIZE_IN_BITE > _bite;
}

function getBestMedia(Array) {
    return Array
        .filter(p => p.file_size <= MAX_FILE_SIZE_IN_BITE)
        .sort((a, b) => b.file_size - a.file_size)[0]; 
}

async function downloadAsBuffer(url) {
    if (!url.includes('umbrel.local')) {
        const response = await axios.get(url, {
            responseType: 'arraybuffer'
        });
        return Buffer.from(response.data);
    }

    let cobaltUrl = process.env.COBALT_LOCAL_URL;
    
    try {
        const row = db.prepare('SELECT cobalt_url FROM global_settings WHERE id = 1').get();
        if (row?.cobalt_url) cobaltUrl = row.cobalt_url.trim();
    } catch (e) {}

    const targetUrl = new URL(url);
    const cobaltBase = new URL(cobaltUrl);

    const response = await axios.get(`${cobaltBase.origin}${targetUrl.pathname}${targetUrl.search}`, {
        responseType: 'arraybuffer',
        headers: { 'Host': cobaltBase.hostname }
    });

    return Buffer.from(response.data);
}