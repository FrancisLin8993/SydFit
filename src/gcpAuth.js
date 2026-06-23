import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth();

export async function getGcpAuthHeaders(targetAudience) {
  try {
    const client = await auth.getIdTokenClient(targetAudience);
    const headers = await client.getRequestHeaders();
    return headers;
  } catch (error) {
    console.error(`⚠️ 无法获取 GCP IAM Token (目标: ${targetAudience}):`, error);
    return {};
  }
}