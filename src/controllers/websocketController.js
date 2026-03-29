import { createOrJoinRoom, getRoomsList, removeUserFromAllRooms, registerUser, unregisterUser, setLanguage, getRoom, getUserBySocket, userPreferredLanguage, getUserLanguage, broadcastRoomEvent, verifyRoomPassword } from './roomController.js';
import { broadcastToRoom } from './messageController.js';
import { translateText } from './translateController.js';

export function registerWebSocketHandlers(wss) {
  wss.on('connection', (ws) => {
    console.log('New client connected');

    let currentUser = null;
    let userRooms = new Set();

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.type) {
          case 'user-connected':
            currentUser = data.user;
            if (currentUser) {
              registerUser(currentUser, ws);
            }
            broadcastRoomsList(wss);
            break;

          case 'set-language':
            setLanguage(data.user, data.language, ws);
            break;

          case 'join-room': {
            if (!data.user || !data.room) {
              console.warn('join-room missing user or room', data);
              break;
            }

            // Verify password if required
            if (!verifyRoomPassword(data.room, data.password)) {
              ws.send(JSON.stringify({
                type: 'join-room-failed',
                room: data.room,
                reason: 'incorrect-password',
              }));
              break;
            }

            const room = createOrJoinRoom(data.user, data.room, data.roomName, ws, data.password);
            userRooms.add(data.room);

            const participants = room.participants || [];

            broadcastRoomEvent(data.room, {
              type: 'room-users-updated',
              room: data.room,
              participants,
            });

            broadcastRoomsList(wss);

            (room.messages || []).forEach((msg) => {
              ws.send(JSON.stringify(msg));
            });

            ws.send(JSON.stringify({
              type: 'room-joined',
              room: data.room,
              roomName: room.name,
              participants,
            }));
            break;
          }

          case 'message': {
            if (!data.room || !data.author || !data.text) {
              console.warn('Invalid message payload', data);
              break;
            }

            const room = getRoom(data.room);
            if (!room) {
              console.warn('Message for non-existing room', data.room);
              break;
            }

            const sourceText = data.text;
            const sourceLang = data.language || getUserLanguage(data.author, ws) || 'en';
            const payload = {
              type: 'message',
              room: data.room,
              author: data.author,
              text: sourceText,
              sourceText,
              sourceLanguage: sourceLang,
              timestamp: data.timestamp || new Date().toISOString(),
            };

            room.messages.push(payload);
            await broadcastToRoom(data.room, payload, wss);
            break;
          }

          case 'get-rooms':
            ws.send(JSON.stringify({ type: 'rooms-list', rooms: getRoomsList() }));
            break;

          default:
            console.warn('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', async () => {
      console.log(`Client disconnected: ${currentUser}`);
      if (currentUser) {
        removeUserFromAllRooms(currentUser, ws);
        broadcastRoomsList(wss);
      }
      unregisterUser(currentUser);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
}

function broadcastRoomsList(wss) {
  const payload = JSON.stringify({ type: 'rooms-list', rooms: getRoomsList() });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}
