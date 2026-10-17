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
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/></svg>'
            : link.subpage
                ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2z"/></svg>'
                : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V8l6-4 6 4v12"/><path d="M9 20v-6h6v6M9 9h.01M15 9h.01"/></svg>';
        return `
        <a class="sidebar-link${link.subpage ? ' sidebar-sublink' : ''}${link.href === activeRoute ? ' active' : ''}" href="${link.href}"${link.href === activeRoute ? ' aria-current="page"' : ''}>
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
    const userMonogram = header.querySelector('#user-monogram');
    const userName = header.querySelector('#user-name');
    const profileMenuButton = header.querySelector('#profile-menu-btn');
    const profileMenu = header.querySelector('#profile-menu');

    profileMenu.hidden = true;
    profileMenuButton.setAttribute('aria-expanded', 'false');
    if (!user) {
        loginButton.hidden = false;
        userSection.hidden = true;
        return;
    }

    const displayName = user.displayName || user.email || 'Bejelentkezett felhasználó';
    const nameParts = displayName.trim().split(/\s+/).filter(Boolean);
    loginButton.hidden = true;
    userSection.hidden = false;
    userName.textContent = displayName;
    profileMenuButton.setAttribute('aria-label', `${displayName} profilmenü`);
    userMonogram.textContent = nameParts.length > 1
        ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toLocaleUpperCase('hu-HU')
        : (nameParts[0] || '?').slice(0, 2).toLocaleUpperCase('hu-HU');
    if (user.photoURL) {
        userImage.src = user.photoURL;
        userImage.hidden = false;
        userMonogram.hidden = true;
    } else {
        userImage.removeAttribute('src');
        userImage.hidden = true;
        userMonogram.hidden = false;
    }
}

function initializeAppShell() {
    if (!appLayout || !appMain || appLayout.dataset.shellInitialized) return;
    appLayout.dataset.shellInitialized = 'true';
    appLayout.insertAdjacentHTML('afterbegin', '<aside class="admin-sidebar"></aside>');
    appMain.insertAdjacentHTML('afterbegin', `
        <header class="site-header">
            <div class="site-header-brand">
                <div class="site-header-title"></div>
                <a class="site-header-logo" href="/" aria-label="EduBalance kezdőlap">
                    <img src="/logo.png" alt="EduBalance">
                </a>
            </div>
            <div class="header-account">
                <button id="login-btn" class="btn btn-login" type="button">Belépés Google-fiókkal</button>
                <div id="user-section" class="header-user" hidden>
                    <button id="profile-menu-btn" class="profile-menu-trigger" type="button" aria-label="Profilmenü" aria-expanded="false" aria-controls="profile-menu">
                        <img id="user-img" alt="" hidden>
                        <span id="user-monogram" class="user-monogram" hidden></span>
                    </button>
                    <div id="profile-menu" class="profile-menu" hidden>
                        <div id="user-name" class="profile-menu-name"></div>
                        <button id="profile-page-btn" class="profile-menu-item" type="button" disabled>Profil — hamarosan</button>
                        <button id="logout-btn" class="profile-menu-item" type="button">Kijelentkezés</button>
                    </div>
                </div>
            </div>
        </header>
    `);
    const titleHeader = pageTitle?.closest('.admin-header');
    if (pageTitle) {
        const titleContainer = appMain.querySelector('.site-header-title');
        titleContainer.appendChild(pageTitle);
        pageTitle.classList.add('site-page-title');
        titleHeader?.remove();
        if (appMain.querySelector('#member-content')) pageTitle.hidden = true;
    }
    const scrollContent = document.createElement('div');
    scrollContent.className = 'admin-scroll-content';
    Array.from(appMain.children).forEach((child) => {
        if (!child.classList.contains('site-header')) scrollContent.appendChild(child);
    });
    appMain.appendChild(scrollContent);

    const userImage = appMain.querySelector('#user-img');
    const userMonogram = appMain.querySelector('#user-monogram');
    userImage.addEventListener('error', () => {
        userImage.hidden = true;
        userMonogram.hidden = false;
    });

    const siteHeader = appMain.querySelector('.site-header');
    const titleContainer = appMain.querySelector('.site-header-title');
    const mobileLayout = window.matchMedia('(max-width: 720px)');
    const updateResponsiveTitle = () => {
        if (!pageTitle) return;
        if (mobileLayout.matches) {
            scrollContent.prepend(pageTitle);
            pageTitle.classList.add('mobile-page-title');
        } else {
            titleContainer.appendChild(pageTitle);
            pageTitle.classList.remove('mobile-page-title');
        }
    };
    mobileLayout.addEventListener('change', updateResponsiveTitle);
    updateResponsiveTitle();

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

    const profileMenuButton = appMain.querySelector('#profile-menu-btn');
    const profileMenu = appMain.querySelector('#profile-menu');
    const setProfileMenuOpen = (isOpen) => {
        profileMenu.hidden = !isOpen;
        profileMenuButton.setAttribute('aria-expanded', String(isOpen));
    };
    profileMenuButton.addEventListener('click', () => {
        setProfileMenuOpen(profileMenu.hidden);
    });
    document.addEventListener('click', (event) => {
        if (!profileMenu.contains(event.target) && !profileMenuButton.contains(event.target)) {
            setProfileMenuOpen(false);
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setProfileMenuOpen(false);
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
