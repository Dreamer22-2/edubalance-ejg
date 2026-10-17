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
let allUsersData = [];
let adminUid;
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
        if (doc.exists && doc.data().role === 'admin') {
            adminContent.style.display = 'block';
            adminUid = user.uid;
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
    return `edubalance-admin-users:${adminUid}`;
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
                typeof user.role === 'string'
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
        const email = (user.email || '').toLowerCase();
        return name.includes(term) || email.includes(term);
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
        const isEven = index % 2 === 0;

        let createdAtFormatted = 'N/A';
        if (userData.createdAt) {
            const date = userData.createdAt.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt);
            createdAtFormatted = date.toLocaleString('hu-HU');
        }

        const userImg = userData.photoURL || 'https://via.placeholder.com/35';
        const rowBgColor = isEven ? 'rgba(255, 255, 255, 0.015)' : 'rgba(255, 255, 255, 0.045)';

        const trMain = document.createElement('tr');
        trMain.className = 'user-main-row';
        trMain.style.backgroundColor = rowBgColor;
        trMain.innerHTML = `
            <td style="display: flex; align-items: center; gap: 12px;">
                <img src="${userImg}" alt="Profilkép" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 1px solid #2ed591; flex-shrink: 0;">
                <span>${userData.name || 'N/A'}</span>
            </td>
            <td>
                <div class="user-email-cell">
                    <span>${userData.email || 'N/A'}</span>
                    ${userData.email ? `<button class="save-btn copy-btn" onclick="copyToClipboard('${userData.email}', 'Email másolva', event)" title="Email másolása">Másolás</button>` : ''}
                </div>
            </td>
            <td>
                <select id="role-${userId}" onclick="event.stopPropagation()">
                    <option value="visitor" ${userData.role === 'visitor' ? 'selected' : ''}>visitor</option>
                    <option value="user" ${userData.role === 'user' ? 'selected' : ''}>user</option>
                    <option value="admin" ${userData.role === 'admin' ? 'selected' : ''}>admin</option>
                </select>
            </td>
            <td onclick="event.stopPropagation()">
                <button class="save-btn" onclick="updateUserRole('${userId}')">Mentés</button>
            </td>
        `;

        const trDetails = document.createElement('tr');
        trDetails.className = 'user-details-row';
        trDetails.innerHTML = `
            <td colspan="4">
                <div class="details-wrapper" style="background-color: ${rowBgColor};">
                    <div class="details-content">
                        ${userData.email ? `
                        <div class="user-details-email">
                            <strong>Email:</strong>
                            <span>${userData.email}</span>
                            <button class="save-btn copy-btn" onclick="copyToClipboard('${userData.email}', 'Email másolva', event)" title="Email másolása">Másolás</button>
                        </div>` : ''}
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
    const selectedRole = document.getElementById(`role-${userId}`).value;

    db.collection('users').doc(userId).update({
        role: selectedRole
    })
    .then(() => {
        const user = allUsersData.find((entry) => entry.id === userId);
        if (user) {
            user.role = selectedRole;
            writeCachedUsers();
        }
        showToast("Szerepkör sikeresen frissítve!", "success");
    })
    .catch((error) => {
        console.error("Error updating role:", error);
        showToast("Hiba a mentés során: " + error.message, "error");
    });
};