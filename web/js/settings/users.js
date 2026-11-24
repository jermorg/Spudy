import { api } from '../api.js';
import { escapeHtml, showToast, confirmAction } from '../ui.js';

export function renderUsers(users = {}, allWebhooks = {}, webhookNames = {}, onReload) {
    const tbody = document.getElementById('users-table-body');
    const select = document.getElementById('access-webhook-select');
    const webhookKeys = Object.keys(allWebhooks);

    if (select) {
        select.innerHTML = webhookKeys.length
            ? webhookKeys.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(webhookNames[k] || k)}</option>`).join('')
            : `<option value="">Create a webhook first</option>`;
    }

    if (!tbody) return;
    const normalizedUsers = { '0': [], ...users };

    const rows = ['0', ...Object.keys(normalizedUsers).filter((id) => id !== '0')].map((userId) => {
        const isGlobal = userId === '0';
        const assigned = normalizedUsers[userId] || [];
        const selectedNames = assigned.map((k) => webhookNames[k] || k);

        const checkboxes = webhookKeys.length
            ? webhookKeys
                .map((key) => {
                    const checked = assigned.includes(key) ? 'checked' : '';
                    const label = webhookNames[key] || key;
                    return `
              <label class="flex items-center space-x-2.5 px-2.5 py-1.5 rounded hover:bg-gray-800/60 text-xs text-gray-300 cursor-pointer select-none">
                <input type="checkbox" value="${escapeHtml(key)}" ${checked} class="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer">
                <span class="truncate">${escapeHtml(label)}</span>
              </label>
            `;
                })
                .join('')
            : `<div class="px-2.5 py-1.5 text-xs text-gray-500">No webhooks available</div>`;

        return `
      <tr data-user-id="${escapeHtml(userId)}" class="${isGlobal ? 'bg-blue-950/15 hover:bg-blue-950/25' : 'hover:bg-gray-800/20'} transition-colors">
        <td class="py-3 px-4 font-mono text-gray-400">${isGlobal ? '0 (Any User)' : escapeHtml(userId)}</td>
        <td class="py-3 px-4 relative">
          <button type="button" class="dropdown-trigger w-full h-[34px] bg-[#161b22] border border-gray-800 px-3 rounded-lg text-xs ${selectedNames.length ? 'text-gray-200' : 'text-gray-500'} flex items-center justify-between hover:border-gray-700 cursor-pointer transition-colors text-left">
            <span class="truncate selected-text">${selectedNames.length ? escapeHtml(selectedNames.join(', ')) : 'Select Webhooks...'}</span>
            <svg class="w-3.5 h-3.5 text-gray-500 shrink-0 ml-2" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <div class="table-webhook-dropdown hidden absolute left-4 right-4 mt-1 bg-[#161b22] border border-gray-700 rounded-lg shadow-2xl z-50 p-1.5 space-y-0.5 max-h-56 overflow-y-auto">
            ${checkboxes}
          </div>
        </td>
        <td class="py-3 px-4 text-right">
          ${isGlobal ? '' : `<button type="button" data-del-user="${escapeHtml(userId)}" class="text-gray-500 hover:text-rose-400 transition-colors text-[11px] cursor-pointer font-medium">Delete</button>`}
        </td>
      </tr>
    `;
    });

    tbody.innerHTML = rows.join('');

    tbody.querySelectorAll('.dropdown-trigger').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = btn.nextElementSibling;
            document.querySelectorAll('.table-webhook-dropdown').forEach((d) => {
                if (d !== menu) d.classList.add('hidden');
            });
            menu.classList.toggle('hidden');
        });
    });

    tbody.querySelectorAll('.table-webhook-dropdown').forEach((menu) => {
        menu.addEventListener('click', (e) => e.stopPropagation());
    });

    tbody.querySelectorAll('.table-webhook-dropdown input[type="checkbox"]').forEach((checkbox) => {
        checkbox.addEventListener('change', async () => {
            const row = checkbox.closest('tr');
            const userId = row.dataset.userId;
            const webhookKey = checkbox.value;

            try {
                if (checkbox.checked) await api.addUserRule(userId, webhookKey);
                else await api.removeUserRule(userId, webhookKey);

                const activeLabels = [...row.querySelectorAll('.table-webhook-dropdown input:checked')].map((el) =>
                    el.nextElementSibling.textContent.trim()
                );
                const textSpan = row.querySelector('.selected-text');
                const triggerBtn = row.querySelector('.dropdown-trigger');
                textSpan.textContent = activeLabels.length ? activeLabels.join(', ') : 'Select Webhooks...';
                triggerBtn.classList.toggle('text-gray-200', activeLabels.length > 0);
                triggerBtn.classList.toggle('text-gray-500', activeLabels.length === 0);
            } catch (err) {
                checkbox.checked = !checkbox.checked;
                showToast(err.message, 'error');
            }
        });
    });

    tbody.querySelectorAll('button[data-del-user]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.delUser;
            const ok = await confirmAction(`Remove user ${userId}?`, 'This user will fall back to the default (0) rule.');
            if (!ok) return;

            try {
                await api.deleteUser(userId);
                showToast(`User ${userId} removed`, 'success');
                await onReload();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });
}

export function initUsersForm(onReload) {
    const form = document.getElementById('access-form');
    if (!form) return;

    document.addEventListener('click', () => {
        document.querySelectorAll('.table-webhook-dropdown').forEach((d) => d.classList.add('hidden'));
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idInput = document.getElementById('access-tg-id');
        const select = document.getElementById('access-webhook-select');
        const userId = idInput.value.trim();
        const webhookKey = select.value;

        if (!userId) return;
        if (!webhookKey) {
            showToast('Create at least one webhook first', 'error');
            return;
        }

        try {
            await api.addUserRule(userId, webhookKey);
            idInput.value = '';
            showToast(`Rule added for ${userId}`, 'success');
            await onReload();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}