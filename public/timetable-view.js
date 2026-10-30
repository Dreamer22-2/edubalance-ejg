(() => {
    const dayLabels = ['Hé', 'Ke', 'Sz', 'Cs', 'Pé'];
    let timetableInstance = 0;

    window.createTimetableElement = (days, selectedDayIndex = 0, onDayChange = () => {}) => {
        if (!Array.isArray(days) || days.length !== 5 ||
            days.some((day) =>
                typeof day?.name !== 'string' ||
                !Array.isArray(day.lessons) ||
                day.lessons.some((lesson) =>
                    !Number.isInteger(lesson.period) ||
                    typeof lesson.subject !== 'string' ||
                    typeof lesson.teacher !== 'string'
                )
            )) {
            throw new Error('A kapott órarend formátuma nem megfelelő.');
        }

        const timetable = document.createElement('section');
        timetable.className = 'timetable-results';
        const instanceId = ++timetableInstance;

        const tabs = document.createElement('div');
        tabs.className = 'timetable-day-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'A hét napjai');

        const panel = document.createElement('section');
        panel.className = 'timetable-day-panel';
        panel.id = `timetable-${instanceId}-day-panel`;
        panel.setAttribute('role', 'tabpanel');

        let activeDayIndex = Math.min(Math.max(selectedDayIndex, 0), days.length - 1);
        const renderSelectedDay = (index) => {
            activeDayIndex = index;
            onDayChange(index);
            const day = days[index];
            const heading = document.createElement('h3');
            heading.className = 'timetable-day-heading';
            heading.textContent = day.name;

            const panelContent = [heading];
            if (day.lessons.length === 0) {
                const emptyMessage = document.createElement('p');
                emptyMessage.className = 'timetable-empty';
                emptyMessage.textContent = 'Nincs óra.';
                panelContent.push(emptyMessage);
            } else {
                const lessonList = document.createElement('ol');
                lessonList.className = 'timetable-lessons';
                day.lessons.forEach((lesson) => {
                    const item = document.createElement('li');
                    const period = document.createElement('span');
                    period.className = 'timetable-period';
                    period.textContent = `${lesson.period}.`;

                    const details = document.createElement('span');
                    details.className = 'timetable-lesson-details';
                    const subject = document.createElement('strong');
                    subject.textContent = lesson.subject;
                    details.append(subject);

                    if (lesson.teacher) {
                        const teacher = document.createElement('span');
                        teacher.className = 'timetable-teacher';
                        teacher.textContent = ` (${lesson.teacher})`;
                        details.append(teacher);
                    }
                    item.append(period, details);
                    lessonList.append(item);
                });
                panelContent.push(lessonList);
            }
            panel.replaceChildren(...panelContent);
            panel.setAttribute('aria-labelledby', `timetable-${instanceId}-day-tab-${index}`);

            tabs.querySelectorAll('[role="tab"]').forEach((tab, tabIndex) => {
                const isSelected = tabIndex === index;
                tab.setAttribute('aria-selected', String(isSelected));
                tab.tabIndex = isSelected ? 0 : -1;
            });
        };

        dayLabels.forEach((label, index) => {
            const tab = document.createElement('button');
            tab.id = `timetable-${instanceId}-day-tab-${index}`;
            tab.className = 'timetable-day-tab';
            tab.type = 'button';
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', panel.id);
            tab.textContent = label;
            tab.addEventListener('click', () => renderSelectedDay(index));
            tab.addEventListener('keydown', (event) => {
                let nextIndex;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % days.length;
                if (event.key === 'ArrowLeft') nextIndex = (index + days.length - 1) % days.length;
                if (event.key === 'Home') nextIndex = 0;
                if (event.key === 'End') nextIndex = days.length - 1;
                if (nextIndex === undefined) return;

                event.preventDefault();
                tabs.querySelectorAll('[role="tab"]')[nextIndex].focus();
                renderSelectedDay(nextIndex);
            });
            tabs.append(tab);
        });

        timetable.append(tabs, panel);
        renderSelectedDay(activeDayIndex);
        return timetable;
    };
})();
