(function () {
    function closeSidebar() {
        document.querySelector('.sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
        document.body.style.overflow = '';
    }

    function openSidebar() {
        document.querySelector('.sidebar')?.classList.add('open');
        document.getElementById('sidebarOverlay')?.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar?.classList.contains('open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!document.querySelector('.sidebar')) return;

        if (!document.getElementById('sidebarOverlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'sidebarOverlay';
            overlay.className = 'sidebar-overlay';
            overlay.addEventListener('click', closeSidebar);
            document.body.appendChild(overlay);
        }

        const topbar = document.querySelector('.topbar');
        if (topbar && !document.querySelector('.admin-menu-btn')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'admin-menu-btn';
            btn.setAttribute('aria-label', 'Open navigation menu');
            btn.innerHTML = '<i class="fa fa-bars"></i>';
            btn.addEventListener('click', toggleSidebar);
            topbar.insertBefore(btn, topbar.firstChild);
        }

        document.querySelectorAll('.nav-links a').forEach(function (link) {
            link.addEventListener('click', function () {
                if (window.innerWidth <= 768) closeSidebar();
            });
        });

        window.addEventListener('resize', function () {
            if (window.innerWidth > 768) closeSidebar();
        });
    });
})();
