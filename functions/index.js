const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { parseTimetable } = require('./timetable-parser');

initializeApp();

const database = getFirestore();
const timetableEndpoint = 'https://suli.ejg.hu/intranet/szulkuk/szulkuk.php';
const allowedRoles = ['user', 'admin', 'dev', 'owner'];
const privilegedRoles = ['admin', 'dev', 'owner'];

async function fetchAndParseTimetable(ejgCode, omAzonosito, email = '(:') {
    const encodedEmail = encodeURIComponent(email).replace(/[!'()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
    const requestBody = `EMAIL=${encodedEmail}&DIAKKOD=${encodeURIComponent(ejgCode)}` +
        `&OMKOD=${encodeURIComponent(omAzonosito)}&orarend=V%E1laszt`;

    let upstreamResponse;
    try {
        upstreamResponse = await fetch(timetableEndpoint, {
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
        logger.warn('The school timetable endpoint could not be reached.', {
            errorName: error.name
        });
        throw new HttpsError('unavailable', 'The school timetable service is temporarily unavailable.');
    }

    if (!upstreamResponse.ok) {
        logger.warn('The school timetable endpoint returned an unsuccessful status.', {
            status: upstreamResponse.status
        });
        throw new HttpsError('unavailable', 'The school timetable service could not complete the request.');
    }

    const contentType = upstreamResponse.headers.get('content-type') || '';
    const contentLength = Number(upstreamResponse.headers.get('content-length') || 0);
    if (!contentType.toLowerCase().includes('text/html') || contentLength > 512000) {
        throw new HttpsError('internal', 'The school returned an unexpected timetable response.');
    }

    let responseBytes;
    try {
        const reader = upstreamResponse.body?.getReader();
        if (!reader) throw new Error('The response body is unavailable.');
        const chunks = [];
        let totalBytes = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > 512000) {
                await reader.cancel();
                throw new Error('The response exceeded the size limit.');
            }
            chunks.push(value);
        }
        responseBytes = new Uint8Array(totalBytes);
        let offset = 0;
        chunks.forEach((chunk) => {
            responseBytes.set(chunk, offset);
            offset += chunk.byteLength;
        });
    } catch (error) {
        logger.warn('The school timetable response could not be read.', {
            errorName: error.name
        });
        if (error.message === 'The response exceeded the size limit.') {
            throw new HttpsError('resource-exhausted', 'The school returned an unexpectedly large timetable response.');
        }
        throw new HttpsError('unavailable', 'The school timetable response could not be read.');
    }

    let html;
    try {
        html = new TextDecoder('windows-1250', { fatal: true }).decode(responseBytes);
    } catch {
        throw new HttpsError('internal', 'The school timetable used an unsupported character encoding.');
    }

    if (!/<big\b/i.test(html) || !/órarendje\s*<\/big>/i.test(html)) {
        throw new HttpsError(
            'failed-precondition',
            'The school did not confirm these identifiers or did not return a timetable.'
        );
    }

    try {
        return { days: parseTimetable(html) };
    } catch (error) {
        logger.warn('The school response could not be parsed as a timetable.', {
            errorName: error.name
        });
        throw new HttpsError('failed-precondition', 'The school did not return a recognizable timetable.');
    }
}

exports.getMyTimetable = onCall({
    region: 'europe-central2',
    timeoutSeconds: 20,
    memory: '256MiB',
    maxInstances: 10
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'A timetable requires a signed-in account.');
    }
    if (request.data && Object.keys(request.data).length > 0) {
        throw new HttpsError('invalid-argument', 'The timetable request must not include profile data.');
    }

    const profileSnapshot = await database.collection('users').doc(request.auth.uid).get();
    if (!profileSnapshot.exists) {
        throw new HttpsError('failed-precondition', 'The signed-in user profile was not found.');
    }

    const profile = profileSnapshot.data();
    if (!allowedRoles.includes(profile.role)) {
        throw new HttpsError('permission-denied', 'This account cannot access a student timetable.');
    }

    const identifiers = profile.schoolIdentifiers;
    if (!identifiers ||
        typeof identifiers.ejgCode !== 'string' ||
        typeof identifiers.omAzonosito !== 'string') {
        throw new HttpsError('failed-precondition', 'Add both school identifiers in your profile first.');
    }
    const ejgCode = identifiers.ejgCode.trim();
    const omAzonosito = identifiers.omAzonosito.trim();
    if (!ejgCode || !omAzonosito ||
        ejgCode.length > 40 ||
        omAzonosito.length > 20) {
        throw new HttpsError('failed-precondition', 'Add both school identifiers in your profile first.');
    }

    return fetchAndParseTimetable(ejgCode, omAzonosito);
});

exports.verifyMyTimetableIdentifiers = onCall({
    region: 'europe-central2',
    timeoutSeconds: 20,
    memory: '256MiB',
    maxInstances: 10
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'A timetable requires a signed-in account.');
    }

    const input = request.data;
    if (!input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).length !== 2 ||
        typeof input.ejgCode !== 'string' ||
        typeof input.omAzonosito !== 'string') {
        throw new HttpsError('invalid-argument', 'Provide an EJG code and a five-digit OM identifier.');
    }

    const profileSnapshot = await database.collection('users').doc(request.auth.uid).get();
    if (!profileSnapshot.exists || !allowedRoles.includes(profileSnapshot.data().role)) {
        throw new HttpsError('permission-denied', 'A school account is required to verify these identifiers.');
    }

    const ejgCode = input.ejgCode.trim();
    const omAzonosito = input.omAzonosito.trim();
    if (ejgCode.length !== 13 || !/^\d{5}$/.test(omAzonosito)) {
        throw new HttpsError('invalid-argument', 'Provide a 13-character EJG code and a five-digit OM identifier.');
    }

    await fetchAndParseTimetable(ejgCode, omAzonosito);
    return { verified: true };
});

exports.getTimetableForInspector = onCall({
    region: 'europe-central2',
    timeoutSeconds: 20,
    memory: '256MiB',
    maxInstances: 10
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'A timetable requires a signed-in account.');
    }

    const input = request.data;
    if (!input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).length !== 2 ||
        typeof input.ejgCode !== 'string' ||
        typeof input.omAzonosito !== 'string') {
        throw new HttpsError('invalid-argument', 'Provide an EJG code and a five-digit OM identifier.');
    }

    const profileSnapshot = await database.collection('users').doc(request.auth.uid).get();
    if (!profileSnapshot.exists || !privilegedRoles.includes(profileSnapshot.data().role)) {
        throw new HttpsError('permission-denied', 'An administrator role is required for timetable inspection.');
    }

    const ejgCode = input.ejgCode.trim();
    const omAzonosito = input.omAzonosito.trim();
    if (!ejgCode || ejgCode.length > 40 || !/^\d{5}$/.test(omAzonosito)) {
        throw new HttpsError('invalid-argument', 'Provide a valid EJG code and a five-digit OM identifier.');
    }

    return fetchAndParseTimetable(ejgCode, omAzonosito, 'X');
});
