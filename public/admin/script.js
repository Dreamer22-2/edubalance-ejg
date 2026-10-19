const auth = firebase.auth();
const db = firebase.firestore();
const privilegedRoles = ['admin', 'dev', 'owner'];

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = '/';
        return;
    }

    db.collection('users').doc(user.uid).get()
    .then((doc) => {
        if (doc.exists && privilegedRoles.includes(doc.data().role)) {
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