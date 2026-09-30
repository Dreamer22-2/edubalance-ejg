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
// 3. AUTHENTICATION FUNCTIONS
// =========================================================================
function signInWithGoogle() {
    auth.signInWithPopup(provider)
    .then((result) => {
        console.log("Popup login completed.");
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
                if (userNameDisplay) userNameDisplay.innerText = `Üdvözöljük, ${user.displayName} Adminisztrátor Úr!\n\nBtw THE GAME`;
            } else {
                // USER IS A REGULAR USER 👥 -> Keep standard greeting
                console.log("Standard user role verified.");
                if (userNameDisplay) userNameDisplay.innerText = `Szia, ${user.displayName}!`;
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
    }
});

// =========================================================================
// 5. EVENT LISTENERS
// =========================================================================
if (loginBtn) loginBtn.addEventListener('click', signInWithGoogle);
if (logoutBtn) logoutBtn.addEventListener('click', signOut);
