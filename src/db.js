const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'data.db'));

db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS dashboard_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT NOT NULL,
        username TEXT,
        msg_type TEXT NOT NULL,
        payload_preview TEXT,
        webhook_name TEXT NOT NULL,
        status INTEGER NOT NULL,
        error_message TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS webhooks (
        key TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        name TEXT
    );

    CREATE TABLE IF NOT EXISTS user_webhooks (
        user_id TEXT NOT NULL,
        webhook_key TEXT NOT NULL,
        PRIMARY KEY (user_id, webhook_key),
        FOREIGN KEY (webhook_key) REFERENCES webhooks(key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS global_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        bot_token TEXT DEFAULT NULL,
        cobalt_url TEXT DEFAULT NULL,
        message_text INTEGER DEFAULT 1,
        message_photo INTEGER DEFAULT 1,
        message_video INTEGER DEFAULT 1,
        message_gif INTEGER DEFAULT 1,
        message_video_note INTEGER DEFAULT 1,
        tiktok INTEGER DEFAULT 0,
        instagram INTEGER DEFAULT 0
    );
`);

const hasSettings = db.prepare('SELECT 1 FROM global_settings WHERE id = 1').get();
if (!hasSettings) {
    db.prepare(`
        INSERT INTO global_settings (id, bot_token, cobalt_url, message_text, message_photo, message_video, message_gif, message_video_note, tiktok, instagram)
        VALUES (1, NULL, NULL, 1, 1, 1, 1, 1, 0, 0)
    `).run();
}

for (const column of ['cobalt_url TEXT DEFAULT NULL', 'instagram INTEGER DEFAULT 0']) {
    try {
        db.exec(`ALTER TABLE global_settings ADD COLUMN ${column}`);
    } catch (err) {
        if (!err.message.includes('duplicate column name')) {
            console.error('[DB][❌] Migration error:', err.message);
        }
    }
}

function getBotToken() {
    const row = db.prepare('SELECT bot_token FROM global_settings WHERE id = 1').get();
    return row?.bot_token?.trim() || null;
}

function updateBotToken(token) {
    const res = db.prepare('UPDATE global_settings SET bot_token = ? WHERE id = 1').run(token.trim());
    return Number(res.changes) > 0;
}

function getCobaltUrl() {
    const row = db.prepare('SELECT cobalt_url FROM global_settings WHERE id = 1').get();
    return row?.cobalt_url?.trim() || null;
}

function updateCobaltUrl(url) {
    const res = db.prepare('UPDATE global_settings SET cobalt_url = ? WHERE id = 1').run(url.trim());
    return Number(res.changes) > 0;
}

function getConfig() {
    const webhooksRows = db.prepare('SELECT key, url, name FROM webhooks').all();
    const usersRows = db.prepare('SELECT user_id, webhook_key FROM user_webhooks').all();
    const gs = db.prepare('SELECT * FROM global_settings WHERE id = 1').get();

    const webhooks = {};
    const webhookNames = {};
    for (const row of webhooksRows) {
        webhooks[row.key] = row.url;
        webhookNames[row.key] = row.name || row.key;
    }

    const users = {};
    for (const row of usersRows) {
        if (!users[row.user_id]) users[row.user_id] = [];
        users[row.user_id].push(row.webhook_key);
    }

    const settings = {
        MESSAGE_TEXT: Boolean(gs.message_text),
        MESSAGE_PHOTO: Boolean(gs.message_photo),
        MESSAGE_VIDEO: Boolean(gs.message_video),
        MESSAGE_GIF: Boolean(gs.message_gif),
        MESSAGE_VIDEO_NOTE: Boolean(gs.message_video_note),
        TIKTOK: Boolean(gs.tiktok),
        INSTAGRAM: Boolean(gs.instagram),
        COBALT_URL: gs.cobalt_url || ''
    };

    return { webhooks, webhookNames, users, settings };
}

function getSettings() {
    const row = db.prepare('SELECT * FROM global_settings WHERE id = 1').get();
    return {
        message_text: Boolean(row.message_text),
        message_photo: Boolean(row.message_photo),
        message_video: Boolean(row.message_video),
        message_gif: Boolean(row.message_gif),
        message_video_note: Boolean(row.message_video_note),
        tiktok: Boolean(row.tiktok),
        instagram: Boolean(row.instagram)
    };
}

function updateSettings(payload) {
    const current = db.prepare('SELECT * FROM global_settings WHERE id = 1').get();
    const toInt = (val, key) => (val === undefined ? current[key] : val ? 1 : 0);

    db.prepare(`
        UPDATE global_settings
        SET message_text = ?,
            message_photo = ?,
            message_video = ?,
            message_gif = ?,
            message_video_note = ?,
            tiktok = ?,
            instagram = ?
        WHERE id = 1
    `).run(
        toInt(payload.message_text, 'message_text'),
        toInt(payload.message_photo, 'message_photo'),
        toInt(payload.message_video, 'message_video'),
        toInt(payload.message_gif, 'message_gif'),
        toInt(payload.message_video_note, 'message_video_note'),
        toInt(payload.tiktok, 'tiktok'),
        toInt(payload.instagram, 'instagram')
    );
}

function getWebhooks() {
    return db.prepare('SELECT * FROM webhooks').all();
}

function addWebhook(key, url, name) {
    db.prepare('INSERT INTO webhooks (key, url, name) VALUES (?, ?, ?)').run(key, url, name ?? null);
}

function deleteWebhook(key) {
    db.prepare('DELETE FROM webhooks WHERE key = ?').run(key);
}

function addUserRule(userId, webhookKey) {
    db.prepare('INSERT OR IGNORE INTO user_webhooks (user_id, webhook_key) VALUES (?, ?)').run(
        userId.toString(),
        webhookKey
    );
}

function removeUserRule(userId, webhookKey) {
    db.prepare('DELETE FROM user_webhooks WHERE user_id = ? AND webhook_key = ?').run(userId, webhookKey);
}

function removeUser(userId) {
    db.prepare('DELETE FROM user_webhooks WHERE user_id = ?').run(userId);
}

function getLogs(limit = 50) {
    return db.prepare('SELECT * FROM dashboard_logs ORDER BY created_at DESC LIMIT ?').all(limit);
}

function addLog({ telegramId, username, msgType, payloadPreview, webhookName, status, errorMessage = null }) {
    try {
        db.prepare(`
            INSERT INTO dashboard_logs (telegram_id, username, msg_type, payload_preview, webhook_name, status, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            telegramId,
            username ?? null,
            msgType,
            payloadPreview ?? '',
            webhookName ?? 'null',
            status ? 1 : 0,
            errorMessage ?? null
        );
    } catch (err) {
        console.error('[LOG][❌] Error adding log to DB:', err.message);
    }
}

module.exports = {
    getBotToken,
    updateBotToken,
    getCobaltUrl,
    updateCobaltUrl,
    getConfig,
    getSettings,
    updateSettings,
    getWebhooks,
    addWebhook,
    deleteWebhook,
    addUserRule,
    removeUserRule,
    removeUser,
    getLogs,
    addLog
};