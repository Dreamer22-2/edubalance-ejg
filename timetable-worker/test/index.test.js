import test from 'node:test';
import assert from 'node:assert/strict';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker, { parseTimetable } from '../src/index.js';

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
                    role: { stringValue: 'user' },
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
        assert.match(schoolCall.init.body, /DIAKKOD=TEST-EJG/);
        assert.match(schoolCall.init.body, /OMKOD=12345/);

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
