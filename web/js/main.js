$(document).ready(function() {
    $('#sidebar-menu').on('click', '.menu-btn', function() {
        const $clickedBtn = $(this);
        
        const targetPageId = $clickedBtn.data('target'); 

        $('#sidebar-menu .menu-btn')
            .removeClass('active_menu_item')
            .addClass('text-[#a5a1a8] hover:bg-[#2d2c30] hover:text-white');
        
        $clickedBtn
            .addClass('active_menu_item')
            .removeClass('text-[#a5a1a8] hover:bg-[#2d2c30] hover:text-white');

        $('.page-content').addClass('hidden');
        
        $(`#${targetPageId}`).removeClass('hidden');
    });
});
