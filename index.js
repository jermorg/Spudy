require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { WebhookClient } = require('discord.js');
const axios = require('axios');

// Bot & webhook
const telegramBot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const discordWebhook = new WebhookClient({ url: process.env.DISCORD_WEBHOOK });

// Consts
const MAX_FILE_SIZE_IN_BITE = 10000000;
const TEXT_FOR_FILE_SO_BIG = 'File so big';
const TEXT_FOR_NO_OPTIMAL_FILE = 'No optimal file';

// Events
telegramBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const webhookOptions = {
        username: msg.from.first_name || 'user',
        avatarURL: await getUserPhotoUrl(chatId) || undefined,
    };
    if(
        (process.env.MESSAGE_PHOTO === "true" && msg.photo) ||
        (process.env.MESSAGE_VIDEO === "true" && msg.video) ||
        (process.env.MESSAGE_GIF === "true" && msg.document) ||
        (process.env.MESSAGE_VIDEO_NOTE === "true" && msg.video_note)
    ){
        const bestMedia = await getTelegramMediaUrl(msg);
        if(bestMedia.ok){
            await discordWebhook.send({
                files: [{
                    attachment: bestMedia.url
                }],
                ...webhookOptions,
            });
            return telegramBot.sendMessage(chatId, '✅');
        } else { return telegramBot.sendMessage(msg.chat.id, bestMedia.msg) }
    }

    if (
        process.env.TIKTOK === "true" && (
            msg.text?.startsWith('https://www.tiktok.com/') ||
            msg.text?.startsWith('https://vt.tiktok.com/')
    )) {
        const filesToSend = await downloadTikTokVideo(msg.text); 
        if (filesToSend && filesToSend.length > 0) {
            await discordWebhook.send({
                files: filesToSend,
                ...webhookOptions,
            });
            return telegramBot.sendMessage(chatId, '✅');
        } else {
            return telegramBot.sendMessage(chatId, '❌');
        }
    }

    if(process.env.MESSAGE_TEXT === "true" && msg.text){
        await discordWebhook.send({ content: msg.text, ...webhookOptions });
        return telegramBot.sendMessage(chatId, '✅');
    }
})

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