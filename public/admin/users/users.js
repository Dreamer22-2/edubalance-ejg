const auth = firebase.auth();
const db = firebase.firestore();

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    auth.useEmulator("http://127.0.0.1:9099");
    db.useEmulator("127.0.0.1", 8080);
}

const loadingMsg = document.getElementById('loading-msg');
const adminContent = document.getElementById('admin-content');
const usersTableBody = document.getElementById('users-table-body');

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = '/';
        return;
    }

    db.collection('users').doc(user.uid).get()
    .then((doc) => {
        if (doc.exists && doc.data().role === 'admin') {
            loadingMsg.style.display = 'none';
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
        usersTableBody.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            const userId = doc.id;

            let createdAtFormatted = 'N/A';
            if (userData.createdAt) {
                const date = userData.createdAt.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt);
                createdAtFormatted = date.toLocaleString('hu-HU');
            }

            const userImg = userData.photoURL || 'https://via.placeholder.com/35';

            const trMain = document.createElement('tr');
            trMain.className = 'user-main-row';
            trMain.innerHTML = `
                <td style="display: flex; align-items: center; gap: 12px;">
                    <img src="${userImg}" alt="Profilkép" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 1px solid #2ed591; flex-shrink: 0;">
                    <span>${userData.name || 'N/A'}</span>
                </td>
                <td>${userData.email || 'N/A'}</td>
                <td>
                    <select id="role-${userId}" onclick="event.stopPropagation()">
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
                    <div class="details-wrapper">
                        <div class="details-content">
                            <img src="${userImg}" alt="Profilkép" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #2ed591;">
                            <div>
                                <div><strong>UUID:</strong> ${userId}</div>
                                <div style="margin-top: 5px;"><strong>Létrehozva:</strong> ${createdAtFormatted}</div>
                            </div>
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
    })
    .catch((error) => {
        console.error("Error fetching users:", error);
        showToast("Hiba történt a felhasználók betöltése közben.", "error");
    });
}

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