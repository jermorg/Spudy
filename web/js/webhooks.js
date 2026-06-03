// render 
function renderWebhooksTable(webhooks, webhookNames) {
    const $tbody = $('#webhooks-table-body');
    if (!$tbody.length) return;
    $tbody.empty();

    Object.keys(webhooks).forEach(key => {
        const url = webhooks[key];
        const name = webhookNames?.[key] || key;
        const rowHtml = `
            <tr class="hover:bg-gray-800/10 transition-colors">
                <td class="py-3.5 px-4 font-medium text-white">${name}</td>
                <td class="py-3.5 px-4 font-mono text-gray-500 truncate max-w-xs" title="${url}">${url}</td>
                <td class="py-3.5 px-4 text-right">
                    <button onclick="deleteWebhook('${key}')" class="text-gray-500 hover:text-rose-400 transition-colors text-[11px] cursor-pointer font-medium">Delete</button>
                </td>
            </tr>
        `;
        $tbody.append(rowHtml);
    });
}

// Delete
window.deleteWebhook = function(webhookKey) {
    if (!confirm(`Ви впевнені, що хочете видалити вебхук "${webhookKey}"?`)) return;
    
    console.log(`[API DELETE] Видалення вебхука: ${webhookKey}`);
    fetch(`/api/webhooks/${encodeURIComponent(webhookKey)}`, {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
        loadConfig();
    })
    .catch(err => console.error('Помилка видалення вебхука:', err));
};

// Create
$('#webhook_form').on('submit', function(event) {
    event.preventDefault(); 
    const nameValue = $('#wh_name').val().trim();
    const urlValue = $('#wh_url').val().trim();
    console.log('[API POST] Створення нового вебхука:', { name: nameValue, url: urlValue });
    fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: nameValue,
            url: urlValue
        })
    })
    .then(response => {
        if (!response.ok) throw new Error('Помилка при створенні вебхука');
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log(`Вебхук успішно створено. Ключ: ${data.key}`);
            $('#webhook_form')[0].reset();
            loadConfig(); 
        } else {
            alert('Помилка сервера: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Не вдалося надіслати запит:', error);
        alert('Сталася помилка мережі при додаванні вебхука.');
    });
});
