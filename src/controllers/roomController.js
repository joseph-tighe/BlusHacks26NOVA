const rooms = {};
const userSessions = new Map();
const userPreferredLanguage = new Map();

export function getRoomsList() {
  const roomsList = {};
  Object.keys(rooms).forEach((roomId) => {
    roomsList[roomId] = {
      id: rooms[roomId].id,
      name: rooms[roomId].name,
      participants: rooms[roomId].participants,
      messageCount: rooms[roomId].messages.length,
      isProtected: !!rooms[roomId].password,
    };
  });
  return roomsList;
}

export function verifyRoomPassword(roomId, password) {
  const room = rooms[roomId];
  if (!room) return true; // New room, allow join
  if (!room.password) return true; // No password required
  return room.password === password;
}

export function setLanguage(user, language, ws) {
  const normalized = String(language || '').trim().toLowerCase();
  if (!user || !normalized) return;
  userPreferredLanguage.set(user, normalized);
  if (ws) ws.language = normalized;
}

export function registerUser(user, ws) {
  if (!user || !ws) return;
  userSessions.set(user, ws);
  ws.user = user;
}

export function unregisterUser(user) {
  if (!user) return;
  userSessions.delete(user);
}

export function createOrJoinRoom(user, roomId, roomName, ws, password = null) {
  if (!user || !roomId) return null;

  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      name: roomName || roomId,
      participants: [],
      messages: [],
      sockets: new Set(),
      password: password || null,
      createdAt: new Date(),
    };
  }

  if (!rooms[roomId].participants.includes(user)) {
    rooms[roomId].participants.push(user);
  }

  if (ws && !rooms[roomId].sockets.has(ws)) {
    rooms[roomId].sockets.add(ws);
  }

  return rooms[roomId];
}

export function removeUserFromAllRooms(user, ws) {
  if (!user) return;
  Object.keys(rooms).forEach((roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    room.participants = room.participants.filter((p) => p !== user);
    if (ws && room.sockets.has(ws)) {
      room.sockets.delete(ws);
    }

    if (room.participants.length === 0) {
      delete rooms[roomId];
    }
  });
}

export function getRoom(roomId) {
  return rooms[roomId] || null;
}

export function getUserLanguage(user, ws) {
  if (!user) return 'en';
  return (userPreferredLanguage.get(user) || (ws && ws.language) || 'en').toLowerCase();
}

export function getUserBySocket(ws) {
  for (const [user, socket] of userSessions.entries()) {
    if (socket === ws) return user;
  }
  return null;
}

export function broadcastRoomEvent(roomId, payload) {
  const room = rooms[roomId];
  if (!room) return;
  for (const client of room.sockets) {
    if (client.readyState !== 1) continue;
    client.send(JSON.stringify(payload));
  }
}

export { rooms, userSessions, userPreferredLanguage };
