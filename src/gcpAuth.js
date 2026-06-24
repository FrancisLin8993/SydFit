import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth();

export async function getGcpAuthHeaders(targetAudience) {
  try {
    const client = await auth.getIdTokenClient(targetAudience);
    const headers = await client.getRequestHeaders();
    console.log("✅ [Auth] Token fetched successfully.");
    return headers;
  } catch (error) {
    console.error(`⚠️ Cannot get GCP IAM Token (Target audience: ${targetAudience}):`, error);
    return {};
  }
}