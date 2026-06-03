function saveGlobalConfig() {
    const $tokenInput = $('#telegram_token');
    const tokenValue = $tokenInput.val() ? $tokenInput.val().trim() : '';

    if (!tokenValue) {
        alert('Будь ласка, введіть токен бота перед збереженням.');
        return;
    }

    const $btn = $('button[onclick="saveGlobalConfig()"]');
    $btn.prop('disabled', true).css('opacity', '0.7');

    $.ajax({
        url: '/api/settings/token',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ bot_token: tokenValue }),
        success: function(response) {
            if (response.success) {
                $tokenInput.val('');
                
                const dialog = document.getElementById('restart-dialog');
                if (dialog) {
                    dialog.showModal();
                } else {
                    alert('Токен збережено! Перезапустіть Docker-контейнер.');
                }
            }
        },
        error: function(xhr) {
            const errorMsg = xhr.responseJSON?.error || 'Помилка при збереженні токена';
            alert('❌ ' + errorMsg);
        },
        complete: function() {
            $btn.prop('disabled', false).css('opacity', '1');
        }
    });
}

function togglePasswordVisibility() {
    const input = document.getElementById('telegram_token');
    if (!input) return;
    
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

function saveCobaltConfig() {
    const $cobaltInput = $('#cobalt_url');
    const cobaltValue = $cobaltInput.val() ? $cobaltInput.val().trim() : '';

    if (!cobaltValue) {
        alert('Please enter the Cobalt API Link before saving.');
        return;
    }

    const $btn = $('button[onclick="saveCobaltConfig()"]');
    
    $btn.prop('disabled', true).css('opacity', '0.5').text('Testing connection...');

    $.ajax({
        url: `${cobaltValue}/ping`,
        method: 'GET',
        timeout: 5000
    })
    .done(function() {
        $btn.text('Saving...');

        $.ajax({
            url: '/api/settings/cobalt',
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ cobalt_url: cobaltValue }),
            success: function(response) {
                if (response.success) {
                    $btn.text('Success!').removeClass('bg-[#2563eb]').addClass('bg-green-600');
                    alert('Cobalt URL successfully tested and saved!');
                }
            },
            error: function(xhr) {
                const errorMsg = xhr.responseJSON?.error || 'error saving Cobalt URL';
                alert('❌ ' + errorMsg);
                $btn.text('Failed').removeClass('bg-[#2563eb]').addClass('bg-rose-600');
            },
            complete: function() {
                resetCobaltButton($btn);
            }
        });
    })
    .fail(function(xhr, status, error) {
        console.error('Cobalt ping error:', error);
        alert('❌ Failed to connect to Cobalt API. Please check the URL or container status.');
        $btn.text('Test Failed').removeClass('bg-[#2563eb]').addClass('bg-rose-600');        
        resetCobaltButton($btn);
    });
}

function resetCobaltButton($btn) {
    setTimeout(() => {
        $btn.prop('disabled', false)
            .css('opacity', '1')
            .text('Save')
            .removeClass('bg-green-600 bg-rose-600')
            .addClass('bg-[#2563eb]');
    }, 2500);
}