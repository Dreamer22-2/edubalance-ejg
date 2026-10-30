import test from 'node:test';
import assert from 'node:assert/strict';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker, { parseStudentName, parseTimetable } from '../src/index.js';

const env = {
    FIREBASE_PROJECT_ID: 'edubalance-ejg',
    ALLOWED_ORIGINS: 'https://edubalance-ejg.web.app'
};

test('allows configured app origin to complete the CORS preflight', async () => {
    const response = await worker.fetch(new Request('https://worker.example/', {
        method: 'OPTIONS',
        headers: { Origin: 'https://edubalance-ejg.web.app' }
    }), env);

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://edubalance-ejg.web.app');
    assert.match(response.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('rejects requests from unconfigured origins', async () => {
    const response = await worker.fetch(new Request('https://worker.example/', {
        method: 'POST',
        headers: {
            Origin: 'https://attacker.example',
            'Content-Type': 'application/json'
        },
        body: '{}'
    }), env);

    assert.equal(response.status, 403);
    assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
    assert.deepEqual(await response.json(), { error: { code: 'permission-denied' } });
});

test('rejects preflights from unconfigured origins', async () => {
    const response = await worker.fetch(new Request('https://worker.example/', {
        method: 'OPTIONS',
        headers: { Origin: 'https://attacker.example' }
    }), env);

    assert.equal(response.status, 403);
    assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
});

test('rejects requests without a Firebase bearer token', async () => {
    const response = await worker.fetch(new Request('https://worker.example/', {
        method: 'POST',
        headers: {
            Origin: 'https://edubalance-ejg.web.app',
            'Content-Type': 'application/json'
        },
        body: '{}'
    }), env);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: { code: 'unauthenticated' } });
});

test('parses paired subject and teacher rows into weekdays', () => {
    const html = `
        <big>Órarendje</big>
        <table>
            <tr><td>1. óra</td><td>1matA</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
            <tr><td>Tanár Anna</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
        </table>`;
    const days = parseTimetable(html);

    assert.equal(days.length, 5);
    assert.deepEqual(days[0].lessons[0], {
        period: 1,
        code: '1matA',
        subjectCode: 'mat',
        subject: 'Matematika',
        teacher: 'Tanár Anna'
    });
    assert.deepEqual(days[1].lessons, []);
});

test('extracts only the full name from the school personal-data response', () => {
    const html = '<table><tr><td>név<td>Verified Student</tr>' +
        '<tr><td>other<td>ignored</tr></table>';

    assert.equal(parseStudentName(html), 'Verified Student');
    assert.throws(() => parseStudentName('<table><tr><td>other<td>ignored</tr></table>'));
});

test('verifies Firebase tokens and forwards only the signed-in profile identifiers', async () => {
    const originalFetch = globalThis.fetch;
    const projectId = env.FIREBASE_PROJECT_ID;
    const uid = 'worker-test-user';
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'worker-test-key';
    publicJwk.alg = 'RS256';
    const calls = [];
    let firestoreStatus = 200;
    let schoolStatus = 200;
    let profileRole = 'user';

    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com') {
            return Response.json({ keys: [publicJwk] });
        }
        if (url.includes(`/documents/users/${uid}`)) {
            if (firestoreStatus !== 200) return new Response(null, { status: firestoreStatus });
            return Response.json({
                fields: {
                    role: { stringValue: profileRole },
                    schoolIdentifiers: {
                        mapValue: {
                            fields: {
                                ejgCode: { stringValue: 'TEST-EJG' },
                                omAzonosito: { stringValue: '12345' }
                            }
                        }
                    }
                }
            });
        }
        if (url === 'https://suli.ejg.hu/intranet/szulkuk/szulkuk.php') {
            if (init.body.includes('&adatok=')) {
                const bytes = new Uint8Array([
                    ...new TextEncoder().encode('<table><tr><td>n'),
                    0xe9,
                    ...new TextEncoder().encode('v<td>Verified Student</tr>' +
                        '<tr><td>other<td>ignored</tr></table>')
                ]);
                return new Response(bytes, {
                    headers: { 'Content-Type': 'text/html; charset=iso-8859-2' }
                });
            }
            if (schoolStatus === 'network-error') throw new TypeError('network failure');
            if (schoolStatus !== 200) return new Response(null, { status: schoolStatus });
            const html = [
                ...new TextEncoder().encode('<big>'),
                0xf3,
                ...new TextEncoder().encode('rarendje</big><table><tr><td>1. ora</td><td>1matA</td><td>-</td><td>-</td><td>-</td><td>-</td></tr><tr><td>Teacher</td><td>-</td><td>-</td><td>-</td><td>-</td></tr></table>')
            ];
            return new Response(Uint8Array.from(html), {
                headers: { 'Content-Type': 'text/html; charset=windows-1250' }
            });
        }
        throw new Error(`Unexpected mocked fetch: ${url}`);
    };

    try {
        const token = await new SignJWT({ user_id: uid })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(`https://securetoken.google.com/${projectId}`)
            .setAudience(projectId)
            .setSubject(uid)
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(privateKey);
        const response = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: '{}'
        }), env);

        assert.equal(response.status, 200);
        const timetable = await response.json();
        assert.equal(timetable.days[0].lessons[0].subject, 'Matematika');
        const firestoreCall = calls.find(({ url }) => url.includes('/documents/users/'));
        assert.ok(firestoreCall);
        assert.equal(firestoreCall.init.headers.Authorization, `Bearer ${token}`);
        const schoolCall = calls.find(({ url }) => url.includes('suli.ejg.hu'));
        assert.ok(schoolCall);
        assert.equal(schoolCall.init.redirect, 'manual');
        assert.match(schoolCall.init.body, /DIAKKOD=TEST-EJG/);
        assert.match(schoolCall.init.body, /OMKOD=12345/);
        assert.match(schoolCall.init.body, /EMAIL=%28%3A/);

        profileRole = 'admin';
        const inspectorResponse = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ejgCode: 'MANUAL-EJG', omAzonosito: '54321' })
        }), env);
        assert.equal(inspectorResponse.status, 200);
        assert.deepEqual(await inspectorResponse.json(), {
            days: [
                { name: 'HÉTFŐ', lessons: [{ period: 1, code: '1matA', subjectCode: 'mat', subject: 'Matematika', teacher: 'Teacher' }] },
                { name: 'KEDD', lessons: [] },
                { name: 'SZERDA', lessons: [] },
                { name: 'CSÜTÖRTÖK', lessons: [] },
                { name: 'PÉNTEK', lessons: [] }
            ],
            name: 'Verified Student'
        });
        const inspectorSchoolCalls = calls
            .filter(({ url }) => url.includes('suli.ejg.hu'))
            .slice(-2);
        const inspectorSchoolCall = inspectorSchoolCalls[0];
        assert.match(inspectorSchoolCall.init.body, /EMAIL=X/);
        assert.match(inspectorSchoolCall.init.body, /DIAKKOD=MANUAL-EJG/);
        assert.match(inspectorSchoolCall.init.body, /OMKOD=54321/);
        const inspectorNameCall = inspectorSchoolCalls[1];
        assert.match(inspectorNameCall.init.body, /EMAIL=X/);
        assert.match(inspectorNameCall.init.body, /DIAKKOD=MANUAL-EJG/);
        assert.match(inspectorNameCall.init.body, /OMKOD=54321/);
        assert.match(inspectorNameCall.init.body, /&adatok=V%E1laszt/);

        profileRole = 'user';
        const verificationResponse = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'verify',
                ejgCode: 'ABCDEFGHIJKLM',
                omAzonosito: '54321'
            })
        }), env);
        assert.equal(verificationResponse.status, 200);
        assert.deepEqual(await verificationResponse.json(), {
            verified: true,
            name: 'Verified Student'
        });
        const verificationSchoolCalls = calls
            .filter(({ url }) => url.includes('suli.ejg.hu'))
            .slice(-2);
        const verificationSchoolCall = verificationSchoolCalls[0];
        assert.match(verificationSchoolCall.init.body, /EMAIL=%28%3A/);
        assert.match(verificationSchoolCall.init.body, /DIAKKOD=ABCDEFGHIJKLM/);
        assert.match(verificationSchoolCall.init.body, /OMKOD=54321/);
        const nameSchoolCall = verificationSchoolCalls[1];
        assert.match(nameSchoolCall.init.body, /EMAIL=X/);
        assert.match(nameSchoolCall.init.body, /DIAKKOD=ABCDEFGHIJKLM/);
        assert.match(nameSchoolCall.init.body, /OMKOD=54321/);
        assert.match(nameSchoolCall.init.body, /&adatok=V%E1laszt/);

        schoolStatus = 200;
        const fixtureFetch = globalThis.fetch;
        globalThis.fetch = async (input, init = {}) => {
            if (String(input) === 'https://suli.ejg.hu/intranet/szulkuk/szulkuk.php' &&
                init.body.includes('DIAKKOD=INVALIDCODE')) {
                return new Response('<html><body>No timetable</body></html>', {
                    headers: { 'Content-Type': 'text/html; charset=windows-1250' }
                });
            }
            return fixtureFetch(input, init);
        };
        const rejectedVerificationResponse = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'verify',
                ejgCode: 'INVALIDCODE12',
                omAzonosito: '54321'
            })
        }), env);
        assert.equal(rejectedVerificationResponse.status, 422);
        assert.deepEqual(await rejectedVerificationResponse.json(), {
            error: { code: 'failed-precondition' }
        });
        globalThis.fetch = fixtureFetch;

        const invalidVerificationResponse = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'verify',
                ejgCode: 'SHORT',
                omAzonosito: '54321'
            })
        }), env);
        assert.equal(invalidVerificationResponse.status, 400);
        assert.deepEqual(await invalidVerificationResponse.json(), {
            error: { code: 'invalid-argument' }
        });

        profileRole = 'admin';
        const invalidInspectorResponse = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ejgCode: 'MANUAL-EJG', omAzonosito: '5432' })
        }), env);
        assert.equal(invalidInspectorResponse.status, 400);
        assert.deepEqual(await invalidInspectorResponse.json(), {
            error: { code: 'invalid-argument' }
        });

        profileRole = 'user';
        const deniedInspectorResponse = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ejgCode: 'MANUAL-EJG', omAzonosito: '54321' })
        }), env);
        assert.equal(deniedInspectorResponse.status, 403);
        assert.deepEqual(await deniedInspectorResponse.json(), {
            error: { code: 'permission-denied' }
        });

        const wrongProjectToken = await new SignJWT({ user_id: uid })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(`https://securetoken.google.com/${projectId}`)
            .setAudience('another-project')
            .setSubject(uid)
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(privateKey);
        const wrongProjectResponse = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${wrongProjectToken}`,
                'Content-Type': 'application/json'
            },
            body: '{}'
        }), env);
        assert.equal(wrongProjectResponse.status, 401);
        assert.deepEqual(await wrongProjectResponse.json(), {
            error: { code: 'unauthenticated' }
        });

        firestoreStatus = 403;
        const deniedProfileResponse = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: '{}'
        }), env);
        assert.equal(deniedProfileResponse.status, 403);
        assert.deepEqual(await deniedProfileResponse.json(), {
            error: { code: 'profile-permission-denied' }
        });

        firestoreStatus = 200;
        schoolStatus = 503;
        const unavailableSchoolResponse = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: '{}'
        }), env);
        assert.equal(unavailableSchoolResponse.status, 503);
        assert.deepEqual(await unavailableSchoolResponse.json(), {
            error: { code: 'school-upstream-rejected' }
        });

        schoolStatus = 'network-error';
        const networkFailureResponse = await worker.fetch(new Request('https://worker.example/', {
            method: 'POST',
            headers: {
                Origin: 'https://edubalance-ejg.web.app',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: '{}'
        }), env);
        assert.equal(networkFailureResponse.status, 503);
        assert.deepEqual(await networkFailureResponse.json(), {
            error: { code: 'school-connection-failed' }
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});
