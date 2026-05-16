require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { WebhookClient } = require('discord.js');
const axios = require('axios');

// Bot & webhook
const telegramBot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Consts
const API_BASE = `http://localhost:${process.env.WEB_PORT || 3000}/api`;
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

// Events
telegramBot.on('message', async (msg) => {
    if (!msg.from) return;
    const userId = msg.from.id.toString();

    try {
        const configResponse = await axios.get(`${API_BASE}/config`);
        const { webhooks, users, settings } = configResponse.data;

        const available = [...new Set([
            ...(users.all?.length ? users.all : Object.keys(webhooks)),
            ...(users[userId] || [])
        ])];

        if (!available.length) return console.info("[BOT][ℹ️] No available webhooks");

        let payload = null;
        let detectedType = null;

        // Пряма перевірка за глобальними налаштуваннями settings
        if (msg.photo && settings.MESSAGE_PHOTO) {
            const media = await getTelegramMediaUrl(msg);
            if (media.ok) { payload = { files: [{ attachment: media.url }] }; detectedType = 'MESSAGE_PHOTO'; }
        } else if (msg.video && settings.MESSAGE_VIDEO) {
            const media = await getTelegramMediaUrl(msg);
            if (media.ok) { payload = { files: [{ attachment: media.url }] }; detectedType = 'MESSAGE_VIDEO'; }
        } else if (msg.document && settings.MESSAGE_GIF) {
            const media = await getTelegramMediaUrl(msg);
            if (media.ok) { payload = { files: [{ attachment: media.url }] }; detectedType = 'MESSAGE_GIF'; }
        } else if (msg.video_note && settings.MESSAGE_VIDEO_NOTE) {
            const media = await getTelegramMediaUrl(msg);
            if (media.ok) { payload = { files: [{ attachment: media.url }] }; detectedType = 'MESSAGE_VIDEO_NOTE'; }
        } else if (msg.text) {
            if (msg.text.includes('tiktok.com') && settings.TIKTOK) {
                const files = await downloadTikTokVideo(msg.text);
                if (files) { payload = { files }; detectedType = 'TIKTOK'; }
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

            if (!webhookUrl) return telegramBot.sendMessage(msg.chat.id, '[BOT][❌] Webhook URL not found');
            
            await sendToDiscord(webhookUrl, payload, options);
            return telegramBot.sendMessage(msg.chat.id, '✅');
        }

        const webhooksDataResponse = await axios.get(`${API_BASE}/webhooks`);
        const webhooksDetails = webhooksDataResponse.data;

        const buttons = available.map(k => {
            const found = webhooksDetails.find(w => w.key === k);
            return [{ text: found?.name || k, callback_data: `send:${k}` }];
        });

        pendingMessages.set(msg.chat.id, { payload, options, detectedType });
        telegramBot.sendMessage(msg.chat.id, TEXT_FOR_WHERE_SEND, { reply_markup: { inline_keyboard: buttons } });

    } catch (err) {
        console.error("[BOT][❌] error while processing message:", err.message);
    }
});

telegramBot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const [action, key] = query.data.split(':');
    const pending = pendingMessages.get(chatId);

    if (action === 'send' && pending) {
        try {
            const configResponse = await axios.get(`${API_BASE}/config`);
            const webhookUrl = configResponse.data.webhooks[key];

            if (!webhookUrl) {
                await telegramBot.sendMessage(chatId, "❌");
                console.error(`[BOT][❌] Webhook ${key} not found`);
                return telegramBot.answerCallbackQuery(query.id);
            }

            // Ініціалізація WebhookClient та відправка відбувається прямо всередині функції
            await sendToDiscord(webhookUrl, pending.payload, pending.options);
            
            await telegramBot.editMessageText(`✅`, { chat_id: chatId, message_id: query.message.message_id });
            pendingMessages.delete(chatId);
        } catch (e) {
            console.error("[BOT][❌] error while sending via button:", e.message);
            await telegramBot.sendMessage(chatId, "❌");
        }
    }
    telegramBot.answerCallbackQuery(query.id);
});

// TikTok download function
async function downloadTikTokVideo(url) {
    const response = await axios.post(process.env.COBALT_LOCAL_URL, { localProcessing: "preferred", url: url }, {headers: { "Accept": "application/json", "Content-Type": "application/json" }});
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
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;
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
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
}