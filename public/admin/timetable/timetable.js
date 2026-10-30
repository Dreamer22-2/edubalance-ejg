(() => {
    const auth = firebase.auth();
    const db = firebase.firestore();
    const privilegedRoles = ['admin', 'dev', 'owner'];
    const content = document.getElementById('timetable-inspector-content');
    const form = document.getElementById('timetable-inspector-form');
    const submitButton = document.getElementById('inspector-submit');
    const loading = document.getElementById('inspector-loading');
    const results = document.getElementById('inspector-results');

    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.replace('/');
            return;
        }

        try {
            const profile = await db.collection('users').doc(user.uid).get();
            if (!profile.exists || !privilegedRoles.includes(profile.data().role)) {
                showToast('Nincs jogosultságod az oldal megtekintéséhez.', 'error');
                window.location.replace('/');
                return;
            }
            content.hidden = false;
            prefillFromUserList();
        } catch (error) {
            console.error('Failed to authorize timetable inspector:', {
                code: error.code || 'unknown',
                message: error.message || 'No error message'
            });
            showToast('Nem sikerült ellenőrizni az oldal jogosultságait.', 'error');
            window.location.replace('/');
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const user = auth.currentUser;
        if (!user) {
            showToast('A lekéréshez be kell jelentkezned.', 'error');
            return;
        }

        submitButton.disabled = true;
        loading.hidden = false;
        results.hidden = true;
        results.replaceChildren();

        try {
            let timetable;
            if (location.hostname === 'localhost' ||
                location.hostname === '127.0.0.1' ||
                location.hostname.endsWith('.app.github.dev')) {
                const callable = firebase.app().functions('europe-central2')
                    .httpsCallable('getTimetableForInspector');
                const response = await callable({
                    ejgCode: form.elements.ejgCode.value.trim(),
                    omAzonosito: form.elements.omAzonosito.value.trim()
                });
                timetable = response.data;
            } else {
                const workerUrl = window.TIMETABLE_WORKER_URL;
                if (typeof workerUrl !== 'string' || !workerUrl.startsWith('https://')) {
                    throw Object.assign(new Error('Timetable service is not configured.'), {
                        code: 'unavailable'
                    });
                }

                const response = await fetch(workerUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${await user.getIdToken()}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ejgCode: form.elements.ejgCode.value.trim(),
                        omAzonosito: form.elements.omAzonosito.value.trim()
                    })
                });
                const responseData = await response.json();
                if (!response.ok) {
                    throw Object.assign(new Error('Timetable service request failed.'), {
                        code: responseData.error?.code || 'internal'
                    });
                }
                timetable = responseData;
            }

            if (typeof timetable.name !== 'string' || !timetable.name.trim()) {
                throw Object.assign(new Error('The school did not return a student name.'), {
                    code: 'failed-precondition'
                });
            }
            const studentName = document.createElement('h2');
            studentName.className = 'timetable-inspector-student-name';
            studentName.textContent = timetable.name.trim();
            results.replaceChildren(studentName, window.createTimetableElement(timetable.days));
            results.hidden = false;
        } catch (error) {
            const errorCode = typeof error.code === 'string'
                ? error.code.replace(/^functions\//, '')
                : 'unknown';
            console.error('Timetable inspector request failed:', {
                code: errorCode,
                message: error.message || 'No error message'
            });
            const message = {
                'failed-precondition': 'Nem található órarend ezekkel az azonosítókkal.',
                'permission-denied': 'Ehhez a művelethez nincs jogosultságod.',
                unauthenticated: 'Jelentkezz be újra, majd próbáld meg ismét.',
                'school-connection-failed': 'Nem sikerült kapcsolódni az iskola órarend-szolgáltatásához.',
                'school-upstream-rejected': 'Az iskola órarend-szolgáltatása elutasította a kérést.',
                'profile-permission-denied': 'Nem sikerült ellenőrizni a jogosultságodat.',
                'profile-unavailable': 'A profiladatok most nem érhetők el.',
                unavailable: 'Az órarend-szolgáltatás most nem érhető el.',
                internal: 'Az órarend feldolgozása nem sikerült.'
            }[errorCode] || 'Nem sikerült lekérni az órarendet.';
            showToast(message, 'error');
        } finally {
            submitButton.disabled = false;
            loading.hidden = true;
        }
    });

    function prefillFromUserList() {
        const storageKey = 'timetable-inspector-prefill';
        let serialized;
        try {
            serialized = sessionStorage.getItem(storageKey);
            if (serialized === null) return;
            sessionStorage.removeItem(storageKey);
        } catch (error) {
            console.error('Could not read timetable inspector prefill:', error);
            showToast('Nem sikerült betölteni a kiválasztott felhasználó kódjait.', 'error');
            return;
        }

        try {
            const identifiers = JSON.parse(serialized);
            if (typeof identifiers?.ejgCode !== 'string' ||
                typeof identifiers?.omAzonosito !== 'string') {
                throw new Error('Invalid timetable inspector prefill.');
            }
            form.elements.ejgCode.value = identifiers.ejgCode;
            form.elements.omAzonosito.value = identifiers.omAzonosito;
            form.requestSubmit();
        } catch (error) {
            console.error('Invalid timetable inspector prefill:', error);
            showToast('Nem sikerült betölteni a kiválasztott felhasználó kódjait.', 'error');
        }
    }

})();
