const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = '/';
        return;
    }

    db.collection('users').doc(user.uid).get()
    .then((doc) => {
        if (doc.exists && doc.data().role === 'admin') {
            document.getElementById('admin-welcome-text').innerText = `Bejelentkezve mint: ${user.displayName} (Admin)`;
            document.getElementById('admin-content').style.display = 'block';
        } else {
            alert("Nincs admin jogosultságod!");
            window.location.href = '/';
        }
    })
    .catch(() => {
        window.location.href = '/';
    });
});