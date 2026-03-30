import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadRoomsList } from './loadIn.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rooms = loadRoomsList();
const userSessions = new Map();
const userPreferredLanguage = new Map();

function updateRoom(roomId) {
  if (!rooms[roomId] || rooms[roomId].isTemp) return;
  writeRoomData();
}

function writeRoomData() {
  const roomsFile = path.join(__dirname, '../../data/chats.json');
  // Serialize rooms without sockets (they're live objects that can't be saved)
  const serializable = {};
  Object.keys(rooms).forEach((roomId) => {
    const { sockets, ...rest } = rooms[roomId];
    serializable[roomId] = rest;
  });
  fs.writeFileSync(roomsFile, JSON.stringify(serializable, null, 2));
}

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
  if (!room) return true;
  if (!room.password) return true;
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

export function createOrJoinRoom(user, roomId, roomName, ws, password = null, isTemp = false) {
  if (!user || !roomId) return null;

  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      name: roomName || roomId,
      participants: [],
      messages: [],
      sockets: new Set(),
      password: password || null,
      isTemp: isTemp || false,
      createdAt: new Date(),
    };
  }

  // Ensure sockets is always a Set (safety guard)
  if (!(rooms[roomId].sockets instanceof Set)) {
    rooms[roomId].sockets = new Set();
  }

  if (!rooms[roomId].participants.includes(user)) {
    rooms[roomId].participants.push(user);
  }

  if (ws) rooms[roomId].sockets.add(ws);

  return rooms[roomId];
}

export function removeUserFromAllRooms(user, ws) {
  if (!user) return;
  Object.keys(rooms).forEach((roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    // Ensure sockets is always a Set (safety guard)
    if (!(room.sockets instanceof Set)) {
      room.sockets = new Set();
    }

    room.participants = room.participants.filter((p) => p !== user);
    if (ws) room.sockets.delete(ws);

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

  // Ensure sockets is always a Set (safety guard)
  if (!(room.sockets instanceof Set)) {
    room.sockets = new Set();
  }

  for (const client of room.sockets) {
    if (client.readyState !== 1) continue;
    client.send(JSON.stringify(payload));
  }
  updateRoom(roomId);
}

export { rooms, userSessions, userPreferredLanguage };