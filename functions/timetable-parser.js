const cheerio = require('cheerio');

const WEEKDAYS = ['HÉTFŐ', 'KEDD', 'SZERDA', 'CSÜTÖRTÖK', 'PÉNTEK'];
const SUBJECT_NAMES = {
    mat: 'Matematika',
    tes: 'Testnevelés',
    bio: 'Biológia',
    foc: 'Földrajz',
    an: 'Angol nyelv',
    nyt: 'Nyelvtan',
    ne: 'Német nyelv',
    or: 'Orosz nyelv',
    fiz: 'Fizika',
    ofn: 'Osztályfőnöki',
    ird: 'Irodalom',
    zen: 'Ének-zene',
    dig: 'Digitális kultúra',
    kem: 'Kémia',
    tor: 'Történelem',
    rvk: 'Rajz-vizuális kultúra',
    api: 'Állampolgári ismeretek'
};

function cellText(cell, $) {
    return $(cell).text().replace(/\s+/g, ' ').trim();
}

function subjectDetails(code) {
    const match = /(\d+)([a-z]+)([a-z0-9]+)/i.exec(code);
    if (!match) {
        return { subjectCode: '', subject: code };
    }

    const subjectCode = match[2].toLowerCase().split('x')[0];
    return {
        subjectCode,
        subject: SUBJECT_NAMES[subjectCode] || subjectCode
    };
}

function parseTimetable(html) {
    const $ = cheerio.load(html);
    const rows = $('tr').toArray();
    if (!rows.length) {
        throw new Error('The response did not contain timetable rows.');
    }

    const days = WEEKDAYS.map((name) => ({ name, lessons: [] }));
    let periodRowsFound = 0;
    for (let period = 0; period <= 7; period += 1) {
        const rowIndex = rows.findIndex((row) => {
            const firstCell = $(row).children('td').first();
            return firstCell.length > 0 &&
                new RegExp(`^${period}\\.`).test(cellText(firstCell, $));
        });
        if (rowIndex < 0) continue;

        const subjectCells = $(rows[rowIndex]).children('td').toArray();
        if (subjectCells.length < WEEKDAYS.length + 1) continue;
        periodRowsFound += 1;
        const teacherCells = rows[rowIndex + 1]
            ? $(rows[rowIndex + 1]).children('td').toArray()
            : [];

        WEEKDAYS.forEach((name, dayIndex) => {
            const code = cellText(subjectCells[dayIndex + 1], $) || '-';
            if (code === '-') return;

            const teacher = cellText(teacherCells[dayIndex], $) || '-';
            if (code.length > 120 || teacher.length > 120) {
                throw new Error('A timetable entry exceeded the supported length.');
            }
            const details = subjectDetails(code);
            days[dayIndex].lessons.push({
                period,
                code,
                subjectCode: details.subjectCode,
                subject: details.subject,
                teacher: teacher === '-' ? '' : teacher
            });
        });
    }

    if (periodRowsFound === 0) {
        throw new Error('The timetable contained no lesson periods.');
    }

    return days;
}

module.exports = { parseTimetable };
