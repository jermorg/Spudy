import { api } from './api.js';
import { escapeHtml, showToast, confirmAction, renderBotStatusPill } from './ui.js';

let allLogs = [];
let activeFilter = 'all';
let pollTimer = null;

function renderTable() {
    const tbody = document.getElementById('logs-table-body');
    const filtered = allLogs.filter((log) => {
        if (activeFilter === 'success') return log.status === 1;
        if (activeFilter === 'error') return log.status === 0;
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500 text-xs">No requests found</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered
        .map((log, idx) => {
            const ok = log.status === 1;
            const badge = ok
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Success</span>`
                : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Error</span>`;

            const errorNote = !ok && log.error_message
                ? `<div class="text-[11px] text-rose-400/80 mt-1 truncate max-w-md">${escapeHtml(log.error_message)}</div>`
                : '';

            const dateStr = log.created_at ? log.created_at.replace('T', ' ').split('.')[0] : '';

            return `
        <tr data-log-index="${idx}" class="hover:bg-gray-800/30 transition-colors cursor-pointer">
          <td class="p-3.5 font-mono text-xs text-gray-300 whitespace-nowrap">
            ${escapeHtml(log.username || 'User')}
            <span class="text-gray-600">(${escapeHtml(log.telegram_id)})</span>
          </td>
          <td class="p-3.5 text-blue-400 font-mono text-xs truncate max-w-[160px]">
            ${escapeHtml(log.webhook_name)}
          </td>
          <td class="p-3.5">
            <div class="max-w-md truncate font-mono text-xs bg-[#0d1117] px-2.5 py-1.5 rounded border border-gray-800 ${ok ? 'text-gray-300' : 'text-rose-300'}">
              ${escapeHtml(log.payload_preview)}
            </div>
            ${errorNote}
          </td>
          <td class="p-3.5 text-xs text-gray-500 whitespace-nowrap font-mono">${escapeHtml(dateStr)}</td>
          <td class="p-3.5 text-center whitespace-nowrap">${badge}</td>
        </tr>
      `;
        })
        .join('');

    tbody.querySelectorAll('tr[data-log-index]').forEach((row) => {
        row.addEventListener('click', () => {
            const log = filtered[Number(row.dataset.logIndex)];
            if (log) openDetailModal(log);
        });
    });
}

function openDetailModal(log) {
    const dialog = document.getElementById('log-detail-dialog');
    const content = document.getElementById('log-detail-content');
    content.innerHTML = `
    <div class="grid grid-cols-2 gap-2 text-gray-400">
      <div><span class="text-gray-500">User:</span> <span class="text-gray-200 font-mono">${escapeHtml(log.username)} (${escapeHtml(log.telegram_id)})</span></div>
      <div><span class="text-gray-500">Type:</span> <span class="text-gray-200 font-mono">${escapeHtml(log.msg_type)}</span></div>
      <div><span class="text-gray-500">Webhook:</span> <span class="text-blue-400 font-mono">${escapeHtml(log.webhook_name)}</span></div>
      <div><span class="text-gray-500">Date:</span> <span class="text-gray-200 font-mono">${escapeHtml(log.created_at)}</span></div>
    </div>
    <div>
      <div class="text-gray-500 mb-1">Payload:</div>
      <pre class="bg-[#0d1117] border border-gray-800 rounded-lg p-3 font-mono text-gray-200 whitespace-pre-wrap break-all">${escapeHtml(log.payload_preview)}</pre>
    </div>
    ${log.error_message ? `
      <div>
        <div class="text-rose-400 mb-1">Error Message:</div>
        <pre class="bg-rose-950/20 border border-rose-900/40 rounded-lg p-3 font-mono text-rose-300 whitespace-pre-wrap break-all">${escapeHtml(log.error_message)}</pre>
      </div>
    ` : ''}
  `;
    dialog.showModal();
}

async function fetchLogs(spin = false) {
    const icon = document.getElementById('refresh-icon');
    if (spin && icon) icon.classList.add('animate-spin');

    try {
        allLogs = await api.getLogs(50);
        renderTable();
    } catch (err) {
        showToast(`Failed to load logs: ${err.message}`, 'error');
    } finally {
        if (icon) setTimeout(() => icon.classList.remove('animate-spin'), 300);
    }
}

function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => fetchLogs(false), 5000);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    api.getConfig().then((cfg) => renderBotStatusPill(cfg.bot)).catch(() => { });
    await fetchLogs();
    startPolling();

    document.getElementById('refresh-logs-btn').addEventListener('click', () => fetchLogs(true));

    document.getElementById('auto-refresh-toggle').addEventListener('change', (e) => {
        if (e.target.checked) startPolling();
        else stopPolling();
    });

    document.getElementById('clear-logs-btn').addEventListener('click', async () => {
        const ok = await confirmAction('Clear request history?', 'All logged webhook requests will be permanently removed.');
        if (!ok) return;

        try {
            await api.clearLogs();
            allLogs = [];
            renderTable();
            showToast('History cleared', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    document.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            activeFilter = btn.dataset.filter;
            document.querySelectorAll('.filter-btn').forEach((b) => {
                b.classList.remove('bg-gray-800', 'text-white', 'font-medium');
                b.classList.add('text-gray-400');
            });
            btn.classList.add('bg-gray-800', 'text-white', 'font-medium');
            btn.classList.remove('text-gray-400');
            renderTable();
        });
    });
});