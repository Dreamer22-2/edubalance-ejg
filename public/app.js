// =========================================================================
// 1. FIREBASE AUTH & PROVIDER SETUP
// =========================================================================
const auth = firebase.auth();

// Force connection to the local auth emulator if running locally
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    auth.useEmulator("http://127.0.0.1:9099");
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
// 3. AUTHENTICATION FUNCTIONS
// =========================================================================
function signInWithGoogle() {
    auth.signInWithPopup(provider)
    .then((result) => {
        // The onAuthStateChanged listener below will handle the UI changes smoothly
        console.log("Popup login sequence completed for:", result.user.displayName);
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
// 4. AUTH STATE LISTENER (The UI Controller)
// =========================================================================
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("Successfully logged in user recognized by listener:", user.displayName);

        // Update elements visibility
        if (loginBtn) loginBtn.style.setProperty('display', 'none', 'important');
        if (userSection) userSection.style.setProperty('display', 'block', 'important');
        if (logoutBtn) logoutBtn.style.setProperty('display', 'inline-flex', 'important');

        // Populate data
        if (userNameDisplay) userNameDisplay.innerText = `Szia, ${user.displayName}!`;
        if (userImgDisplay) {
            userImgDisplay.src = user.photoURL || 'https://placeholder.com';
            userImgDisplay.alt = user.displayName;
        }
    } else {
        console.log("No user logged in (or user signed out). Showing login button.");

        // Update elements visibility
        if (loginBtn) loginBtn.style.setProperty('display', 'inline-flex', 'important');
        if (userSection) userSection.style.setProperty('display', 'none', 'important');
        if (logoutBtn) logoutBtn.style.setProperty('display', 'none', 'important');

        // Reset data fields
        if (userNameDisplay) userNameDisplay.innerText = '';
        if (userImgDisplay) userImgDisplay.src = '';
    }
});

// =========================================================================
// 5. EVENT LISTENERS
// =========================================================================
if (loginBtn) loginBtn.addEventListener('click', signInWithGoogle);
if (logoutBtn) logoutBtn.addEventListener('click', signOut);
