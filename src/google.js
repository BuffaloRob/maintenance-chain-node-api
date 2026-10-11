import { createLocalJWKSet, createRemoteJWKSet, errors, jwtVerify } from 'jose';
import config from './config.js';

const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// The keys Google signs ID tokens with, fetched when first needed and cached.
let keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

// For tests, which sign their own ID tokens.
export function setKeysForTests(jwks) {
  keys = createLocalJWKSet(jwks);
}

// Checks an ID token from Google's sign-in button: Google signed it, for this
// app, and it hasn't expired. Returns the Google account's id and email
// address, or undefined if the token doesn't pass or Google hasn't verified
// the address.
export async function verifyIdToken(token) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      issuer: ISSUERS,
      audience: config.googleClientId,
      requiredClaims: ['sub', 'email'],
    }));
  } catch (error) {
    // Not being able to fetch Google's keys is our problem, not the token's.
    if (error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout)) return;
    throw error;
  }
  if (payload.email_verified !== true) return;
  return { uid: payload.sub, email: payload.email };
}
