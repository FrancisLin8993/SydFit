// src/gcpAuth.js
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth();

export async function getGcpAuthHeaders(targetAudience) {
  try {
    const client = await auth.getIdTokenClient(targetAudience);

    const headers = await client.getRequestHeaders();

    const plainHeaders = {};
    if (typeof headers.forEach === "function") {
      headers.forEach((value, key) => {
        plainHeaders[key] = value;
      });
    } else {
      Object.assign(plainHeaders, headers);
    }

    if (!plainHeaders.Authorization && !plainHeaders.authorization) {
      console.warn("⚠️ [Auth] Headers fetched but no Authorization key found:", plainHeaders);
    } else {
      console.log("✅ [Auth] Token fetched successfully via SDK.");
    }

    return plainHeaders;
  } catch (error) {
    console.error("❌ [Auth] Failed to fetch ID Token via SDK:", error);
    return {};
  }
}