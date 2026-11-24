import { api } from '../api.js';
import { showToast } from '../ui.js';

const ROUTING_ITEMS = [
    { key: 'MESSAGE_TEXT', title: 'Text Messages' },
    { key: 'MESSAGE_PHOTO', title: 'Photos & Images' },
    { key: 'MESSAGE_VIDEO', title: 'Video Files' },
    { key: 'MESSAGE_GIF', title: 'GIF Animations' },
    { key: 'MESSAGE_VIDEO_NOTE', title: 'Video Notes' },
    { key: 'TIKTOK', title: 'TikTok Links (Cobalt)' },
    { key: 'INSTAGRAM', title: 'Instagram Links (Cobalt)' }
];

let indicatorTimeout = null;

function flashSaved() {
    const el = document.getElementById('routing-save-indicator');
    if (!el) return;
    el.classList.remove('opacity-0');
    clearTimeout(indicatorTimeout);
    indicatorTimeout = setTimeout(() => el.classList.add('opacity-0'), 1500);
}

export function renderRouting(settings = {}) {
    const grid = document.getElementById('routing-grid');
    if (!grid) return;

    grid.innerHTML = ROUTING_ITEMS.map(({ key, title }) => {
        const checked = settings[key] ? 'checked' : '';
        return `
      <div class="flex items-center justify-between py-3.5 md:border-b border-gray-800/60">
        <div>
          <span class="font-medium text-gray-200 block text-xs">${title}</span>
          <span class="text-[11px] text-gray-500 font-mono">${key}</span>
        </div>
        <label class="relative inline-flex items-center cursor-pointer select-none">
          <input type="checkbox" data-routing-key="${key}" ${checked} class="sr-only peer">
          <div class="w-9 h-5 bg-[#2a292d] rounded-full border border-[#3a393d] peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-[#69606b] peer-checked:after:bg-emerald-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:border-emerald-900 transition-all"></div>
        </label>
      </div>
    `;
    }).join('');

    grid.querySelectorAll('input[data-routing-key]').forEach((checkbox) => {
        checkbox.addEventListener('change', async () => {
            const payload = {};
            grid.querySelectorAll('input[data-routing-key]').forEach((el) => {
                payload[el.dataset.routingKey.toLowerCase()] = el.checked;
            });

            checkbox.disabled = true;
            try {
                await api.updateSettings(payload);
                flashSaved();
            } catch (err) {
                checkbox.checked = !checkbox.checked;
                showToast(`Failed to save: ${err.message}`, 'error');
            } finally {
                checkbox.disabled = false;
            }
        });
    });
}