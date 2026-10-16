// =========================================================================
// 1. FIREBASE SETUP (AUTH & FIRESTORE)
// =========================================================================
const auth = firebase.auth();
const db = firebase.firestore(); // Initialize Firestore database connection

// Force connection to local emulators if testing locally
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    auth.useEmulator("http://127.0.0.1:9099");
    db.useEmulator("127.0.0.1", 8080); // Connects to the local Firestore database
}

const provider = new firebase.auth.GoogleAuthProvider();

// =========================================================================
// 2. DOM ELEMENTS
// =========================================================================
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userSection = document.getElementById('user-section');
const userNameDisplay = document.getElementById('user-name');
const userImgDisplay = document.getElementById('user-img');

// =========================================================================
// 3. AUTHENTICATION FUNCTIONS & FIRESTORE USER PROFILE CREATION
// =========================================================================
function signInWithGoogle() {
    auth.signInWithPopup(provider)
    .then((result) => {
        console.log("Popup login completed.");
        const user = result.user;
        
        // Check if user document exists in Firestore, if not create it
        const userRef = db.collection('users').doc(user.uid);
        userRef.get().then((doc) => {
            if (!doc.exists) {
                // First time login: Create user profile document in Firestore
                return userRef.set({
                    uid: user.uid,
                    name: user.displayName || "Névtelen Felhasználó",
                    email: user.email || "",
                    photoURL: user.photoURL || "",
                    role: "user", // Default role
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }).catch((error) => {
            console.error("Error creating/checking user document:", error);
        });

    })
    .catch((error) => {
        console.error("Authentication Error:", error.message);
        alert("Sikertelen belépés: " + error.message);
    });
}

function signOut() {
    auth.signOut()
    .then(() => {
        console.log("Sign out sequence completed.");
    })
    .catch((error) => {
        console.error("Sign Out Error:", error.message);
    });
}

// =========================================================================
// 4. AUTH STATE LISTENER WITH ROLE DETECTION
// =========================================================================
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("User logged in:", user.uid);

        // 1. Show UI elements immediately using generic fallback greeting while we fetch data
        if (loginBtn) loginBtn.style.setProperty('display', 'none', 'important');
        if (userSection) userSection.style.setProperty('display', 'block', 'important');
        if (logoutBtn) logoutBtn.style.setProperty('display', 'inline-flex', 'important');
        if (userNameDisplay) userNameDisplay.innerText = `Szia, ${user.displayName}!`;
        if (userImgDisplay) {
            userImgDisplay.src = user.photoURL || 'https://placeholder.com';
            userImgDisplay.alt = user.displayName;
        }

        // 2. Fetch the user's role document from Firestore database
        db.collection('users').doc(user.uid).get()
        .then((doc) => {
            if (doc.exists && doc.data().role === 'admin') {
                // USER IS AN ADMIN 👑 -> Change greeting text format
                console.log("Admin role verified for user.");
                if (userNameDisplay) userNameDisplay.innerText = `Üdvözöljük, ${user.displayName} Adminisztrátor Úr!\n\nBtw 👌`;
                
                // Optional: Automatically redirect or show admin navigation if on admin paths
                checkAdminRouteProtection(true);
            } else {
                // USER IS A REGULAR USER 👥 -> Keep standard greeting
                console.log("Standard user role verified.");
                if (userNameDisplay) userNameDisplay.innerText = `Szia, ${user.displayName}!`;
                checkAdminRouteProtection(false);
            }
        })
        .catch((error) => {
            console.error("Error loading user role from Firestore:", error);
        });

    } else {
        console.log("No user logged in. Resetting UI view.");
        if (loginBtn) loginBtn.style.setProperty('display', 'inline-flex', 'important');
        if (userSection) userSection.style.setProperty('display', 'none', 'important');
        if (logoutBtn) logoutBtn.style.setProperty('display', 'none', 'important');
        if (userNameDisplay) userNameDisplay.innerText = '';
        if (userImgDisplay) userImgDisplay.src = '';
        
        checkAdminRouteProtection(false);
    }
});

// =========================================================================
// 5. ADMIN ROUTE PROTECTION & MANAGEMENT TOOLS
// =========================================================================
function checkAdminRouteProtection(isAdmin) {
    const currentPath = window.location.pathname;
    const isAdminRoute = currentPath.startsWith('/admin');

    if (isAdminRoute && !isAdmin) {
        // If user tries to access /admin or /admin/users without admin rights, redirect home
        console.warn("Unauthorized access attempt to admin panel. Redirecting...");
        window.location.href = '/';
    } else if (isAdminRoute && isAdmin) {
        // Load admin management tools if we are on the user management subpage
        if (currentPath.includes('/admin/users')) {
            loadAdminUserManagementTools();
        }
    }
}

// Function to fetch all users for Admin User Management Panel
function loadAdminUserManagementTools() {
    console.log("Initializing Admin User Management Tool...");
    const userTableContainer = document.getElementById('admin-user-list');
    if (!userTableContainer) return;

    userTableContainer.innerHTML = "<p>Felhasználók betöltése...</p>";

    db.collection('users').get().then((querySnapshot) => {
        let html = `<table class="admin-table">
            <thead>
                <tr>
                    <th>Név / E-mail</th>
                    <th>Szerepkör (Role)</th>
                    <th>Műveletek</th>
                </tr>
            </thead>
            <tbody>`;

        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            html += `<tr>
                <td>
                    <strong>${userData.name || 'N/A'}</strong><br>
                    <small>${userData.email || ''}</small>
                </td>
                <td>
                    <select onchange="updateUserRole('${userData.uid}', this.value)">
                        <option value="user" ${userData.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${userData.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </td>
                <td>
                    <button onclick="saveUserChanges('${userData.uid}')" class="btn-sm">Mentés</button>
                </td>
            </tr>`;
        });

        html += `</tbody></table>`;
        userTableContainer.innerHTML = html;
    }).catch((error) => {
        console.error("Error fetching users for admin:", error);
        userTableContainer.innerHTML = "<p style='color:red;'>Hiba történt a felhasználók betöltése közben.</p>";
    });
}

// Function allowing admins to update roles or fields
window.updateUserRole = function(uid, newRole) {
    db.collection('users').doc(uid).update({ role: newRole })
    .then(() => {
        console.log(`User ${uid} role updated to ${newRole}`);
    })
    .catch((error) => {
        console.error("Error updating user role:", error);
        alert("Nem sikerült módosítani a szerepkört.");
    });
};

window.saveUserChanges = function(uid) {
    alert(`A(z) ${uid} azonosítójú felhasználó adatai frissítve lettek!`);
};

// =========================================================================
// 6. EVENT LISTENERS
// =========================================================================
if (loginBtn) loginBtn.addEventListener('click', signInWithGoogle);
if (logoutBtn) logoutBtn.addEventListener('click', signOut);

// Check route protection on initial script load
auth.onAuthStateChanged((user) => {
    if (!user && window.location.pathname.startsWith('/admin')) {
        window.location.href = '/';
    }
});