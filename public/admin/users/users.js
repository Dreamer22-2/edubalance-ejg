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
            alert("Nincs jogosultságod az oldal megtekintéséhez!");
            window.location.href = '/';
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

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${userData.name || 'N/A'}</td>
                <td>${userData.email || 'N/A'}</td>
                <td>
                    <select id="role-${userId}">
                        <option value="user" ${userData.role === 'user' ? 'selected' : ''}>user</option>
                        <option value="admin" ${userData.role === 'admin' ? 'selected' : ''}>admin</option>
                    </select>
                </td>
                <td>
                    <button class="save-btn" onclick="updateUserRole('${userId}')">Mentés</button>
                </td>
            `;
            usersTableBody.appendChild(tr);
        });
    })
    .catch((error) => {
        console.error("Error fetching users:", error);
        alert("Hiba történt a felhasználók betöltése közben.");
    });
}

window.updateUserRole = function(userId) {
    const selectedRole = document.getElementById(`role-${userId}`).value;

    db.collection('users').doc(userId).update({
        role: selectedRole
    })
    .then(() => {
        alert("Szerepkör sikeresen frissítve!");
    })
    .catch((error) => {
        console.error("Error updating role:", error);
        alert("Hiba a mentés során: " + error.message);
    });
};