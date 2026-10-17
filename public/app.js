(() => {
const auth = firebase.auth();
const db = firebase.firestore();
const appLayout = document.querySelector('.app-layout');
const appMain = appLayout?.querySelector('.admin-main');
const pageTitle = appMain?.querySelector('.admin-header h1');

const schoolEmailPattern = /@e5vos\.hu$/i;

function getActiveRoute() {
    const path = window.location.pathname;
    if (path.startsWith('/admin/users')) return '/admin/users/';
    if (path.startsWith('/admin')) return '/admin/';
    return '/';
}

function renderSidebar(role) {
    const sidebar = appLayout.querySelector('.admin-sidebar');
    const activeRoute = getActiveRoute();
    const generalLinks = [
        { label: 'Főoldal', href: '/', roles: ['visitor', 'user', 'admin'] }
    ];
    const adminLinks = [
        { label: 'Admin Konzol', href: '/admin/' },
        { label: 'Felhasználók', href: '/admin/users/', subpage: true }
    ];
    const renderLink = (link) => {
        const icon = link.href === '/'
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>'
            : link.subpage
                ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2z"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V8l6-4 6 4v12M9 20v-6h6v6M9 9h.01M15 9h.01"/></svg>';
        return `
        <a class="sidebar-link${link.subpage ? ' sidebar-sublink' : ''}${link.href === activeRoute ? ' active' : ''}" href="${link.href}" aria-label="${link.label}"${link.href === activeRoute ? ' aria-current="page"' : ''}>
            ${icon}
            <span>${link.label}</span>
        </a>
    `;
    };

    sidebar.innerHTML = `
        <a class="sidebar-logo" href="/" aria-label="EduBalance kezdőlap">
            <img src="/logo.png" alt="EduBalance">
        </a>
        <nav class="sidebar-nav" aria-label="Fő navigáció">
            <div class="sidebar-main-links">
                ${generalLinks
                    .filter((link) => link.roles.includes(role))
                    .map(renderLink)
                    .join('')}
            </div>
            ${role === 'admin' ? `
                <section class="sidebar-admin-section" aria-labelledby="sidebar-admin-heading">
                    <h3 id="sidebar-admin-heading">Adminisztráció</h3>
                    <div class="sidebar-admin-links">
                        ${adminLinks.map(renderLink).join('')}
                    </div>
                </section>
            ` : ''}
        </nav>
    `;
}

function renderHeader(user) {
    const header = appMain.querySelector('.site-header');
    const loginButton = header.querySelector('#login-btn');
    const userSection = header.querySelector('#user-section');
    const userImage = header.querySelector('#user-img');
    const userName = header.querySelector('#user-name');

    if (!user) {
        loginButton.hidden = false;
        userSection.hidden = true;
        return;
    }

    loginButton.hidden = true;
    userSection.hidden = false;
    userName.textContent = user.displayName || user.email || 'Bejelentkezett felhasználó';
    if (user.photoURL) {
        userImage.src = user.photoURL;
        userImage.hidden = false;
    } else {
        userImage.removeAttribute('src');
        userImage.hidden = true;
    }
}

function initializeAppShell() {
    if (!appLayout || !appMain || appLayout.dataset.shellInitialized) return;
    appLayout.dataset.shellInitialized = 'true';
    appLayout.insertAdjacentHTML('afterbegin', '<aside class="admin-sidebar"></aside>');
    appMain.insertAdjacentHTML('afterbegin', `
        <header class="site-header">
            <div class="site-header-title"></div>
            <div class="header-account">
                <button id="login-btn" class="btn btn-login" type="button">Belépés Google-fiókkal</button>
                <div id="user-section" class="header-user" hidden>
                    <img id="user-img" alt="" hidden>
                    <span id="user-name"></span>
                    <button id="logout-btn" class="btn btn-logout" type="button">Kijelentkezés</button>
                </div>
            </div>
        </header>
    `);
    if (pageTitle) {
        const titleContainer = appMain.querySelector('.site-header-title');
        titleContainer.appendChild(pageTitle);
        pageTitle.classList.add('site-page-title');
        pageTitle.closest('.admin-header')?.remove();
        if (appMain.querySelector('#member-content')) pageTitle.hidden = true;
    }
    const scrollContent = document.createElement('div');
    scrollContent.className = 'admin-scroll-content';
    Array.from(appMain.children).forEach((child) => {
        if (!child.classList.contains('site-header')) scrollContent.appendChild(child);
    });
    appMain.appendChild(scrollContent);

    const siteHeader = appMain.querySelector('.site-header');
    const updateHeaderScrollState = () => {
        siteHeader.classList.toggle('is-scrolled', scrollContent.scrollTop > 0);
    };
    scrollContent.addEventListener('scroll', updateHeaderScrollState, { passive: true });
    updateHeaderScrollState();

    appMain.querySelector('#login-btn').addEventListener('click', () => {
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
            .catch((error) => {
                console.error('Google sign-in failed:', error);
                showToast(`Sikertelen belépés: ${error.message}`, 'error');
            });
    });

    appMain.querySelector('#logout-btn').addEventListener('click', () => {
        auth.signOut().catch((error) => {
            console.error('Sign out failed:', error);
            showToast('Nem sikerült kijelentkezni.', 'error');
        });
    });

    renderSidebar('visitor');
    renderHeader(null);
}

async function ensureUserProfile(user) {
    const userRef = db.collection('users').doc(user.uid);
    const userSnapshot = await userRef.get();
    const isSchoolUser = user.emailVerified && schoolEmailPattern.test(user.email || '');
    let profile;

    if (!userSnapshot.exists) {
        profile = {
            uid: user.uid,
            name: user.displayName || 'Névtelen felhasználó',
            email: user.email || '',
            photoURL: user.photoURL || '',
            role: isSchoolUser ? 'user' : 'visitor',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await userRef.set(profile);
        return profile.role;
    }

    profile = userSnapshot.data();
    if (isSchoolUser && profile.role === 'visitor') {
        await userRef.update({ role: 'user' });
        return 'user';
    }

    return profile.role || 'visitor';
}

function enforceRouteAccess(role) {
    const path = window.location.pathname;
    const isAdminRoute = path.startsWith('/admin');

    if (isAdminRoute && role !== 'admin') {
        window.location.replace('/');
    } else if (path.startsWith('/app')) {
        window.location.replace('/');
    }
}

function renderHomeForRole(role) {
    const visitorContent = appMain.querySelector('#visitor-content');
    const memberContent = appMain.querySelector('#member-content');
    if (!visitorContent || !memberContent) return;

    const isMember = role === 'user' || role === 'admin';
    visitorContent.hidden = isMember;
    memberContent.hidden = !isMember;
    if (pageTitle) pageTitle.hidden = !isMember;
    document.title = 'EduBalance';
}

initializeAppShell();

auth.onAuthStateChanged(async (user) => {
    renderHeader(user);
    if (!user) {
        renderSidebar('visitor');
        renderHomeForRole('visitor');
        enforceRouteAccess('visitor');
        return;
    }

    try {
        const role = await ensureUserProfile(user);
        renderSidebar(role);
        renderHomeForRole(role);
        enforceRouteAccess(role);
    } catch (error) {
        console.error('Failed to load or create the user profile:', error);
        showToast('Nem sikerült betölteni a felhasználói jogosultságokat.', 'error');
        renderSidebar('visitor');
        renderHomeForRole('visitor');
        enforceRouteAccess('visitor');
    }
});
})();
