import { api } from '../api.js';
import { showToast, renderBotStatusPill } from '../ui.js';

export function renderCredentials(settings = {}, botStatus = {}) {
    const cobaltInput = document.getElementById('cobalt-url');
    const tokenBadge = document.getElementById('token-status-badge');

    if (cobaltInput && settings.COBALT_URL) {
        cobaltInput.value = settings.COBALT_URL;
    }

    if (tokenBadge) {
        if (botStatus?.running) {
            tokenBadge.className = 'text-[11px] text-emerald-400 font-mono';
            tokenBadge.textContent = `Active: @${botStatus.username || 'bot'}`;
        } else {
            tokenBadge.className = 'text-[11px] text-amber-400';
            tokenBadge.textContent = 'Not connected';
        }
    }
}

export function initCredentials() {
    const tokenInput = document.getElementById('telegram-token');
    const toggleBtn = document.getElementById('toggle-token-btn');
    const saveTokenBtn = document.getElementById('save-token-btn');

    const cobaltInput = document.getElementById('cobalt-url');
    const testCobaltBtn = document.getElementById('test-cobalt-btn');
    const saveCobaltBtn = document.getElementById('save-cobalt-btn');
    const cobaltBadge = document.getElementById('cobalt-status-badge');

    toggleBtn?.addEventListener('click', () => {
        tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
    });

    saveTokenBtn?.addEventListener('click', async () => {
        const token = tokenInput.value.trim();
        if (!token) {
            showToast('Enter a Telegram bot token first', 'error');
            return;
        }

        saveTokenBtn.disabled = true;
        saveTokenBtn.textContent = 'Verifying...';

        try {
            const res = await api.saveToken(token);
            tokenInput.value = '';
            renderBotStatusPill(res.bot);
            renderCredentials({}, res.bot);
            showToast(`Bot @${res.bot?.username || ''} started!`, 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            saveTokenBtn.disabled = false;
            saveTokenBtn.textContent = 'Save & Apply';
        }
    });

    testCobaltBtn?.addEventListener('click', async () => {
        const url = cobaltInput.value.trim();
        if (!url) {
            showToast('Enter Cobalt API URL first', 'error');
            return;
        }

        testCobaltBtn.disabled = true;
        testCobaltBtn.textContent = 'Testing...';
        cobaltBadge.className = 'text-[11px] text-gray-400';
        cobaltBadge.textContent = 'Checking connection...';

        try {
            const res = await api.testCobalt(url);
            const ver = res.version ? `v${res.version} • ` : '';
            cobaltBadge.className = 'text-[11px] text-emerald-400 font-mono';
            cobaltBadge.textContent = `Connected (${ver}${res.latency}ms)`;
            showToast('Cobalt API is reachable!', 'success');
        } catch (err) {
            cobaltBadge.className = 'text-[11px] text-rose-400';
            cobaltBadge.textContent = err.message;
            showToast(err.message, 'error');
        } finally {
            testCobaltBtn.disabled = false;
            testCobaltBtn.textContent = 'Test';
        }
    });

    saveCobaltBtn?.addEventListener('click', async () => {
        const url = cobaltInput.value.trim();
        if (!url) {
            showToast('Enter Cobalt API URL first', 'error');
            return;
        }

        saveCobaltBtn.disabled = true;
        saveCobaltBtn.textContent = 'Saving...';

        try {
            await api.saveCobalt(url);
            showToast('Cobalt URL saved', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            saveCobaltBtn.disabled = false;
            saveCobaltBtn.textContent = 'Save';
        }
    });
}