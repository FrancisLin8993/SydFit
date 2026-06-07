export async function sendBarkNotification(config, { title, body, subtitle }, fetcher = fetch) {
  const response = await fetcher(`${config.barkServerUrl}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      device_key: config.barkDeviceKey,
      title,
      subtitle,
      body,
      group: config.barkGroup,
      level: config.barkLevel
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Bark push failed: ${response.status} ${response.statusText} ${details}`);
  }

  return response.json();
}
