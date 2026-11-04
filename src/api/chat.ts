export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ChatResponse {
  reply: string;
  isEmergency: boolean;
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[]
): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Chat error ${res.status}`);
  }

  return res.json() as Promise<ChatResponse>;
}
