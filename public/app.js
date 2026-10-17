(() => {
const auth = firebase.auth();
const db = firebase.firestore();
const appLayout = document.querySelector('.app-layout');
const appMain = appLayout?.querySelector('.admin-main');

const schoolEmailPattern = /@e5vos\.hu$/i;

function getActiveRoute() {
    const path = window.location.pathname;
    if (path.startsWith('/admin/users')) return '/admin/users/';
    if (path.startsWith('/admin')) return '/admin/';
    if (path.startsWith('/app')) return '/app/';
    return '/';
}

function renderSidebar(role) {
    const sidebar = appLayout.querySelector('.admin-sidebar');
    const activeRoute = getActiveRoute();
    const links = [
        { label: 'Kezdőlap', href: '/', roles: ['visitor', 'user', 'admin'] },
        { label: 'Alkalmazás', href: '/app/', roles: ['user', 'admin'] },
        { label: 'Admin áttekintés', href: '/admin/', roles: ['admin'] },
        { label: 'Felhasználók', href: '/admin/users/', roles: ['admin'] }
    ];

    sidebar.innerHTML = `
        <h2>EduBalance</h2>
        <nav class="sidebar-nav" aria-label="Fő navigáció">
            ${links
                .filter((link) => link.roles.includes(role))
                .map((link) => `<a class="sidebar-link${link.href === activeRoute ? ' active' : ''}" href="${link.href}">${link.label}</a>`)
                .join('')}
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
            <a class="site-brand" href="/" aria-label="EduBalance kezdőlap">EduBalance</a>
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
    const isAppRoute = path.startsWith('/app');

    if (isAdminRoute && role !== 'admin') {
        window.location.replace('/');
    } else if (isAppRoute && role !== 'user' && role !== 'admin') {
        window.location.replace('/');
    } else if (isAppRoute) {
        appMain.hidden = false;
    }
}

initializeAppShell();

auth.onAuthStateChanged(async (user) => {
    renderHeader(user);
    if (!user) {
        renderSidebar('visitor');
        enforceRouteAccess('visitor');
        return;
    }

    try {
        const role = await ensureUserProfile(user);
        renderSidebar(role);
        enforceRouteAccess(role);
    } catch (error) {
        console.error('Failed to load or create the user profile:', error);
        showToast('Nem sikerült betölteni a felhasználói jogosultságokat.', 'error');
        renderSidebar('visitor');
        enforceRouteAccess('visitor');
    }
});
})();
