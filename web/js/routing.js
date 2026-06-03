// Render
function renderRouting(settings) {
    Object.values(ROUTING_OPTIONS).forEach(option => {
        const isEnabled = settings[option] === true;
        $(`#${option}`).prop('checked', isEnabled);
    });
}

// Change
function updateRouting() {
    const updatedData = {};

    Object.values(ROUTING_OPTIONS).forEach(option => {
        const isChecked = $(`#${option}`).is(':checked');
        updatedData[option.toLowerCase()] = isChecked;
    });

    console.log('[API PUT] Оновлення налаштувань роутингу:', updatedData);

    fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            console.log('Налаштування роутингу успішно збережено.');
        }
    })
    .catch(err => console.error('Помилка при збереженні роутингу:', err));
}