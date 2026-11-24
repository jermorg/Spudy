import { api } from '../api.js';
import { showToast, renderBotStatusPill } from '../ui.js';
import { renderRouting } from './routing.js';
import { renderWebhooks, initWebhooksForm } from './webhooks.js';
import { renderUsers, initUsersForm } from './users.js';
import { renderCredentials, initCredentials } from './credentials.js';

function activateTab(targetId) {
    const buttons = document.querySelectorAll('#sidebar-menu .menu-btn');
    const pages = document.querySelectorAll('.page-content');

    buttons.forEach((btn) => {
        const isMatch = btn.dataset.target === targetId;
        btn.classList.toggle('active_menu_item', isMatch);
        btn.classList.toggle('text-gray-400', !isMatch);
    });

    pages.forEach((page) => {
        page.classList.toggle('hidden', page.id !== targetId);
    });
}

function initTabs() {
    const menu = document.getElementById('sidebar-menu');
    if (!menu) return;

    const hashMap = {
        '#routing': 'routing-page',
        '#webhooks': 'webhooks-page',
        '#users': 'users-page',
        '#credentials': 'settings-page'
    };

    if (hashMap[window.location.hash]) {
        activateTab(hashMap[window.location.hash]);
    }

    menu.addEventListener('click', (e) => {
        const btn = e.target.closest('.menu-btn');
        if (!btn) return;
        activateTab(btn.dataset.target);
    });
}

async function reloadConfig() {
    try {
        const data = await api.getConfig();
        renderBotStatusPill(data.bot);
        renderRouting(data.settings);
        renderWebhooks(data.webhooks, data.webhookNames, reloadConfig);
        renderUsers(data.users, data.webhooks, data.webhookNames, reloadConfig);
        renderCredentials(data.settings, data.bot);
    } catch (err) {
        showToast(`Failed to load config: ${err.message}`, 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initWebhooksForm(reloadConfig);
    initUsersForm(reloadConfig);
    initCredentials();
    await reloadConfig();
});