import { rooms, getUserBySocket, getUserLanguage } from './roomController.js';
import { translateText } from './translateController.js';

export function createMessagePayload(message) {
  return {
    type: 'message',
    room: message.room,
    author: message.author,
    text: message.translatedText || message.sourceText || message.text || '',
    sourceText: message.sourceText || message.text || '',
    translatedText: message.translatedText || message.text || '',
    language: message.language || 'en',
    timestamp: message.timestamp || new Date().toISOString(),
  };
}

export async function broadcastToRoom(roomId, message, wss) {
  const room = rooms[roomId];
  if (!room) return;

  const sourceText = message.sourceText || message.text || '';
  const sourceLang = message.sourceLanguage || 'en';

  for (const client of room.sockets) {
    if (client.readyState !== 1) continue;

    const clientUser = client.user || (await getUserBySocket(client));
    if (!clientUser) continue;
    if (!room.participants.includes(clientUser)) continue;

    const clientLang = getUserLanguage(clientUser, client);
    let textToSend;
    if (clientLang === sourceLang) {
      textToSend = sourceText;
    } else {
      textToSend = await translateText(sourceText, clientLang);
    }

    const payload = {
      type: 'message',
      room: roomId,
      author: message.author,
      text: textToSend,
      sourceText,
      translatedText: textToSend,
      language: clientLang,
      timestamp: message.timestamp || new Date().toISOString(),
    };

    client.send(JSON.stringify(payload));
  }
}
