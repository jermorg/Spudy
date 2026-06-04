
const ROUTING_OPTIONS = {
    "MESSAGE_TEXT": "MESSAGE_TEXT",
    "MESSAGE_PHOTO": "MESSAGE_PHOTO",
    "MESSAGE_VIDEO": "MESSAGE_VIDEO",
    "MESSAGE_GIF": "MESSAGE_GIF",
    "MESSAGE_VIDEO_NOTE": "MESSAGE_VIDEO_NOTE",
    "TIKTOK": "TIKTOK"
};

let GLOBAL_CONFIG = {};


function loadConfig() {
    fetch('/api/config')
        .then(response => {
            if (!response.ok) throw new Error('Network error');
            return response.json();
        })
        .then(data => {
            GLOBAL_CONFIG = data || {};
            if (data.settings) {
                renderRouting(data.settings);
                
                if (data.settings.COBALT_URL) {
                    $('#cobalt_url').val(data.settings.COBALT_URL);
                }
            }

            if (data.webhooks) {
                renderWebhooksTable(data.webhooks, data.webhookNames);
            }
            
            if (data.users && data.webhooks) {
                renderUsersTable(data.users, data.webhooks, data.webhookNames);
            }
        })
        .catch(error => {
            console.error('Error loading config:', error);
        });
}


$(document).ready(function() {
    loadConfig();
});