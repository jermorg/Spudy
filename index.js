require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { WebhookClient } = require('discord.js');
const axios = require('axios');

// Bot & webhook
const telegramBot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const webhooksConfig = require('./webhooks_config.json');

// Consts
const MAX_FILE_SIZE_IN_BITE = 10000000;
const TEXT_FOR_FILE_SO_BIG = 'File so big';
const TEXT_FOR_NO_OPTIMAL_FILE = 'No optimal file';
const TEXT_FOR_WHERE_SEND = "Send to?:"
const pendingMessages = new Map();
let isReady = false;
let WEBHOOKS;

// Init webhooks
(async () => {
    WEBHOOKS = await initWebhooks();
    isReady = true;
})();

// Events
telegramBot.on('message', async (msg) => {
    if (!isReady) return;
    const userId = msg.from.id.toString();
    const available = [...new Set([
        ...(WEBHOOKS.users.all?.length ? WEBHOOKS.users.all : Object.keys(WEBHOOKS.data)),
        ...(WEBHOOKS.users[userId] || [])
    ])];
    if (!available.length) return;
    let payload = null;
    const is = (type) => process.env[type] === "true";
    if ((msg.photo && is('MESSAGE_PHOTO')) || (msg.video && is('MESSAGE_VIDEO')) || 
        (msg.document && is('MESSAGE_GIF')) || (msg.video_note && is('MESSAGE_VIDEO_NOTE'))) {
        const media = await getTelegramMediaUrl(msg);
        if (media.ok) payload = { files: [{ attachment: media.url }] };
    } else if (msg.text) {
        if (is('TIKTOK') && msg.text.includes('tiktok.com')) {
            const files = await downloadTikTokVideo(msg.text);
            if (files) payload = { files };
        } else if (is('MESSAGE_TEXT')) {
            payload = { content: msg.text };
        }
    }
    if (!payload) return;
    const options = { username: msg.from.first_name, avatarURL: await getUserPhotoUrl(msg.chat.id) };
    if (available.length === 1) {
        await sendToDiscord(WEBHOOKS.data[available[0]].url, payload, options);
        return telegramBot.sendMessage(msg.chat.id, '✅');
    }
    const buttons = available.map(k => [{ text: WEBHOOKS.data[k]?.name || k, callback_data: `send:${k}` }]);
    pendingMessages.set(msg.chat.id, { payload, options });
    telegramBot.sendMessage(msg.chat.id, TEXT_FOR_WHERE_SEND, { reply_markup: { inline_keyboard: buttons } });
});

telegramBot.on('callback_query', async (query) => {
    if (!isReady) return;
    const chatId = query.message.chat.id;
    const [action, key] = query.data.split(':');
    const pending = pendingMessages.get(chatId);
    if (action === 'send' && pending && WEBHOOKS.data[key]) {
        try {
            await sendToDiscord(WEBHOOKS.data[key].url, pending.payload, pending.options);
            await telegramBot.editMessageText(`✅`, { chat_id: chatId, message_id: query.message.message_id });
            pendingMessages.delete(chatId);
        } catch (e) {
            console.error(e.message);
            await telegramBot.sendMessage(chatId, "Error ❌");
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
        } catch (e) { console.error("❌ error download video to buffer:", e.message); return null; }
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

// Functions for multi webhooks
async function initWebhooks() {
    const initializedWebhooks = { data: {}, users: webhooksConfig.users };
    const keys = Object.keys(webhooksConfig.webhooks);
    const initPromises = keys.map(async (key) => {
        const url = webhooksConfig.webhooks[key];
        try {
            const response = await axios.get(url);
            initializedWebhooks.data[key] = { 
                ...response.data, 
                local_id: key, 
                url: url 
            };
            console.log(`[OK] innit: ${key} | ${response.data.name}`);
        } catch (error) {
            console.error(`[Error] ${key}:`, error.message);
        }
    });
    await Promise.all(initPromises);
    return initializedWebhooks;
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