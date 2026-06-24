import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth();

export async function getGcpAuthHeaders(targetAudience) {
  console.log(`🔍 [Auth] 准备向 Google Metadata 请求 Token，目标 Audience: [${targetAudience}]`);
  
  try {
    // 强制校验传入的 Audience 格式
    if (!targetAudience || !targetAudience.startsWith('http')) {
       throw new Error(`传入的 Audience 格式不正确: ${targetAudience}`);
    }

    const metadataUrl = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(targetAudience)}`;
    
    console.log(`🔍 [Auth] 正在 Fetch URL: ${metadataUrl}`);

    const response = await fetch(metadataUrl, {
      headers: { "Metadata-Flavor": "Google" }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Auth 致命错误] Metadata 服务器拒绝了请求! 状态码: ${response.status}, 详情: ${errorText}`);
      return {}; 
    }

    const token = await response.text();
    console.log(`✅ [Auth 成功] 拿到了真实 GCP Token，长度: ${token.length}`);
    
    return { 
      "Authorization": `Bearer ${token.trim()}` 
    };

  } catch (error) {
    console.error(`❌ [Auth 代码异常] 获取 Token 过程中代码报错:`, error.message);
    console.error(error.stack);
    return {};
  }
}