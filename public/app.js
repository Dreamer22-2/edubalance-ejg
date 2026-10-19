(() => {
const auth = firebase.auth();
const db = firebase.firestore();
const appLayout = document.querySelector('.app-layout');
const appMain = appLayout?.querySelector('.admin-main');
const pageTitle = appMain?.querySelector('.admin-header h1');

const schoolEmailPattern = /@e5vos\.hu$/i;
const privilegedRoles = ['admin', 'dev', 'owner'];
let signedInProfile = null;

function getActiveRoute() {
    const path = window.location.pathname;
    if (path.startsWith('/admin/users')) return '/admin/users/';
    if (path.startsWith('/admin')) return '/admin/';
    if (path === '/profile' || path.startsWith('/profile/')) return '/profile';
    return '/';
}

function renderSidebar(role) {
    const sidebar = appLayout.querySelector('.admin-sidebar');
    const activeRoute = getActiveRoute();
    const generalLinks = [
        { label: 'Főoldal', href: '/', roles: ['visitor', 'user', ...privilegedRoles] },
        { label: 'Profil', href: '/profile', roles: ['user', ...privilegedRoles] }
    ];
    const adminLinks = [
        { label: 'Admin Konzol', href: '/admin/' },
        { label: 'Felhasználók', href: '/admin/users/', subpage: true }
    ];
    const renderLink = (link) => {
        const icon = link.href === '/'
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/></svg>'
            : link.href === '/profile'
                ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2z"/></svg>'
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
            ${privilegedRoles.includes(role) ? `
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
    const headerUserName = header.querySelector('#header-user-name');
    const profileMenuButton = header.querySelector('#profile-menu-btn');
    const profileMenu = header.querySelector('#profile-menu');
    const profilePageLink = header.querySelector('#profile-page-btn');

    profileMenu.hidden = true;
    profilePageLink.hidden = true;
    profileMenuButton.setAttribute('aria-expanded', 'false');
    if (!user) {
        loginButton.hidden = false;
        userSection.hidden = true;
        return;
    }

    const displayName = signedInProfile?.username?.trim() ||
        signedInProfile?.name ||
        user.displayName ||
        user.email ||
        'Bejelentkezett felhasználó';
    const nameParts = displayName.trim().split(/\s+/).filter(Boolean);
    loginButton.hidden = true;
    userSection.hidden = false;
    userName.textContent = displayName;
    headerUserName.textContent = displayName;
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
                <button id="login-btn" class="btn btn-login" type="button">
                    <span class="login-label-full">Belépés Google-fiókkal</span>
                    <span class="login-label-compact">Belépés</span>
                </button>
                <div id="user-section" class="header-user" hidden>
                    <span id="header-user-name" class="header-user-name"></span>
                    <button id="profile-menu-btn" class="profile-menu-trigger" type="button" aria-label="Profilmenü" aria-expanded="false" aria-controls="profile-menu">
                        <img id="user-img" alt="" hidden>
                        <span id="user-monogram" class="user-monogram" hidden></span>
                    </button>
                    <div id="profile-menu" class="profile-menu" hidden>
                        <div id="user-name" class="profile-menu-name"></div>
                        <a id="profile-page-btn" class="profile-menu-item" href="/profile" hidden>Profil</a>
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
        if (appMain.querySelector('#member-content') ||
            (window.location.pathname === '/profile' || window.location.pathname.startsWith('/profile/'))) {
            pageTitle.hidden = true;
        }
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
        return profile;
    }

    profile = userSnapshot.data();
    if (isSchoolUser && profile.role === 'visitor') {
        await userRef.update({ role: 'user' });
        profile.role = 'user';
    }

    profile.role = profile.role || 'visitor';
    return profile;
}

async function loadProfileSettings(user) {
    const profileForm = appMain.querySelector('#profile-form');
    if (!profileForm) return;

    const profileFields = profileForm.querySelector('#profile-fields');
    const profileStatus = profileForm.querySelector('#profile-status');
    try {
        const profileSnapshot = await db.collection('users').doc(user.uid).get();
        if (!profileSnapshot.exists) {
            throw new Error('The user profile document does not exist.');
        }

        const profile = profileSnapshot.data();
        signedInProfile = profile;
        renderHeader(user);
        appMain.querySelector('#profile-full-name').textContent =
            profile.name || user.displayName || 'Névtelen felhasználó';

        const schoolIdentifiers = profile.schoolIdentifiers;
        if (schoolIdentifiers !== undefined &&
            (!schoolIdentifiers ||
                typeof schoolIdentifiers !== 'object' ||
                Array.isArray(schoolIdentifiers) ||
                typeof schoolIdentifiers.ejgCode !== 'string' ||
                typeof schoolIdentifiers.omAzonosito !== 'string' ||
                Object.keys(schoolIdentifiers).some((field) =>
                    !['ejgCode', 'omAzonosito'].includes(field)
                ))) {
            throw new Error('Profile school identifiers have an invalid format.');
        }

        const profileInputs = [
            ['#profile-username', profile.username],
            ['#profile-ejg-code', schoolIdentifiers?.ejgCode],
            ['#profile-om-identifier', schoolIdentifiers?.omAzonosito]
        ];
        profileInputs.forEach(([selector, value]) => {
            if (value !== undefined && typeof value !== 'string') {
                throw new Error('A profile field is not a string.');
            }
            appMain.querySelector(selector).value = value || '';
        });
        profileFields.disabled = false;
        profileStatus.textContent = '';
    } catch (error) {
        console.error('Failed to load profile settings:', error);
        profileStatus.textContent = 'Nem sikerült betölteni a profiladatokat.';
        showToast('Nem sikerült betölteni a profiladatokat.', 'error');
    }
}

function initializeProfileForm() {
    const profileForm = appMain.querySelector('#profile-form');
    if (!profileForm) return;

    profileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const user = auth.currentUser;
        if (!user) {
            showToast('A mentéshez be kell jelentkezned.', 'error');
            return;
        }

        const profileFields = profileForm.querySelector('#profile-fields');
        const profileStatus = profileForm.querySelector('#profile-status');
        const saveButton = profileForm.querySelector('#profile-save-btn');
        const ejgCode = profileForm.querySelector('#profile-ejg-code').value.trim();
        const omAzonosito = profileForm.querySelector('#profile-om-identifier').value.trim();
        if (Boolean(ejgCode) !== Boolean(omAzonosito)) {
            profileStatus.textContent = 'Az EJG-kódot és az OM azonosítót együtt kell megadnod.';
            showToast('Az EJG-kódot és az OM azonosítót együtt kell megadnod.', 'error');
            return;
        }

        saveButton.disabled = true;
        profileFields.disabled = true;
        profileStatus.textContent = 'Mentés folyamatban...';

        try {
            await db.collection('users').doc(user.uid).update({
                username: profileForm.querySelector('#profile-username').value.trim(),
                schoolIdentifiers: { ejgCode, omAzonosito }
            });
            const updatedProfile = {
                ...signedInProfile,
                username: profileForm.querySelector('#profile-username').value.trim(),
                schoolIdentifiers: { ejgCode, omAzonosito }
            };
            signedInProfile = updatedProfile;
            renderHeader(user);
            profileStatus.textContent = 'A profiladatok mentése sikerült.';
            showToast('A profiladatok mentése sikerült.', 'success');
        } catch (error) {
            console.error('Failed to save profile settings:', error);
            profileStatus.textContent = 'Nem sikerült menteni a profiladatokat.';
            showToast('Nem sikerült menteni a profiladatokat.', 'error');
        } finally {
            saveButton.disabled = false;
            profileFields.disabled = false;
        }
    });
}

function initializeTimetable() {
    const button = appMain.querySelector('#load-timetable-btn');
    const help = appMain.querySelector('#timetable-help');
    const status = appMain.querySelector('#timetable-status');
    const results = appMain.querySelector('#timetable-results');
    if (!button || !help || !status || !results) return;

    function updateAvailability(profile) {
        const identifiers = profile?.schoolIdentifiers;
        const hasIdentifiers = typeof identifiers?.ejgCode === 'string' &&
            identifiers.ejgCode.trim().length > 0 &&
            typeof identifiers?.omAzonosito === 'string' &&
            identifiers.omAzonosito.trim().length > 0;

        button.disabled = !hasIdentifiers;
        help.textContent = hasIdentifiers
            ? 'Az órarend csak a saját fiókodhoz mentett azonosítókkal kérhető le.'
            : 'Az órarend betöltéséhez töltsd ki az EJG-kódot és az OM azonosítót a profilodban.';
    }

    function render(days) {
        if (!Array.isArray(days) || days.length !== 5 ||
            days.some((day) =>
                typeof day?.name !== 'string' ||
                !Array.isArray(day.lessons) ||
                day.lessons.some((lesson) =>
                    !Number.isInteger(lesson.period) ||
                    typeof lesson.subject !== 'string' ||
                    typeof lesson.teacher !== 'string'
                )
            )) {
            throw new Error('A kapott órarend formátuma nem megfelelő.');
        }

        const fragment = document.createDocumentFragment();
        days.forEach((day) => {
            const daySection = document.createElement('section');
            daySection.className = 'timetable-day';

            const heading = document.createElement('h3');
            heading.textContent = day.name;
            daySection.append(heading);

            if (day.lessons.length === 0) {
                const emptyMessage = document.createElement('p');
                emptyMessage.className = 'timetable-empty';
                emptyMessage.textContent = 'Nincs óra.';
                daySection.append(emptyMessage);
            } else {
                const lessonList = document.createElement('ol');
                lessonList.className = 'timetable-lessons';
                day.lessons.forEach((lesson) => {
                    const item = document.createElement('li');
                    const period = document.createElement('span');
                    period.className = 'timetable-period';
                    period.textContent = `${lesson.period}. óra`;
                    item.append(period);

                    const subject = document.createElement('strong');
                    subject.textContent = lesson.subject;
                    item.append(subject);

                    if (lesson.teacher) {
                        const teacher = document.createElement('span');
                        teacher.className = 'timetable-teacher';
                        teacher.textContent = lesson.teacher;
                        item.append(teacher);
                    }
                    lessonList.append(item);
                });
                daySection.append(lessonList);
            }
            fragment.append(daySection);
        });

        results.replaceChildren(fragment);
        results.hidden = false;
    }

    button.addEventListener('click', async () => {
        if (!auth.currentUser || button.disabled) return;

        button.disabled = true;
        status.textContent = 'Órarend betöltése...';
        results.hidden = true;
        results.replaceChildren();

        try {
            const callable = firebase.app().functions('europe-central2').httpsCallable('getMyTimetable');
            const response = await callable({});
            render(response.data?.days);
            status.textContent = 'Az órarend betöltése sikerült.';
        } catch (error) {
            console.error('Failed to load the signed-in user timetable:', error);
            status.textContent = typeof error?.message === 'string'
                ? error.message
                : 'Nem sikerült betölteni az órarendet. Próbáld újra később.';
        } finally {
            updateAvailability(signedInProfile);
        }
    });

    updateAvailability(signedInProfile);
    return updateAvailability;
}

function enforceRouteAccess(role) {
    const path = window.location.pathname;
    const isAdminRoute = path.startsWith('/admin');
    const isProfileRoute = path === '/profile' || path.startsWith('/profile/');

    if (isAdminRoute && !privilegedRoles.includes(role)) {
        window.location.replace('/');
    } else if (isProfileRoute && role !== 'user' && !privilegedRoles.includes(role)) {
        window.location.replace('/');
    } else if (path.startsWith('/app')) {
        window.location.replace('/');
    }
}

function renderHomeForRole(role) {
    const profileContent = appMain.querySelector('#profile-content');
    const isProfileRoute = window.location.pathname === '/profile' || window.location.pathname.startsWith('/profile/');
    const canViewProfile = role === 'user' || privilegedRoles.includes(role);
    if (profileContent) profileContent.hidden = !isProfileRoute || !canViewProfile;

    const visitorContent = appMain.querySelector('#visitor-content');
    const memberContent = appMain.querySelector('#member-content');
    const isMember = role === 'user' || privilegedRoles.includes(role);
    if (visitorContent && memberContent) {
        visitorContent.hidden = isMember;
        memberContent.hidden = !isMember;
    }

    if (pageTitle) {
        pageTitle.hidden = isProfileRoute
            ? !canViewProfile
            : memberContent
                ? !isMember
                : false;
    }
    if (isProfileRoute) {
        document.title = 'Profil - EduBalance';
    } else if (visitorContent && memberContent) {
        document.title = 'EduBalance';
    }
}

initializeAppShell();
initializeProfileForm();
const updateTimetableAvailability = initializeTimetable();

auth.onAuthStateChanged(async (user) => {
    signedInProfile = null;
    updateTimetableAvailability?.(null);
    renderHeader(user);
    if (!user) {
        renderSidebar('visitor');
        renderHomeForRole('visitor');
        enforceRouteAccess('visitor');
        return;
    }

    try {
        signedInProfile = await ensureUserProfile(user);
        updateTimetableAvailability?.(signedInProfile);
        renderHeader(user);
        const role = signedInProfile.role;
        appMain.querySelector('#profile-page-btn').hidden = role !== 'user' && !privilegedRoles.includes(role);
        renderSidebar(role);
        renderHomeForRole(role);
        enforceRouteAccess(role);
        if (role === 'user' || privilegedRoles.includes(role)) {
            await loadProfileSettings(user);
        }
    } catch (error) {
        console.error('Failed to load or create the user profile:', error);
        showToast('Nem sikerült betölteni a felhasználói jogosultságokat.', 'error');
        appMain.querySelector('#profile-page-btn').hidden = true;
        renderSidebar('visitor');
        renderHomeForRole('visitor');
        enforceRouteAccess('visitor');
    }
});
})();
