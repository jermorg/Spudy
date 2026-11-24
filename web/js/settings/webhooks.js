import { api } from '../api.js';
import { escapeHtml, showToast, confirmAction } from '../ui.js';

export function renderWebhooks(webhooks = {}, webhookNames = {}, onReload) {
    const tbody = document.getElementById('webhooks-table-body');
    if (!tbody) return;

    const keys = Object.keys(webhooks);
    if (!keys.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="p-6 text-center text-gray-500 text-xs">No webhooks added yet</td></tr>`;
        return;
    }

    tbody.innerHTML = keys
        .map((key) => {
            const name = webhookNames[key] || key;
            const url = webhooks[key];
            return `
        <tr class="hover:bg-gray-800/20 transition-colors">
          <td class="py-3 px-4 font-medium text-white">${escapeHtml(name)}</td>
          <td class="py-3 px-4 font-mono text-gray-500 truncate max-w-xs" title="${escapeHtml(url)}">${escapeHtml(url)}</td>
          <td class="py-3 px-4 text-right space-x-3 whitespace-nowrap">
            <button type="button" data-test-wh="${escapeHtml(key)}" class="text-blue-400 hover:text-blue-300 transition-colors text-[11px] cursor-pointer font-medium">Test</button>
            <button type="button" data-del-wh="${escapeHtml(key)}" data-wh-name="${escapeHtml(name)}" class="text-gray-500 hover:text-rose-400 transition-colors text-[11px] cursor-pointer font-medium">Delete</button>
          </td>
        </tr>
      `;
        })
        .join('');

    tbody.querySelectorAll('button[data-test-wh]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.testWh;
            const prev = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Sending...';
            try {
                await api.testWebhook(key);
                showToast('Test message sent to Discord!', 'success');
            } catch (err) {
                showToast(`Webhook test failed: ${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = prev;
            }
        });
    });

    tbody.querySelectorAll('button[data-del-wh]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.delWh;
            const name = btn.dataset.whName;
            const ok = await confirmAction(`Delete webhook "${name}"?`, 'Users assigned to this webhook will lose access to it.');
            if (!ok) return;

            try {
                await api.deleteWebhook(key);
                showToast('Webhook deleted', 'success');
                await onReload();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });
}

export function initWebhooksForm(onReload) {
    const form = document.getElementById('webhook-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('wh-name');
        const urlInput = document.getElementById('wh-url');
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();

        if (!name || !url) return;

        try {
            await api.addWebhook({ name, url });
            form.reset();
            showToast(`Webhook "${name}" added`, 'success');
            await onReload();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}