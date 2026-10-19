const auth = firebase.auth();
const db = firebase.firestore();

const adminContent = document.getElementById('admin-content');
const usersTableBody = document.getElementById('users-table-body');
const searchInput = document.getElementById('user-search-input');
const refreshButton = document.getElementById('refresh-users-btn');
const loadingIndicator = document.getElementById('users-loading');
const loadMoreButton = document.getElementById('load-more-users-btn');
const listStatus = document.getElementById('users-list-status');

const PAGE_SIZE = 20;
const CACHE_MAX_USERS = 200;
const CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const privilegedRoles = ['admin', 'dev', 'owner'];
const availableRoles = ['visitor', 'user', 'admin', 'dev', 'owner'];
let allUsersData = [];
let adminUid;
let adminRole;
let lastDocumentId = null;
let hasMoreUsers = true;
let isLoadingUsers = false;
let automaticLoadingPaused = false;
let lastLoadFailed = false;
let loadObserver;

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = '/';
        return;
    }

    db.collection('users').doc(user.uid).get()
    .then((doc) => {
        if (doc.exists && privilegedRoles.includes(doc.data().role)) {
            adminContent.style.display = 'block';
            adminUid = user.uid;
            adminRole = doc.data().role;
            initializeUserList();
        } else {
            showToast("Nincs jogosultságod az oldal megtekintéséhez!", "error");
            setTimeout(() => { window.location.href = '/'; }, 1500);
        }
    })
    .catch((error) => {
        console.error("Auth check error:", error);
        window.location.href = '/';
    });
});

function initializeUserList() {
    searchInput.addEventListener('input', renderFilteredUsers);
    usersTableBody.addEventListener('click', (event) => {
        const copyButton = event.target.closest('.profile-copy-btn');
        if (copyButton) {
            window.copyToClipboard(
                copyButton.dataset.copyValue,
                copyButton.dataset.successMessage,
                event
            );
        }
    });
    refreshButton.addEventListener('click', () => loadNextUserBatch(true));
    loadMoreButton.addEventListener('click', () => {
        automaticLoadingPaused = false;
        loadNextUserBatch();
    });

    const sentinel = document.getElementById('users-load-sentinel');
    if (sentinel && 'IntersectionObserver' in window) {
        loadObserver = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting) && !automaticLoadingPaused) {
                loadNextUserBatch();
            }
        }, { rootMargin: '160px 0px' });
        loadObserver.observe(sentinel);
    }

    const cachedList = readCachedUsers();
    if (cachedList) {
        allUsersData = cachedList.users;
        lastDocumentId = allUsersData.at(-1)?.id || null;
        hasMoreUsers = cachedList.hasMore;
        renderFilteredUsers();
        updateListControls();
    } else {
        loadNextUserBatch();
    }
}

function getCacheKey() {
    return `edubalance-admin-users:v4:${adminUid}`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function getMonogram(name) {
    const nameParts = name.trim().split(/\s+/).filter(Boolean);
    return nameParts.length > 1
        ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toLocaleUpperCase('hu-HU')
        : (nameParts[0] || '?').slice(0, 2).toLocaleUpperCase('hu-HU');
}

function renderProfileDetail(label, value, copyMessage) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const escapedValue = escapeHtml(value);
    const copyButton = copyMessage
        ? `<button class="save-btn copy-btn profile-copy-btn" type="button" data-copy-value="${escapedValue}" data-success-message="${copyMessage}" title="${copyMessage}">Másolás</button>`
        : '';
    return `<div class="user-details-profile-field"><strong>${label}:</strong><span>${escapedValue}</span>${copyButton}</div>`;
}

function getSchoolIdentifiers(user) {
    const identifiers = user.schoolIdentifiers;
    return identifiers && typeof identifiers === 'object' ? identifiers : {};
}

function readCachedUsers() {
    try {
        const rawCache = sessionStorage.getItem(getCacheKey());
        if (!rawCache) return null;

        const cache = JSON.parse(rawCache);
        const isValid = cache &&
            Number.isFinite(cache.savedAt) &&
            Date.now() - cache.savedAt < CACHE_MAX_AGE_MS &&
            Array.isArray(cache.users) &&
            cache.users.length <= CACHE_MAX_USERS &&
            typeof cache.hasMore === 'boolean' &&
            cache.users.every((user) =>
                user &&
                typeof user.id === 'string' &&
                typeof user.name === 'string' &&
                typeof user.email === 'string' &&
                typeof user.role === 'string' &&
                ['username'].every((field) =>
                    user[field] === undefined || typeof user[field] === 'string'
                ) &&
                (user.schoolIdentifiers === undefined ||
                    (user.schoolIdentifiers &&
                        typeof user.schoolIdentifiers === 'object' &&
                        ['ejgCode', 'omAzonosito'].every((field) =>
                            typeof user.schoolIdentifiers[field] === 'string'
                        )))
            );
        if (isValid) return cache;

        sessionStorage.removeItem(getCacheKey());
    } catch (error) {
        console.error('Could not read cached admin user data:', error);
    }
    return null;
}

function writeCachedUsers() {
    const cachedUsers = allUsersData.slice(0, CACHE_MAX_USERS);
    const cache = {
        savedAt: Date.now(),
        users: cachedUsers,
        hasMore: hasMoreUsers || allUsersData.length > cachedUsers.length
    };
    try {
        sessionStorage.setItem(getCacheKey(), JSON.stringify(cache));
    } catch (error) {
        console.error('Could not cache admin user data:', error);
    }
}

function updateListControls() {
    loadingIndicator.hidden = !isLoadingUsers;
    refreshButton.disabled = isLoadingUsers;
    loadMoreButton.hidden = isLoadingUsers || !hasMoreUsers;

    if (!isLoadingUsers) {
        if (lastLoadFailed) {
            listStatus.textContent = 'Nem sikerült betölteni a felhasználókat. Próbáld újra.';
        } else {
            const term = searchInput.value.trim().toLowerCase();
            const matchingCount = getFilteredUsers(term).length;
            listStatus.textContent = term
                ? `${matchingCount} találat a ${allUsersData.length} betöltött felhasználó között.`
                : hasMoreUsers
                    ? `${allUsersData.length} felhasználó betöltve.`
                    : `${allUsersData.length} felhasználó összesen.`;
        }
    }
}

function getFilteredUsers(term = searchInput.value.trim().toLowerCase()) {
    return allUsersData.filter((user) => {
        const name = (user.name || '').toLowerCase();
        const username = (user.username || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        const schoolIdentifiers = getSchoolIdentifiers(user);
        const ejgCode = (schoolIdentifiers.ejgCode || '').toLowerCase();
        const omAzonosito = (schoolIdentifiers.omAzonosito || '').toLowerCase();
        return name.includes(term) ||
            username.includes(term) ||
            email.includes(term) ||
            ejgCode.includes(term) ||
            omAzonosito.includes(term);
    });
}

function renderFilteredUsers() {
    renderTable(getFilteredUsers());
    updateListControls();
}

async function loadNextUserBatch(refresh = false) {
    if (isLoadingUsers || (!refresh && !hasMoreUsers)) return;

    isLoadingUsers = true;
    automaticLoadingPaused = false;
    lastLoadFailed = false;
    updateListControls();

    try {
        let query = db.collection('users')
            .orderBy(firebase.firestore.FieldPath.documentId())
            .limit(PAGE_SIZE);
        if (!refresh && lastDocumentId) {
            query = query.startAfter(lastDocumentId);
        }

        const querySnapshot = await query.get();
        const batch = querySnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate
                    ? data.createdAt.toDate().getTime()
                    : data.createdAt
            };
        });

        if (refresh) {
            allUsersData = batch;
        } else {
            const loadedIds = new Set(allUsersData.map((user) => user.id));
            allUsersData.push(...batch.filter((user) => !loadedIds.has(user.id)));
        }
        lastDocumentId = querySnapshot.docs.at(-1)?.id || (refresh ? null : lastDocumentId);
        hasMoreUsers = querySnapshot.size === PAGE_SIZE;
        writeCachedUsers();
        renderFilteredUsers();
    } catch (error) {
        console.error('Error fetching users:', error);
        automaticLoadingPaused = true;
        lastLoadFailed = true;
        showToast('Hiba történt a felhasználók betöltése közben.', 'error');
    } finally {
        isLoadingUsers = false;
        updateListControls();
    }
}

function renderTable(users) {
    usersTableBody.innerHTML = '';

    if (users.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="4">${allUsersData.length ? 'Nincs találat a betöltött felhasználók között.' : 'Nincs megjeleníthető felhasználó.'}</td>`;
        usersTableBody.appendChild(tr);
        return;
    }
    
    users.forEach((userData, index) => {
        const userId = userData.id;
        const isOwnerProfile = userData.role === 'owner';
        const isCurrentUser = userId === adminUid;
        const canEditOwnerRole = isOwnerProfile && isCurrentUser;
        const canPromoteToOwner = adminRole === 'owner';
        const roleOptions = availableRoles.map((role) => {
            const isDisabled = role === 'owner' && !canPromoteToOwner;
            return `<option value="${role}" ${userData.role === role ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}>${role}</option>`;
        }).join('');
        const isEven = index % 2 === 0;

        let createdAtFormatted = 'N/A';
        if (userData.createdAt) {
            const date = userData.createdAt.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt);
            createdAtFormatted = date.toLocaleString('hu-HU');
        }

        const username = typeof userData.username === 'string' ? userData.username.trim() : '';
        const fullName = typeof userData.name === 'string' ? userData.name : '';
        const primaryName = username || fullName || 'N/A';
        const secondaryName = username && fullName && username !== fullName ? fullName : '';
        const photoURL = typeof userData.photoURL === 'string' ? userData.photoURL.trim() : '';
        const monogram = getMonogram(primaryName);
        const schoolIdentifiers = getSchoolIdentifiers(userData);
        const profileIdentifiers = [
            renderProfileDetail('EJG-kód', schoolIdentifiers.ejgCode, 'EJG-kód másolva'),
            renderProfileDetail('OM azonosító', schoolIdentifiers.omAzonosito, 'OM azonosító másolva')
        ].join('');
        const rowBgColor = isEven ? 'rgba(255, 255, 255, 0.015)' : 'rgba(255, 255, 255, 0.045)';

        const trMain = document.createElement('tr');
        trMain.className = 'user-main-row';
        trMain.style.backgroundColor = rowBgColor;
        trMain.innerHTML = `
            <td style="display: flex; align-items: center; gap: 12px;">
                <span class="user-list-avatar" role="img" aria-label="${escapeHtml(primaryName)} profilképe">
                    <img alt=""${photoURL ? ` src="${escapeHtml(photoURL)}"` : ' hidden'}>
                    <span class="user-list-monogram"${photoURL ? ' hidden' : ''}>${escapeHtml(monogram)}</span>
                </span>
                <span class="user-list-name">
                    <strong>${escapeHtml(primaryName)}</strong>
                    ${secondaryName ? `<span>${escapeHtml(secondaryName)}</span>` : ''}
                </span>
            </td>
            <td>
                <div class="user-email-cell">
                    <span>${userData.email || 'N/A'}</span>
                    ${userData.email ? `<button class="save-btn copy-btn" onclick="copyToClipboard('${userData.email}', 'Email másolva', event)" title="Email másolása">Másolás</button>` : ''}
                </div>
            </td>
            <td>
                <select id="role-${userId}" onclick="event.stopPropagation()" ${isOwnerProfile && !canEditOwnerRole ? 'disabled title="Másik tulajdonos szerepköre nem módosítható."' : ''}>
                    ${roleOptions}
                </select>
            </td>
            <td onclick="event.stopPropagation()">
                <div class="user-actions">
                    <button class="save-btn" onclick="updateUserRole('${userId}')" ${isOwnerProfile && !canEditOwnerRole ? 'disabled title="Másik tulajdonos szerepköre nem módosítható."' : ''}>Mentés</button>
                    <button
                        class="delete-btn"
                        type="button"
                        ${isOwnerProfile ? 'disabled title="A tulajdonosi profil nem törölhető innen."' : isCurrentUser ? 'disabled title="A saját admin fiókod nem törölhető innen."' : `onclick="deleteUserProfile('${userId}', event)"`}
                    >Törlés</button>
                </div>
            </td>
        `;
        const avatarImage = trMain.querySelector('.user-list-avatar img');
        const avatarMonogram = trMain.querySelector('.user-list-monogram');
        avatarImage.addEventListener('error', () => {
            avatarImage.hidden = true;
            avatarMonogram.hidden = false;
        });

        const trDetails = document.createElement('tr');
        trDetails.className = 'user-details-row';
        trDetails.innerHTML = `
            <td colspan="4">
                <div class="details-wrapper" style="background-color: ${rowBgColor};">
                    <div class="details-content">
                        ${renderProfileDetail('Egyéni felhasználónév', userData.username)}
                        ${renderProfileDetail('Teljes név', userData.name)}
                        ${userData.email ? `
                        <div class="user-details-email">
                            <strong>Email:</strong>
                            <span>${userData.email}</span>
                            <button class="save-btn copy-btn" onclick="copyToClipboard('${userData.email}', 'Email másolva', event)" title="Email másolása">Másolás</button>
                        </div>` : ''}
                        ${profileIdentifiers ? `<div class="user-details-profile-fields">${profileIdentifiers}</div>` : ''}
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <strong>UUID:</strong> <span>${userId}</span>
                            <button class="save-btn copy-btn" onclick="copyToClipboard('${userId}', 'UUID másolva', event)" title="UUID másolása">Másolás</button>
                        </div>
                        <div class="user-details-created"><strong>Létrehozva:</strong> ${createdAtFormatted}</div>
                    </div>
                </div>
            </td>
        `;

        trMain.addEventListener('click', () => {
            trDetails.classList.toggle('expanded');
        });

        usersTableBody.appendChild(trMain);
        usersTableBody.appendChild(trDetails);
    });
}

window.copyToClipboard = function(text, successMessage, event) {
    event.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMessage, "success");
    }).catch(err => {
        console.error("Failed to copy: ", err);
        showToast("Nem sikerült a vágólapra másolni.", "error");
    });
};

window.updateUserRole = function(userId) {
    const user = allUsersData.find((entry) => entry.id === userId);
    if (!user) {
        showToast('A felhasználó már nincs a betöltött listában. Frissítsd a listát.', 'error');
        return;
    }

    if (user.role === 'owner' && userId !== adminUid) {
        showToast('Másik tulajdonos szerepköre nem módosítható.', 'error');
        return;
    }

    const selectedRole = document.getElementById(`role-${userId}`).value;
    if (selectedRole === 'owner' && adminRole !== 'owner') {
        showToast('Csak egy tulajdonos adhat tulajdonosi szerepkört.', 'error');
        return;
    }
    const shouldLeaveAdmin = userId === adminUid &&
        privilegedRoles.includes(adminRole) &&
        !privilegedRoles.includes(selectedRole);

    db.collection('users').doc(userId).update({
        role: selectedRole
    })
    .then(() => {
        if (user) {
            user.role = selectedRole;
            writeCachedUsers();
            renderFilteredUsers();
        }
        showToast("Szerepkör sikeresen frissítve!", "success");
        if (shouldLeaveAdmin) window.location.replace('/');
    })
    .catch((error) => {
        console.error("Error updating role:", error);
        showToast("Hiba a mentés során: " + error.message, "error");
    });
};

window.deleteUserProfile = async function(userId, event) {
    event.stopPropagation();
    if (userId === adminUid) {
        showToast('A saját admin profilod nem törölhető.', 'error');
        return;
    }

    const user = allUsersData.find((entry) => entry.id === userId);
    if (!user) {
        showToast('A felhasználó már nincs a betöltött listában. Frissítsd a listát.', 'error');
        return;
    }
    if (user.role === 'owner') {
        showToast('A tulajdonosi profil nem törölhető.', 'error');
        return;
    }

    const confirmed = window.confirm(
        `Biztosan törlöd ${user.name || user.email || 'ezt a felhasználót'} Firestore-profilját?\n\n` +
        'Ez eltávolítja a profilt az EduBalance-ból. A Firebase Authentication-fiók megmarad, ezért a felhasználó újbóli bejelentkezéskor új profilt kaphat. A művelet nem vonható vissza.'
    );
    if (!confirmed) return;

    try {
        await db.collection('users').doc(userId).delete();
        allUsersData = allUsersData.filter((entry) => entry.id !== userId);
        writeCachedUsers();
        renderFilteredUsers();
        showToast('A felhasználói profil törölve. A Firebase-fiók megmaradt.', 'success');
    } catch (error) {
        console.error('Error deleting user profile:', error);
        showToast(`Nem sikerült törölni a felhasználói profilt: ${error.message}`, 'error');
    }
};