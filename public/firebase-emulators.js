const firebaseEmulatorHosts = (() => {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        return {
            authUrl: "http://127.0.0.1:9099",
            firestore: {
                host: "127.0.0.1",
                port: 8080
            }
        };
    }

    if (location.hostname.endsWith(".app.github.dev")) {
        const authHost = location.hostname.replace(/-5000(?=\.app\.github\.dev$)/, "-9099");
        const firestoreHost = location.hostname.replace(/-5000(?=\.app\.github\.dev$)/, "-8080");

        if (authHost === location.hostname || firestoreHost === location.hostname) {
            throw new Error("Could not determine Firebase emulator ports from the Codespaces URL.");
        }

        return {
            authUrl: `https://${authHost}`,
            firestore: {
                host: `${firestoreHost}:443`,
                ssl: true
            }
        };
    }

    return null;
})();

if (firebaseEmulatorHosts) {
    const auth = firebase.auth();
    const db = firebase.firestore();

    auth.useEmulator(firebaseEmulatorHosts.authUrl);
    if ("port" in firebaseEmulatorHosts.firestore) {
        db.useEmulator(
            firebaseEmulatorHosts.firestore.host,
            firebaseEmulatorHosts.firestore.port
        );
    } else {
        db.settings(firebaseEmulatorHosts.firestore);
    }
}
