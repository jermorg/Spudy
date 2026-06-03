function renderUsersTable(users, allWebhooks, webhookNames) {
    const $tbody = $('#users-table-body');
    if (!$tbody.length) return;
    
    $tbody.empty();

    if (!users.hasOwnProperty('0')) {
        users['0'] = [];
    }

    function generateUserRowHtml(userId, assignedKeys, isStaticUser = false) {
        let checkboxesHtml = '';
        let selectedNames = [];

        Object.keys(allWebhooks).forEach(key => {
            const isChecked = assignedKeys.includes(key);
            const name = webhookNames?.[key] || key;
            if (isChecked) selectedNames.push(name);

            checkboxesHtml += `
                <label class="flex items-center space-x-2.5 px-2 py-1.5 rounded hover:bg-gray-800/20 text-xs text-gray-300 cursor-pointer select-none transition-colors">
                    <input type="checkbox" value="${key}" ${isChecked ? 'checked' : ''} onchange="handleTableWebhookToggle(this)" class="w-3.5 h-3.5 rounded bg-gray-800/20 border-gray-800/90 text-blue-500 focus:ring-0 cursor-pointer">
                    <span class="truncate">${name}</span>
                </label>`;
        });

        const buttonText = selectedNames.length > 0 ? selectedNames.join(', ') : 'Select Webhooks...';
        const textClass = selectedNames.length > 0 ? 'text-gray-200' : 'text-gray-400';
        const userbgColorAHover = isStaticUser ? 'bg-blue-900/10 hover:bg-blue-900/20' : 'hover:bg-gray-800/10';
        const userDisplayId = isStaticUser ? '0 (Any User)' : userId;
        
        const deleteButtonHtml = isStaticUser ? '' 
            : `<button type="button" onclick="deleteUserCompletely('${userId}')" class="text-gray-500 hover:text-rose-400 transition-colors text-[11px] cursor-pointer font-medium">Delete</button>`;

        return `
            <tr data-user-id="${userId}" class="${userbgColorAHover} transition-colors">
                <td class="py-3.5 px-4 font-mono text-gray-500">${userDisplayId}</td>
                <td class="py-3.5 px-4 relative table-dropdown-container">
                    <button type="button" onclick="toggleTableDropdown(this)" class="w-full h-[34px] bg-gray-800/20 border border-gray-800/90 px-3 py-2 rounded-md text-xs ${textClass} flex items-center justify-between hover:text-white cursor-pointer transition-colors text-left outline-none focus:border-gray-500">
                        <span class="truncate selected-text">${buttonText}</span>
                        <svg class="w-3 h-3 text-gray-500 flex-shrink-0 ml-2" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </button>
                    <div class="table-webhook-dropdown hidden absolute left-4 right-4 mt-1 bg-[#101720] border border-gray-800/90 rounded-md shadow-xl z-50 p-2 space-y-1">${checkboxesHtml}</div>
                </td>
                <td class="py-3.5 px-4 text-right">
                    ${deleteButtonHtml}
                </td>
            </tr>`;
    }

    $tbody.append(generateUserRowHtml('0', users['0'], true));

    Object.keys(users).forEach(userId => {
        if (userId === '0') return;

        const assignedKeys = users[userId] || [];
        $tbody.append(generateUserRowHtml(userId, assignedKeys, false));
    });
}



function handleTableWebhookToggle(checkbox) {
    const $checkbox = $(checkbox);
    const isChecked = $checkbox.is(':checked');
    const webhookKey = $checkbox.val();
    const $row = $checkbox.closest('tr');
    const userId = $row.data('user-id').toString();

    const url = isChecked ? '/api/users' : `/api/users/${encodeURIComponent(userId)}/${encodeURIComponent(webhookKey)}`;
    const method = isChecked ? 'POST' : 'DELETE';
    const body = isChecked ? JSON.stringify({ user_id: userId, webhook_key: webhookKey }) : null;

    fetch(url, {
        method,
        headers: isChecked ? { 'Content-Type': 'application/json' } : undefined,
        body
    }).catch(err => console.error(err));

    const selected = [];
    $row.find('.table-webhook-dropdown input[type="checkbox"]:checked').each(function() {
        selected.push($(this).next('span').text().trim());
    });
    
    $row.find('.selected-text').text(selected.length > 0 ? selected.join(', ') : 'Select Webhooks...');
    $row.find('button:first').toggleClass('text-gray-200', selected.length > 0).toggleClass('text-gray-400', selected.length === 0);
};

function deleteUserCompletely(userId) {
    if (userId.toLowerCase() === 'all' || userId === '0') return;
    if (!confirm(`Delete user ${userId}?`)) return;

    fetch(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
        .then(() => loadConfig())
        .catch(err => console.error(err));
};



function toggleTableDropdown(button) {
    if (window.event) window.event.stopPropagation();
    const $current = $(button).next('.table-webhook-dropdown');
    $('.table-webhook-dropdown').not($current).addClass('hidden');
    $current.toggleClass('hidden');
};

$(document).on('click', e => {
    if (!$(e.target).closest('.table-webhook-dropdown, button').length) $('.table-webhook-dropdown').addClass('hidden');
});



$(document).ready(() => {
    $('#access_form').on('submit', function(e) {
        e.preventDefault();
        const tgId = $('#access_tg_id').val().trim();
        const webhookKeys = GLOBAL_CONFIG?.webhooks ? Object.keys(GLOBAL_CONFIG.webhooks) : [];
        const webhookKey = webhookKeys.length > 0 ? webhookKeys[0] : "";
        if (!tgId || !webhookKey) return;

        fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: tgId, webhook_key: webhookKey })
        })
        .then(() => {
            this.reset();
            loadConfig();
        })
        .catch(err => console.error(err));
    });
});