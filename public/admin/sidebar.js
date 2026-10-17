// /admin/sidebar.js

const SIDEBAR_HTML = `
    <aside class="admin-sidebar">
        <h2>Admin Panel</h2>
        <nav class="sidebar-nav">
            <a href="/admin/" class="sidebar-link" data-route="overview">Áttekintés</a>
            <a href="/admin/users/" class="sidebar-link" data-route="users">Felhasználók</a>
            <a href="/" class="sidebar-link">Vissza a Főoldalra</a>
        </nav>
    </aside>
`;

function initAdminSidebar(activeRoute, onNavigate) {
    const layout = document.querySelector('.admin-layout');
    if (!layout) return;

    // Inject sidebar if it doesn't exist yet
    if (!document.querySelector('.admin-sidebar')) {
        layout.insertAdjacentHTML('afterbegin', SIDEBAR_HTML);
    }

    // Highlight active link
    document.querySelectorAll('.sidebar-link').forEach(link => {
        if (link.dataset.route === activeRoute) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }

        // SPA Navigation logic for internal admin routes
        if (link.dataset.route) {
            link.onclick = (e) => {
                e.preventDefault();
                const targetUrl = link.getAttribute('href');
                if (window.location.pathname !== targetUrl) {
                    window.history.pushState({}, '', targetUrl);
                    if (onNavigate) {
                        onNavigate(link.dataset.route);
                    } else {
                        window.location.href = targetUrl;
                    }
                }
            };
        }
    });
}