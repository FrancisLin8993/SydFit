// src/bark.js

// 1. Add fetcher parameter for dependency injection in tests
export async function sendBarkNotification(config, notification, fetcher = fetch) {
  try {
    const { barkServerUrl, barkDeviceKey, barkGroup, barkLevel } = config;

    if (!barkDeviceKey) {
      console.warn("⚠️ [Bark] Device key missing. Skipping push notification.");
      return;
    }

    const payload = {
      title: notification.title || "SydFit Notification",
      subtitle: notification.subtitle,
      markdown: notification.body, 
      group: barkGroup || "SydFit",
      level: barkLevel || "active",
      isArchive: 1 
    };

    // Use the injected fetcher
    const response = await fetcher(`${barkServerUrl}/${barkDeviceKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(`Bark HTTP ${response.status}: ${errorDetails}`);
    }

    console.log(`✅ [Bark] Notification sent successfully (Title: "${notification.title}").`);
  } catch (error) {
    console.error("❌ [Bark] Failed to send push notification:", error);
    // 2. Re-throw the error so unit tests and the caller (index.js) can catch it
    throw error; 
  }
}