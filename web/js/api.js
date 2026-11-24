async function request(url, options = {}) {
    const res = await fetch(url, {
        headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
        ...options
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}

export const api = {
    getConfig: () => request('/api/config'),
    getLogs: (limit = 50) => request(`/api/dashboard/logs?limit=${limit}`),
    clearLogs: () => request('/api/dashboard/logs', { method: 'DELETE' }),

    addWebhook: (payload) => request('/api/webhooks', { method: 'POST', body: JSON.stringify(payload) }),
    testWebhook: (key) => request(`/api/webhooks/${encodeURIComponent(key)}/test`, { method: 'POST' }),
    deleteWebhook: (key) => request(`/api/webhooks/${encodeURIComponent(key)}`, { method: 'DELETE' }),

    updateSettings: (payload) => request('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
    saveToken: (bot_token) => request('/api/settings/token', { method: 'PUT', body: JSON.stringify({ bot_token }) }),
    testCobalt: (cobalt_url) => request('/api/settings/cobalt/test', { method: 'POST', body: JSON.stringify({ cobalt_url }) }),
    saveCobalt: (cobalt_url) => request('/api/settings/cobalt', { method: 'PUT', body: JSON.stringify({ cobalt_url }) }),

    addUserRule: (user_id, webhook_key) => request('/api/users', { method: 'POST', body: JSON.stringify({ user_id, webhook_key }) }),
    removeUserRule: (userId, webhookKey) => request(`/api/users/${encodeURIComponent(userId)}/${encodeURIComponent(webhookKey)}`, { method: 'DELETE' }),
    deleteUser: (userId) => request(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
};