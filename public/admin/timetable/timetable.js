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

            renderTimetable(responseData.days);
        } catch (error) {
            console.error('Timetable inspector request failed:', {
                code: error.code || 'unknown',
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
            }[error.code] || 'Nem sikerült lekérni az órarendet.';
            showToast(message, 'error');
        } finally {
            submitButton.disabled = false;
            loading.hidden = true;
        }
    });

    function renderTimetable(days) {
        if (!Array.isArray(days) || days.length !== 5 ||
            days.some((day) => typeof day?.name !== 'string' || !Array.isArray(day.lessons))) {
            throw Object.assign(new Error('Invalid timetable response.'), { code: 'internal' });
        }

        const tabs = document.createElement('div');
        tabs.className = 'timetable-day-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Órarend napjai');

        const panel = document.createElement('section');
        panel.className = 'timetable-day-panel';
        panel.id = 'inspector-timetable-day-panel';
        panel.setAttribute('role', 'tabpanel');

        const renderDay = (index) => {
            const day = days[index];
            const heading = document.createElement('h3');
            heading.className = 'timetable-day-heading';
            heading.textContent = day.name;

            const content = [heading];
            if (day.lessons.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'timetable-empty';
                empty.textContent = 'Erre a napra nincs óra.';
                content.push(empty);
            } else {
                const lessonList = document.createElement('ol');
                lessonList.className = 'timetable-lessons';
                day.lessons.forEach((lesson) => {
                    if (!Number.isInteger(lesson.period) ||
                        typeof lesson.subject !== 'string' ||
                        typeof lesson.teacher !== 'string') {
                        throw Object.assign(new Error('Invalid lesson response.'), { code: 'internal' });
                    }
                    const item = document.createElement('li');
                    const period = document.createElement('span');
                    period.className = 'timetable-period';
                    period.textContent = String(lesson.period);
                    const details = document.createElement('span');
                    details.className = 'timetable-lesson-details';
                    details.append(document.createTextNode(lesson.subject));
                    if (lesson.teacher) {
                        const teacher = document.createElement('span');
                        teacher.className = 'timetable-teacher';
                        teacher.textContent = ` · ${lesson.teacher}`;
                        details.append(teacher);
                    }
                    item.append(period, details);
                    lessonList.append(item);
                });
                content.push(lessonList);
            }

            panel.replaceChildren(...content);
            panel.setAttribute('aria-labelledby', `inspector-day-tab-${index}`);
            tabs.querySelectorAll('[role="tab"]').forEach((tab, tabIndex) => {
                const selected = tabIndex === index;
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
            });
        };

        days.forEach((day, index) => {
            const tab = document.createElement('button');
            tab.id = `inspector-day-tab-${index}`;
            tab.className = 'timetable-day-tab';
            tab.type = 'button';
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', panel.id);
            tab.textContent = day.name;
            tab.addEventListener('click', () => renderDay(index));
            tab.addEventListener('keydown', (event) => {
                let nextIndex;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % days.length;
                if (event.key === 'ArrowLeft') nextIndex = (index + days.length - 1) % days.length;
                if (event.key === 'Home') nextIndex = 0;
                if (event.key === 'End') nextIndex = days.length - 1;
                if (nextIndex === undefined) return;
                event.preventDefault();
                tabs.querySelectorAll('[role="tab"]')[nextIndex].focus();
                renderDay(nextIndex);
            });
            tabs.append(tab);
        });

        results.replaceChildren(tabs, panel);
        renderDay(0);
        results.hidden = false;
    }
})();
