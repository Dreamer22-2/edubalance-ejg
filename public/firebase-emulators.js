const firebaseEmulatorHosts = (() => {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        return {
            authUrl: "http://127.0.0.1:9099",
            firestore: {
                host: "127.0.0.1",
                port: 8080
            },
            functions: {
                host: "127.0.0.1",
                port: 5001
            }
        };
    }

    if (location.hostname.endsWith(".app.github.dev")) {
        const authHost = location.hostname.replace(/-5000(?=\.app\.github\.dev$)/, "-9099");
        const firestoreHost = location.hostname.replace(/-5000(?=\.app\.github\.dev$)/, "-8080");
        const functionsHost = location.hostname.replace(/-5000(?=\.app\.github\.dev$)/, "-5001");

        if (authHost === location.hostname ||
            firestoreHost === location.hostname ||
            functionsHost === location.hostname) {
            throw new Error("Could not determine Firebase emulator ports from the Codespaces URL.");
        }

        return {
            authUrl: `https://${authHost}`,
            firestore: {
                host: `${firestoreHost}:443`,
                ssl: true
            },
            functions: {
                host: `${functionsHost}:443`,
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
    if (firebase.functions) {
        const functions = firebase.app().functions("europe-central2");
        if ("port" in firebaseEmulatorHosts.functions) {
            functions.useEmulator(
                firebaseEmulatorHosts.functions.host,
                firebaseEmulatorHosts.functions.port
            );
        } else {
            functions.useEmulator(
                firebaseEmulatorHosts.functions.host,
                443,
                firebaseEmulatorHosts.functions.ssl
            );
        }
    }
}
