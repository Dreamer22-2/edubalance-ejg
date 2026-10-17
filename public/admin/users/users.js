const auth = firebase.auth();
const db = firebase.firestore();

const adminContent = document.getElementById('admin-content');
const usersTableBody = document.getElementById('users-table-body');
const searchInput = document.getElementById('user-search-input');

let allUsersData = [];

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = '/';
        return;
    }

    db.collection('users').doc(user.uid).get()
    .then((doc) => {
        if (doc.exists && doc.data().role === 'admin') {
            adminContent.style.display = 'block';

            loadAllUsers();
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

function loadAllUsers() {
    db.collection('users').get()
    .then((querySnapshot) => {
        allUsersData = [];
        querySnapshot.forEach((doc) => {
            allUsersData.push({
                id: doc.id,
                ...doc.data()
            });
        });

        renderTable(allUsersData);

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = allUsersData.filter(user => {
                    const name = (user.name || '').toLowerCase();
                    const email = (user.email || '').toLowerCase();
                    return name.includes(term) || email.includes(term);
                });
                renderTable(filtered);
            });
        }
    })
    .catch((error) => {
        console.error("Error fetching users:", error);
        showToast("Hiba történt a felhasználók betöltése közben.", "error");
    });
}

function renderTable(users) {
    usersTableBody.innerHTML = '';
    
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
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>${userData.email || 'N/A'}</span>
                    ${userData.email ? `<button class="copy-btn" onclick="copyToClipboard('${userData.email}', 'Email másolva', event)" title="Email másolása" style="background:none; border:none; cursor:pointer; color:#2ed591; font-size: 0.85rem;">📋</button>` : ''}
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
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <strong>UUID:</strong> <span>${userId}</span>
                            <button class="copy-btn" onclick="copyToClipboard('${userId}', 'UUID másolva', event)" title="UUID másolása" style="background:none; border:none; cursor:pointer; color:#2ed591; font-size: 0.85rem;">📋</button>
                        </div>
                        <div style="margin-top: 6px;"><strong>Létrehozva:</strong> ${createdAtFormatted}</div>
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
        showToast("Szerepkör sikeresen frissítve!", "success");
    })
    .catch((error) => {
        console.error("Error updating role:", error);
        showToast("Hiba a mentés során: " + error.message, "error");
    });
};