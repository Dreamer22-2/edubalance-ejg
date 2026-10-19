const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTimetable } = require('../timetable-parser');

test('parses timetable periods, subjects, and teachers for each weekday', () => {
    const html = `
        <table>
            <tr><td rowspan="2"><b>0.</b></td><td>-</td><td>-</td><td>10biox1</td><td>-</td><td>-</td></tr>
            <tr><td>-</td><td>-</td><td>Szász Péter</td><td>-</td><td>-</td></tr>
            <tr><td rowspan="2"><b>1.</b></td><td>Matematika</td><td>-</td><td>-</td><td>-</td><td>Angol</td></tr>
            <tr><td>Kámán Ildikó</td><td>-</td><td>-</td><td>-</td><td>Teacher</td></tr>
        </table>`;

    assert.deepEqual(parseTimetable(html), [
        { name: 'HÉTFŐ', lessons: [{ period: 1, code: 'Matematika', subjectCode: '', subject: 'Matematika', teacher: 'Kámán Ildikó' }] },
        { name: 'KEDD', lessons: [] },
        { name: 'SZERDA', lessons: [{ period: 0, code: '10biox1', subjectCode: 'bio', subject: 'Biológia', teacher: 'Szász Péter' }] },
        { name: 'CSÜTÖRTÖK', lessons: [] },
        { name: 'PÉNTEK', lessons: [{ period: 1, code: 'Angol', subjectCode: '', subject: 'Angol', teacher: 'Teacher' }] }
    ]);
});

test('finds period rows when unrelated page tables precede the timetable', () => {
    const html = `
        <table><tr><td>Page layout</td></tr></table>
        <table>
            <tr><td rowspan="2"><b>2.</b></td><td>10matx1</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
            <tr><td>Tóth János</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
        </table>`;

    const lesson = parseTimetable(html)[0].lessons[0];
    assert.equal(lesson.teacher, 'Tóth János');
    assert.equal(lesson.subjectCode, 'mat');
    assert.equal(lesson.subject, 'Matematika');
});
