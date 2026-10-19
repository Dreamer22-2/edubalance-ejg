const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTimetable } = require('../timetable-parser');

test('parses timetable periods, subjects, and teachers for each weekday', () => {
    const html = `
        <table>
            <tr><th></th><th>HÉTFŐ</th><th>KEDD</th><th>SZERDA</th><th>CSÜTÖRTÖK</th><th>PÉNTEK</th></tr>
            <tr><td rowspan="2"><b>0.</b></td><td>-</td><td>-</td><td>10tesztbiologia</td><td>-</td><td>-</td></tr>
            <tr><td>-</td><td>-</td><td>Szász Péter</td><td>-</td><td>-</td></tr>
            <tr><td rowspan="2"><b>1.</b></td><td>Matematika</td><td>-</td><td>-</td><td>-</td><td>Angol</td></tr>
            <tr><td>Kámán Ildikó</td><td>-</td><td>-</td><td>-</td><td>Teacher</td></tr>
        </table>`;

    assert.deepEqual(parseTimetable(html), [
        { name: 'HÉTFŐ', lessons: [{ period: 1, subject: 'Matematika', teacher: 'Kámán Ildikó' }] },
        { name: 'KEDD', lessons: [] },
        { name: 'SZERDA', lessons: [{ period: 0, subject: '10tesztbiologia', teacher: 'Szász Péter' }] },
        { name: 'CSÜTÖRTÖK', lessons: [] },
        { name: 'PÉNTEK', lessons: [{ period: 1, subject: 'Angol', teacher: 'Teacher' }] }
    ]);
});

test('rejects responses that do not contain a timetable', () => {
    assert.throws(() => parseTimetable('<html><body>Not found</body></html>'), /timetable table/);
});

test('finds the timetable when a layout table precedes it and headings use data cells', () => {
    const html = `
        <table><tr><td>Page layout</td></tr></table>
        <table>
            <tr><td>Óra</td><td>Hétfő</td><td>Kedd</td><td>Szerda</td><td>Csütörtök</td><td>Péntek</td></tr>
            <tr><td rowspan="2">2.</td><td>Fizika</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
            <tr><td>Tóth János</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
        </table>`;

    assert.equal(parseTimetable(html)[0].lessons[0].teacher, 'Tóth János');
});
