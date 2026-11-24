const { WebhookClient } = require('discord.js');

async function sendToDiscord(webhookUrl, payload, options) {
    const client = new WebhookClient({ url: webhookUrl });
    const files = payload.files || [];
    
    if (files.length <= 10) {
        await client.send({ ...payload, ...options });
        return;
    }
    
    for (let i = 0; i < files.length; i += 10) {
        await client.send({
            ...payload,
            files: files.slice(i, i + 10),
            content: i === 0 ? payload.content : undefined,
            embeds: i === 0 ? payload.embeds : undefined,
            ...options
        });
    }
}

module.exports = { sendToDiscord };