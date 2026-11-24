const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { startBot } = require('./bot');

const app = express();
const PORT = process.env.WEB_PORT || 9878;
const webDir = path.join(__dirname, '..', 'web');

app.use(express.json());
app.use(express.static(webDir));

function checkToken(req, res, next) {
    if (req.path.startsWith('/api/') || req.path.includes('.')) {
        return next();
    }

    const hasToken = Boolean(db.getBotToken());
    const isSetupPage = req.path === '/setup';

    if (!hasToken && !isSetupPage) return res.redirect('/setup');
    if (hasToken && isSetupPage) return res.redirect('/');
    return next();
}

app.get('/', checkToken, (req, res) => res.sendFile(path.join(webDir, 'dashboard.html')));
app.get('/settings', checkToken, (req, res) => res.sendFile(path.join(webDir, 'settings.html')));
app.get('/setup', checkToken, (req, res) => res.sendFile(path.join(webDir, 'setup.html')));

app.get('/api/config', (req, res) => {
    try {
        res.json(db.getConfig());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/dashboard/logs', (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        res.json(db.getLogs(limit));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/webhooks', (req, res) => {
    try {
        res.json(db.getWebhooks());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/webhooks', (req, res) => {
    const { url, name } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const key = crypto.randomBytes(4).toString('hex');
    try {
        db.addWebhook(key, url, name);
        res.json({ success: true, key, message: `Webhook '${key}' created.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/webhooks/:key', (req, res) => {
    try {
        db.deleteWebhook(req.params.key);
        res.json({ success: true, message: `Webhook '${req.params.key}' deleted.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings', (req, res) => {
    try {
        res.json(db.getSettings());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings', (req, res) => {
    try {
        db.updateSettings(req.body);
        res.json({ success: true, message: 'Global settings updated.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings/token', async (req, res) => {
    const { bot_token } = req.body;
    if (!bot_token || !bot_token.trim()) {
        return res.status(400).json({ error: 'bot_token is required and cannot be empty' });
    }

    try {
        if (!db.updateBotToken(bot_token)) {
            return res.status(404).json({ error: 'Settings row not found' });
        }
        await startBot();
        res.json({ success: true, message: 'Telegram bot token updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings/cobalt', (req, res) => {
    const { cobalt_url } = req.body;
    if (!cobalt_url || !cobalt_url.trim()) {
        return res.status(400).json({ error: 'cobalt_url is required and cannot be empty' });
    }

    try {
        if (!db.updateCobaltUrl(cobalt_url)) {
            return res.status(404).json({ error: 'Settings row not found' });
        }
        res.json({ success: true, message: 'Cobalt API URL updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', (req, res) => {
    const { user_id, webhook_key } = req.body;
    if (!user_id || !webhook_key) {
        return res.status(400).json({ error: 'user_id and webhook_key are required' });
    }

    try {
        db.addUserRule(user_id, webhook_key);
        res.json({ success: true, message: `User ${user_id} granted access to ${webhook_key}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:userId/:webhookKey', (req, res) => {
    try {
        db.removeUserRule(req.params.userId, req.params.webhookKey);
        res.json({ success: true, message: 'Access removed.' });
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
        db.removeUser(userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function startWeb() {
    app.listen(PORT, () => {
        console.log(`[API] Server running on port ${PORT}`);
    });
}

module.exports = { startWeb };