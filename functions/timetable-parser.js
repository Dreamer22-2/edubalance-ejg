const cheerio = require('cheerio');

const WEEKDAYS = ['HÉTFŐ', 'KEDD', 'SZERDA', 'CSÜTÖRTÖK', 'PÉNTEK'];

function cellText(cell, $) {
    return $(cell).text().replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value) {
    return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
}

function parseTimetable(html) {
    const $ = cheerio.load(html);
    const tables = $('table').toArray();
    if (tables.length === 0) {
        throw new Error('The response did not contain a timetable table.');
    }

    let table;
    let headerRow;
    for (const candidate of tables) {
        const matchingHeader = $(candidate).find('tr').toArray().find((row) => {
            const cells = $(row).children('th, td').toArray();
            const names = cells.slice(1).map((cell) => normalizeHeader(cellText(cell, $)));
            return names.length === WEEKDAYS.length &&
                names.every((day, index) => day === normalizeHeader(WEEKDAYS[index]));
        });
        if (matchingHeader) {
            table = $(candidate);
            headerRow = matchingHeader;
            break;
        }
    }
    if (!table) {
        throw new Error('The timetable weekday header was not found.');
    }

    const rows = table.find('tr').toArray();

    const days = WEEKDAYS.map((name) => ({ name, lessons: [] }));
    let periodRowsFound = 0;
    rows.forEach((row, rowIndex) => {
        const cells = $(row).children('td').toArray();
        const periodMatch = cellText(cells[0], $).match(/^(\d{1,2})\.$/);
        if (!periodMatch || cells.length < WEEKDAYS.length + 1) return;

        const period = Number(periodMatch[1]);
        if (period > 20) return;
        periodRowsFound += 1;

        const teacherCells = rows[rowIndex + 1]
            ? $(rows[rowIndex + 1]).children('td').toArray()
            : [];
        WEEKDAYS.forEach((name, dayIndex) => {
            const subject = cellText(cells[dayIndex + 1], $);
            if (!subject || subject === '-') return;

            const teacher = cellText(teacherCells[dayIndex], $);
            if (subject.length > 120 || teacher.length > 120) {
                throw new Error('A timetable entry exceeded the supported length.');
            }
            days[dayIndex].lessons.push({
                period,
                subject,
                teacher: teacher === '-' ? '' : teacher
            });
        });
    });

    if (periodRowsFound === 0) {
        throw new Error('The timetable contained no lesson periods.');
    }

    return days;
}

module.exports = { parseTimetable };
