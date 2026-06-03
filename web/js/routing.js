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

    console.log('[API PUT] Updating routing settings:', updatedData);

    fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            console.log('Routing settings successfully saved.');
        }
    })
    .catch(err => console.error('Error saving routing settings:', err));
}