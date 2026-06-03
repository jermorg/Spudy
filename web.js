require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.WEB_PORT || 4000;

app.use(express.json());

const db = new Database('data.db');
db.pragma('foreign_keys = ON');

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS dashboard_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    username TEXT,
    msg_type TEXT NOT NULL,
    payload_preview TEXT,
    webhook_name TEXT NOT NULL,
    status INTEGER NOT NULL, -- 1 = true, 0 = false
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
    tiktok INTEGER DEFAULT 0
  );
`);

// Initialize global settings if not exists
const initSettings = db.prepare('SELECT 1 FROM global_settings WHERE id = 1').get();
if (!initSettings) {
    db.prepare(`
        INSERT INTO global_settings (id, bot_token, cobalt_url, message_text, message_photo, message_video, message_gif, message_video_note, tiktok) 
        VALUES (1, NULL, NULL, 1, 1, 1, 1, 1, 0)
    `).run();
    console.log('[DB] Global settings initialized with default values.');
} else {
    try {
        db.exec("ALTER TABLE global_settings ADD COLUMN cobalt_url TEXT DEFAULT NULL");
        console.log('[DB] Migrated: added cobalt_url column.');
    } catch (e) {
    }
}

app.use(express.static(path.join(__dirname, 'web')));

function checkToken(req, res, next) {
    if (req.path.startsWith('/api/') || req.path.includes('.')) {
        return next();
    }

    try {
        const config = db.prepare('SELECT bot_token FROM global_settings WHERE id = 1').get();
        const hasToken = config && config.bot_token && config.bot_token.trim() !== '';
        const isSetupPage = req.path === '/setup';

        console.log(hasToken, isSetupPage, req.path);

        if (!hasToken) {
            if (!isSetupPage) return res.redirect('/setup');
            return next();
        } else {
            if (isSetupPage) return res.redirect('/');
            return next();
        }
    } catch (err) {
        if (req.path !== '/setup') return res.redirect('/setup');
        next();
    }
}

app.get('/', checkToken, (req, res) => {
    res.sendFile(__dirname + '/web/dashboard.html');
});

app.get('/settings', checkToken, (req, res) => {
    res.sendFile(__dirname + '/web/settings.html');
});

app.get('/setup', checkToken, (req, res) => {
    res.sendFile(__dirname + '/web/setup.html');
});

// 1. Get Config
app.get('/api/config', (req, res) => {
    try {
        const webhooksRows = db.prepare('SELECT key, url, name FROM webhooks').all();
        const usersRows = db.prepare('SELECT user_id, webhook_key FROM user_webhooks').all();
        const globalSettings = db.prepare('SELECT * FROM global_settings WHERE id = 1').get();

        const webhooks = {};
        const webhookNames = {};
        
        webhooksRows.forEach(row => {
            webhooks[row.key] = row.url;
            webhookNames[row.key] = row.name || row.key;
        });

        const users = {};
        usersRows.forEach(row => {
            if (!users[row.user_id]) users[row.user_id] = [];
            users[row.user_id].push(row.webhook_key);
        });

        const settings = {
            MESSAGE_TEXT: Boolean(globalSettings.message_text),
            MESSAGE_PHOTO: Boolean(globalSettings.message_photo),
            MESSAGE_VIDEO: Boolean(globalSettings.message_video),
            MESSAGE_GIF: Boolean(globalSettings.message_gif),
            MESSAGE_VIDEO_NOTE: Boolean(globalSettings.message_video_note),
            TIKTOK: Boolean(globalSettings.tiktok),
            COBALT_URL: globalSettings.cobalt_url || '',
        };

        res.json({ webhooks, webhookNames, users, settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/dashboard/logs', (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const logs = db.prepare('SELECT * FROM dashboard_logs ORDER BY created_at DESC LIMIT ?').all(limit);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Webhook Management
app.get('/api/webhooks', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM webhooks').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/webhooks', (req, res) => {
    const { url, name } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const key = crypto.randomBytes(4).toString('hex');
    try {
        const stmt = db.prepare('INSERT INTO webhooks (key, url, name) VALUES (?, ?, ?)');
        stmt.run(key, url, name || null);
        res.json({ success: true, key: key, message: `Webhook '${key}' created.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/webhooks/:key', (req, res) => {
    const { key } = req.params;
    try {
        const stmt = db.prepare('DELETE FROM webhooks WHERE key = ?');
        stmt.run(key);
        res.json({ success: true, message: `Webhook '${key}' deleted.`});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Settings Management
app.get('/api/settings', (req, res) => {
    try {
        const row = db.prepare('SELECT * FROM global_settings WHERE id = 1').get();
        res.json({
            message_text: Boolean(row.message_text),
            message_photo: Boolean(row.message_photo),
            message_video: Boolean(row.message_video),
            message_gif: Boolean(row.message_gif),
            message_video_note: Boolean(row.message_video_note),
            tiktok: Boolean(row.tiktok)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings', (req, res) => {
    const { message_text, message_photo, message_video, message_gif, message_video_note, tiktok } = req.body;

    try {
        const current = db.prepare('SELECT * FROM global_settings WHERE id = 1').get();

        const toInt = (val, currentField) => {
            if (val === undefined) return current[currentField];
            return val ? 1 : 0;
        };

        const stmt = db.prepare(`
            UPDATE global_settings 
            SET message_text = ?, 
                message_photo = ?, 
                message_video = ?, 
                message_gif = ?, 
                message_video_note = ?, 
                tiktok = ?
            WHERE id = 1
        `);

        stmt.run(
            toInt(message_text, 'message_text'),
            toInt(message_photo, 'message_photo'),
            toInt(message_video, 'message_video'),
            toInt(message_gif, 'message_gif'),
            toInt(message_video_note, 'message_video_note'),
            toInt(tiktok, 'tiktok')
        );

        res.json({ success: true, message: 'Global settings updated.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings/token', (req, res) => {
    const { bot_token } = req.body;
    if (bot_token === undefined || bot_token.trim() === '') {
        return res.status(400).json({ error: 'bot_token is required and cannot be empty' });
    }
    try {
        const stmt = db.prepare('UPDATE global_settings SET bot_token = ? WHERE id = 1');
        const result = stmt.run(bot_token.trim());
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Settings row not found' });
        }
        res.json({ success: true, message: 'Telegram bot token updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings/cobalt', (req, res) => {
    const { cobalt_url } = req.body;
    if (cobalt_url === undefined || cobalt_url.trim() === '') {
        return res.status(400).json({ error: 'cobalt_url is required and cannot be empty' });
    }
    try {
        const stmt = db.prepare('UPDATE global_settings SET cobalt_url = ? WHERE id = 1');
        const result = stmt.run(cobalt_url.trim());
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Settings row not found' });
        }
        res.json({ success: true, message: 'Cobalt API URL updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. User Management 
app.post('/api/users', (req, res) => {
    const { user_id, webhook_key } = req.body;
    if (!user_id || !webhook_key) return res.status(400).json({ error: 'user_id and webhook_key are required' });

    try {
        const stmt = db.prepare('INSERT OR IGNORE INTO user_webhooks (user_id, webhook_key) VALUES (?, ?)');
        stmt.run(user_id.toString(), webhook_key);
        res.json({ success: true, message: `User ${user_id} granted access to ${webhook_key}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:userId/:webhookKey', (req, res) => {
    const { userId, webhookKey } = req.params;
    try {
        const stmt = db.prepare('DELETE FROM user_webhooks WHERE user_id = ? AND webhook_key = ?');
        stmt.run(userId, webhookKey);
        res.json({ success: true, message: `Access removed.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:userId', (req, res) => {
    const { userId } = req.params;
    if (userId.toLowerCase() === 'all' || userId === '0') {
        return res.status(400).json({ error: 'Cannot delete global rule' });
    }
    try {
        db.prepare('DELETE FROM user_webhooks WHERE user_id = ?').run(userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`[API] Server running on port ${PORT}`);
});