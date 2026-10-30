import { load } from 'cheerio';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const timetableEndpoint = 'https://suli.ejg.hu/intranet/szulkuk/szulkuk.php';
const firebaseJwks = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);
const weekdays = ['HÉTFŐ', 'KEDD', 'SZERDA', 'CSÜTÖRTÖK', 'PÉNTEK'];
const subjectNames = {
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

function corsHeaders(origin, allowedOrigin) {
    return {
        ...(origin === allowedOrigin && allowedOrigin
            ? { 'Access-Control-Allow-Origin': origin }
            : {}),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

function jsonResponse(data, status, headers) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...headers,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

export function parseTimetable(html) {
    const $ = load(html);
    const rows = $('tr').toArray();
    if (rows.length === 0) {
        throw new Error('No timetable rows found.');
    }

    const days = weekdays.map((name) => ({ name, lessons: [] }));
    let periodRowsFound = 0;

    for (let period = 0; period <= 7; period += 1) {
        const rowIndex = rows.findIndex((row) => {
            const firstCell = $(row).children('td').first();
            return firstCell.length > 0 &&
                new RegExp(`^${period}\\.`).test($(firstCell).text().replace(/\s+/g, ' ').trim());
        });
        if (rowIndex < 0) continue;

        const subjectCells = $(rows[rowIndex]).children('td').toArray();
        if (subjectCells.length < weekdays.length + 1) continue;
        periodRowsFound += 1;
        const teacherCells = rows[rowIndex + 1]
            ? $(rows[rowIndex + 1]).children('td').toArray()
            : [];

        weekdays.forEach((day, dayIndex) => {
            const code = $(subjectCells[dayIndex + 1]).text().replace(/\s+/g, ' ').trim() || '-';
            if (code === '-') return;
            const teacher = $(teacherCells[dayIndex]).text().replace(/\s+/g, ' ').trim() || '-';
            if (code.length > 120 || teacher.length > 120) {
                throw new Error('Timetable lesson exceeds supported length.');
            }

            const match = /(\d+)([a-z]+)([a-z0-9]+)/i.exec(code);
            const subjectCode = match?.[2].toLowerCase().split('x')[0] || '';
            days[dayIndex].lessons.push({
                period,
                code,
                subjectCode,
                subject: subjectCode ? subjectNames[subjectCode] || subjectCode : code,
                teacher: teacher === '-' ? '' : teacher
            });
        });
    }

    if (periodRowsFound === 0) {
        throw new Error('No lesson periods found.');
    }
    return days;
}

async function readBoundedBody(response, limit) {
    if (!response.body) throw new Error('Response body is unavailable.');
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
            await reader.cancel();
            throw new Error('Response exceeds size limit.');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((chunk) => {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    });
    return bytes;
}

function firestoreString(document, field) {
    return document.fields?.[field]?.stringValue;
}

async function getOwnProfile(uid, token, projectId) {
    const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
        `/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
        {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(8000)
        }
    );
    if (response.status === 404) return null;
    if (response.status === 401 || response.status === 403) {
        throw Object.assign(new Error('Could not access the signed-in user profile.'), {
            code: 'profile-permission-denied',
            status: 403
        });
    }
    if (!response.ok) {
        throw Object.assign(new Error('Could not read the signed-in user profile.'), {
            code: 'profile-unavailable',
            status: 503
        });
    }
    return response.json();
}

async function fetchTimetable(ejgCode, omAzonosito) {
    const requestBody = `EMAIL=%28%3A&DIAKKOD=${encodeURIComponent(ejgCode)}` +
        `&OMKOD=${encodeURIComponent(omAzonosito)}&orarend=V%E1laszt`;
    let response;
    try {
        response = await fetch(timetableEndpoint, {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(12000),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://suli.ejg.hu/intranet/szulkuk/menu.php'
            },
            body: requestBody
        });
    } catch (error) {
        console.error('School timetable fetch failed:', error.name || 'Error');
        throw Object.assign(new Error('School timetable service is unavailable.'), {
            code: 'school-connection-failed',
            status: 503
        });
    }
    if (!response.ok) {
        console.error('School timetable endpoint returned an unsuccessful status:', response.status);
        throw Object.assign(new Error('School timetable service is unavailable.'), {
            code: 'school-upstream-rejected',
            status: 503
        });
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType) ||
        contentLength > 512000) {
        throw Object.assign(new Error('Unexpected school response.'), {
            code: 'internal',
            status: 502
        });
    }

    const html = new TextDecoder('windows-1250', { fatal: true })
        .decode(await readBoundedBody(response, 512000));
    if (!/<big\b/i.test(html) || !/órarendje\s*<\/big>/i.test(html)) {
        throw Object.assign(new Error('School timetable was not found.'), {
            code: 'failed-precondition',
            status: 422
        });
    }

    try {
        return { days: parseTimetable(html) };
    } catch {
        throw Object.assign(new Error('School timetable response could not be parsed.'), {
            code: 'failed-precondition',
            status: 422
        });
    }
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const allowedOrigins = (env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        const allowedOrigin = allowedOrigins.includes(origin) ? origin : '';
        const headers = corsHeaders(origin, allowedOrigin);

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: allowedOrigin ? 204 : 403,
                headers
            });
        }
        if (request.method !== 'POST') {
            return jsonResponse({ error: { code: 'invalid-argument' } }, 405, headers);
        }
        if (!allowedOrigin) {
            return jsonResponse({ error: { code: 'permission-denied' } }, 403, headers);
        }
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
            return jsonResponse({ error: { code: 'invalid-argument' } }, 415, headers);
        }

        const authorization = request.headers.get('Authorization') || '';
        const tokenMatch = authorization.match(/^Bearer\s+(\S+)$/i);
        if (!tokenMatch) {
            return jsonResponse({ error: { code: 'unauthenticated' } }, 401, headers);
        }

        try {
            const contentLength = Number(request.headers.get('content-length') || 0);
            if (contentLength > 1024) {
                return jsonResponse({ error: { code: 'invalid-argument' } }, 413, headers);
            }
            const bodyText = new TextDecoder().decode(await readBoundedBody(request, 1024));
            let body;
            try {
                body = JSON.parse(bodyText);
            } catch {
                return jsonResponse({ error: { code: 'invalid-argument' } }, 400, headers);
            }
            if (!body || typeof body !== 'object' || Array.isArray(body) ||
                Object.keys(body).length !== 0) {
                return jsonResponse({ error: { code: 'invalid-argument' } }, 400, headers);
            }

            const { payload } = await jwtVerify(tokenMatch[1], firebaseJwks, {
                issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
                audience: env.FIREBASE_PROJECT_ID,
                algorithms: ['RS256']
            });
            const uid = payload.sub;
            if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
                return jsonResponse({ error: { code: 'unauthenticated' } }, 401, headers);
            }

            let profile;
            try {
                profile = await getOwnProfile(uid, tokenMatch[1], env.FIREBASE_PROJECT_ID);
            } catch (error) {
                if (error.code && error.status) throw error;
                console.error('Timetable Worker profile lookup failed:', error.name || 'Error');
                throw Object.assign(new Error('Profile service is unavailable.'), {
                    code: 'profile-unavailable',
                    status: 503
                });
            }
            if (!profile) {
                return jsonResponse({ error: { code: 'failed-precondition' } }, 412, headers);
            }
            const role = firestoreString(profile, 'role');
            if (!['user', 'admin', 'dev', 'owner'].includes(role)) {
                return jsonResponse({ error: { code: 'permission-denied' } }, 403, headers);
            }
            const schoolIdentifiers = profile.fields?.schoolIdentifiers?.mapValue?.fields;
            const ejgCode = schoolIdentifiers?.ejgCode?.stringValue?.trim();
            const omAzonosito = schoolIdentifiers?.omAzonosito?.stringValue?.trim();
            if (!ejgCode || !omAzonosito || ejgCode.length > 40 || omAzonosito.length > 20) {
                return jsonResponse({ error: { code: 'failed-precondition' } }, 412, headers);
            }

            try {
                return jsonResponse(await fetchTimetable(ejgCode, omAzonosito), 200, headers);
            } catch (error) {
                if (error.code && error.status) throw error;
                console.error('Timetable Worker school request failed:', error.name || 'Error');
                throw Object.assign(new Error('School timetable service is unavailable.'), {
                    code: 'school-unavailable',
                    status: 503
                });
            }
        } catch (error) {
            if (error.code && error.status) {
                return jsonResponse({ error: { code: error.code } }, error.status, headers);
            }
            const invalidToken = error.code?.startsWith('ERR_JWT_') ||
                error.code?.startsWith('ERR_JWS_');
            if (!invalidToken) console.error('Timetable worker request failed:', error.name || 'Error');
            const status = invalidToken ? 401 : 503;
            return jsonResponse({
                error: {
                    code: status === 401 ? 'unauthenticated' : 'unavailable'
                }
            }, status, headers);
        }
    }
};
