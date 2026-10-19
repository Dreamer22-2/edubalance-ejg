const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { parseTimetable } = require('./timetable-parser');

initializeApp();

const database = getFirestore();
const timetableEndpoint = 'https://suli.ejg.hu/intranet/szulkuk/szulkuk.php';
const allowedRoles = ['user', 'admin', 'dev', 'owner'];
const schoolEmailPattern = /@e5vos\.hu$/i;

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

    const email = request.auth.token.email;
    if (typeof email !== 'string' ||
        email.length > 254 ||
        request.auth.token.email_verified !== true ||
        !schoolEmailPattern.test(email)) {
        throw new HttpsError('permission-denied', 'A verified school account is required.');
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

    const form = new URLSearchParams({
        EMAIL: email,
        DIAKKOD: ejgCode,
        OMKOD: omAzonosito
    });
    const requestBody = `${form.toString()}&orarend=V%E1laszt`;

    let upstreamResponse;
    try {
        upstreamResponse = await fetch(timetableEndpoint, {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(12000),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html'
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
        if (!reader) {
            throw new Error('The response body is unavailable.');
        }
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
        html = new TextDecoder('iso-8859-2', { fatal: true }).decode(responseBytes);
    } catch {
        throw new HttpsError('internal', 'The school timetable used an unsupported character encoding.');
    }

    try {
        return { days: parseTimetable(html) };
    } catch (error) {
        logger.warn('The school response could not be parsed as a timetable.', {
            errorName: error.name
        });
        throw new HttpsError('failed-precondition', 'The school did not return a recognizable timetable.');
    }
});
