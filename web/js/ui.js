export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0';
        document.body.appendChild(container);
    }
    return container;
}

export function showToast(message, type = 'info') {
    const styles = {
        success: 'border-emerald-500/30 bg-[#161b22] text-emerald-300',
        error: 'border-rose-500/30 bg-[#161b22] text-rose-300',
        info: 'border-gray-700 bg-[#161b22] text-gray-200'
    };

    const icons = {
        success: '✓',
        error: '✕',
        info: '•'
    };

    const toast = document.createElement('div');
    toast.className = `toast-enter pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-xl text-xs font-medium ${styles[type] || styles.info}`;
    toast.innerHTML = `<span class="font-bold">${icons[type] || icons.info}</span><span class="leading-snug">${escapeHtml(message)}</span>`;

    getToastContainer().appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 3000);
}

export function confirmAction(title, description) {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'backdrop:bg-black/70 bg-[#161b22] border border-gray-800 rounded-xl p-5 shadow-2xl max-w-sm w-full text-gray-200 m-auto';
        dialog.innerHTML = `
      <h3 class="text-sm font-semibold text-white">${escapeHtml(title)}</h3>
      <p class="text-xs text-gray-400 mt-1.5 leading-relaxed">${escapeHtml(description)}</p>
      <div class="flex justify-end gap-2 mt-5">
        <button data-action="cancel" class="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer">Cancel</button>
        <button data-action="confirm" class="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white cursor-pointer">Confirm</button>
      </div>
    `;

        const cleanup = (result) => {
            dialog.close();
            dialog.remove();
            resolve(result);
        };

        dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));
        dialog.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));
        dialog.addEventListener('cancel', () => cleanup(false));

        document.body.appendChild(dialog);
        dialog.showModal();
    });
}

export function renderBotStatusPill(botStatus) {
    const pill = document.getElementById('bot-status-pill');
    if (!pill) return;

    if (botStatus?.running) {
        const label = botStatus.username ? `@${botStatus.username}` : 'Bot Online';
        pill.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
      <span class="text-gray-200 font-mono">${escapeHtml(label)}</span>
    `;
    } else {
        pill.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-amber-400"></span>
      <span class="text-amber-300">Bot Offline</span>
    `;
    }
}