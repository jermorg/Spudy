require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { WebhookClient } = require('discord.js');
const axios = require('axios');

// Bot & webhook
const telegramBot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const discordWebhook = new WebhookClient({ url: process.env.DISCORD_WEBHOOK });

// Consts
const MAX_FILE_SIZE_IN_BITE = 10000000;
const TEXT_FOR_FILE_SO_BIG = process.env.TEXT_FOR_FILE_SO_BIG;
const TEXT_FOR_NO_OPTIMAL_FILE = process.env.TEXT_FOR_NO_OPTIMAL_FILE;

// Events
telegramBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
  
    // prepare sender 
    const webhookOptions = {
        username: msg.from.first_name || 'user',
        avatarURL: await getUserPhotoUrl(chatId) || undefined,
    };

    if(msg.photo || msg.video || msg.document || msg.video_note){
        const bestMedia = await getTelegramMediaUrl(msg);
        if(bestMedia.ok){
            await discordWebhook.send({
                files: [bestMedia.url],
                ...webhookOptions,
            });
        } else {
            telegramBot.sendMessage(msg.chat.id, bestMedia.msg)
        }
    }
})


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