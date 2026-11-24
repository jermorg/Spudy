const TelegramBot = require('node-telegram-bot-api');
const { getBotToken, getConfig, addLog } = require('./db');
const { downloadViaCobalt } = require('./cobalt');
const { sendToDiscord } = require('./discord');

const MAX_FILE_SIZE = 10_000_000;
const pendingMessages = new Map();

let bot = null;
let activeToken = null;

function logMessage({ msg, msgType, payload, webhookName, status, errorMsg = null }) {
    let preview = '';
    if (msgType === 'MESSAGE_TEXT') {
        preview = payload?.content || msg.text || '';
    } else if (msgType === 'TIKTOK' || msgType === 'INSTAGRAM') {
        preview = msg.text || `${msgType} Link`;
    } else if (msgType) {
        preview = `[${msgType.replace('MESSAGE_', '')} File]`;
    }

    addLog({
        telegramId: msg.from.id.toString(),
        username: msg.from.username ? `@${msg.from.username}` : msg.from.first_name,
        msgType: msgType || 'UNKNOWN',
        payloadPreview: preview,
        webhookName,
        status,
        errorMessage: errorMsg
    });
}

function getBestPhoto(photos) {
    return photos
        .filter((p) => !p.file_size || p.file_size <= MAX_FILE_SIZE)
        .sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
}

async function getTelegramFileUrl(fileId) {
    const file = await bot.getFile(fileId);
    return `https://api.telegram.org/file/bot${activeToken}/${file.file_path}`;
}

async function getTelegramMediaUrl(msg) {
    const media = msg.video || msg.video_note || msg.document || (msg.photo ? getBestPhoto(msg.photo) : null);
    if (!media) return { ok: false };
    if (media.file_size && media.file_size >= MAX_FILE_SIZE) return { ok: false };

    const url = await getTelegramFileUrl(media.file_id);
    return { ok: true, url };
}

async function getUserPhotoUrl(userId) {
    const profilePhotos = await bot.getUserProfilePhotos(userId);
    if (!profilePhotos.total_count) return null;

    const lastPhotoSizes = profilePhotos.photos[profilePhotos.photos.length - 1];
    const targetSize = lastPhotoSizes[lastPhotoSizes.length - 2] || lastPhotoSizes[0];
    return getTelegramFileUrl(targetSize.file_id);
}

async function handleMessage(msg) {
    if (!msg.from) return;

    const userId = msg.from.id.toString();
    let detectedType = null;
    let payload = null;

    try {
        const { webhooks, webhookNames, users, settings } = getConfig();
        const available = [...new Set(users[userId]?.length ? users[userId] : users['0'] || [])];
        if (!available.length) return;

        const mediaRules = [
            { check: msg.photo && settings.MESSAGE_PHOTO, type: 'MESSAGE_PHOTO' },
            { check: msg.video && settings.MESSAGE_VIDEO, type: 'MESSAGE_VIDEO' },
            { check: msg.document && settings.MESSAGE_GIF, type: 'MESSAGE_GIF' },
            { check: msg.video_note && settings.MESSAGE_VIDEO_NOTE, type: 'MESSAGE_VIDEO_NOTE' }
        ];

        const matchedMedia = mediaRules.find((r) => r.check);

        if (matchedMedia) {
            const media = await getTelegramMediaUrl(msg);
            if (!media.ok) {
                return bot.sendMessage(msg.chat.id, 'File too big (');
            }
            payload = { files: [{ attachment: media.url }] };
            detectedType = matchedMedia.type;
        } else if (msg.text) {
            if (msg.text.includes('tiktok.com') && settings.TIKTOK) {
                detectedType = 'TIKTOK';
                const files = await downloadViaCobalt(msg.text);
                if (!files) return bot.sendMessage(msg.chat.id, '❌');
                payload = { files };
            } else if (msg.text.includes('instagram.com') && settings.INSTAGRAM) {
                detectedType = 'INSTAGRAM';
                const files = await downloadViaCobalt(msg.text);
                if (!files) return bot.sendMessage(msg.chat.id, '❌');
                payload = { files };
            } else if (settings.MESSAGE_TEXT) {
                detectedType = 'MESSAGE_TEXT';
                payload = { content: msg.text };
            }
        }

        if (!payload) return;

        const options = {
            username: msg.from.first_name,
            avatarURL: await getUserPhotoUrl(msg.chat.id)
        };

        if (available.length === 1) {
            const targetKey = available[0];
            const webhookUrl = webhooks[targetKey];
            const currentWebhookName = webhookNames[targetKey] || targetKey;

            if (!webhookUrl) {
                logMessage({ msg, msgType: detectedType, payload, webhookName: currentWebhookName, status: false, errorMsg: 'Webhook URL not found' });
                return bot.sendMessage(msg.chat.id, '[BOT][❌] Webhook URL not found');
            }

            try {
                await sendToDiscord(webhookUrl, payload, options);
                logMessage({ msg, msgType: detectedType, payload, webhookName: currentWebhookName, status: true });
                return bot.sendMessage(msg.chat.id, '✅');
            } catch (err) {
                logMessage({ msg, msgType: detectedType, payload, webhookName: currentWebhookName, status: false, errorMsg: err.message });
                return bot.sendMessage(msg.chat.id, '❌');
            }
        }

        const buttons = available.map((k) => [{ text: webhookNames[k] || k, callback_data: `send:${k}` }]);
        const sentMessage = await bot.sendMessage(msg.chat.id, 'Send to?:', {
            reply_markup: { inline_keyboard: buttons },
            reply_to_message_id: msg.message_id
        });

        pendingMessages.set(`${msg.chat.id}:${sentMessage.message_id}`, {
            payload,
            options,
            detectedType,
            originalMsg: msg
        });
    } catch (err) {
        console.error('[BOT][❌] Error processing message:', err.message);
        await bot.sendMessage(msg.chat.id, '❌');
        logMessage({ msg, msgType: detectedType, payload, webhookName: 'null', status: false, errorMsg: err.message });
    }
}

async function handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const [action, key] = query.data.split(':');

    const pendingKey = `${chatId}:${messageId}`;
    const pending = pendingMessages.get(pendingKey);

    if (action === 'send') {
        if (!pending) {
            await bot.editMessageText('❌', { chat_id: chatId, message_id: messageId });
            return bot.answerCallbackQuery(query.id);
        }

        const { webhooks, webhookNames } = getConfig();
        const webhookUrl = webhooks[key];
        const currentWebhookName = webhookNames[key] || key;

        if (!webhookUrl) {
            await bot.sendMessage(chatId, '❌');
            logMessage({ msg: pending.originalMsg, msgType: pending.detectedType, payload: pending.payload, webhookName: key, status: false, errorMsg: 'Webhook not found during callback' });
            return bot.answerCallbackQuery(query.id);
        }

        try {
            await sendToDiscord(webhookUrl, pending.payload, pending.options);
            await bot.editMessageText('✅', { chat_id: chatId, message_id: messageId });
            logMessage({ msg: pending.originalMsg, msgType: pending.detectedType, payload: pending.payload, webhookName: currentWebhookName, status: true });
            pendingMessages.delete(pendingKey);
        } catch (err) {
            console.error('[BOT][❌] Error sending via button:', err.message);
            await bot.sendMessage(chatId, '❌');
            logMessage({ msg: pending.originalMsg, msgType: pending.detectedType, payload: pending.payload, webhookName: currentWebhookName, status: false, errorMsg: err.message });
        }
    }

    return bot.answerCallbackQuery(query.id);
}

async function startBot() {
    const token = getBotToken();

    if (!token) {
        console.log('[BOT][⚠️] BOT TOKEN NOT FOUND. Set it via Web UI to start the bot.');
        return;
    }

    if (bot) {
        await bot.stopPolling();
        bot.removeAllListeners();
        bot = null;
    }

    activeToken = token;
    bot = new TelegramBot(token, { polling: true });
    bot.on('message', handleMessage);
    bot.on('callback_query', handleCallbackQuery);

    console.log('[BOT][✅] Telegram bot started');
}

module.exports = { startBot };