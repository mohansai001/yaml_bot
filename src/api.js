const API_URL = 'https://devopsagent-backend-aegmehh9gcetepbf.eastus-01.azurewebsites.net/yaml-agent';

export async function sendMessage(prompt, conversationId = null) {
  const body = { prompt };
  if (conversationId) body.conversation_id = conversationId;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const responseId = data.raw?.raw_representation?.id || null;

  // `output` field is a JSON string — parse it
  let parsed = {};
  try {
    parsed = typeof data.output === 'string' ? JSON.parse(data.output) : data.output;
  } catch {
    parsed = { variable_validation: true, output: data.output || '' };
  }

  return { parsed, responseId };
}
