const auth = firebase.auth();
const db = firebase.firestore();

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    auth.useEmulator("http://127.0.0.1:9099");
    db.useEmulator("127.0.0.1", 8080);
}

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = '/';
        return;
    }

    db.collection('users').doc(user.uid).get()
    .then((doc) => {
        if (doc.exists && doc.data().role === 'admin') {
            document.getElementById('admin-welcome-text').innerText = `Bejelentkezve mint: ${user.displayName} (Admin)`;
            document.getElementById('admin-nav').style.display = 'flex';
        } else {
            alert("Nincs admin jogosultságod!");
            window.location.href = '/';
        }
    })
    .catch(() => {
        window.location.href = '/';
    });
});