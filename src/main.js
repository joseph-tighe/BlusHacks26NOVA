import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { WebSocketServer } from "ws";
import http from "http";
import {v2 as TranslateV2} from '@google-cloud/translate';
const translate = new TranslateV2.Translate();

async function translateText(text, targetLanguage) {
  try {
    // In the v2 client, source language is auto-detected by default
    const [translation] = await translate.translate(text, targetLanguage);
    console.log(`Translation (${targetLanguage}): ${translation}`);
    return translation;
  } catch (error) {
    console.error('ERROR:', error);
    return text; // fallback to original text on error
  }
}

// Remove example Translate call to avoid auth errors at startup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = 3000;
const publicDir = path.join(__dirname, "public");

// Serve static files
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Create HTTP server for WebSocket
const server = http.createServer(app);

// Room management
const rooms = {};
const userSessions = new Map();
const userPreferredLanguage = new Map();

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("New client connected");
  let currentUser = null;
  let userRooms = new Set();

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      await handleWebSocketMessage(ws, data, (user, room) => {
        currentUser = user;
        if (room) {
          userRooms.add(room);
        }
      });
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", async () => {
    console.log(`Client disconnected: ${currentUser}`);
    if (currentUser) {
      // Remove user from all rooms
      for (const roomId of userRooms) {
        if (rooms[roomId]) {
          rooms[roomId].participants = rooms[roomId].participants.filter(
            (p) => p !== currentUser
          );
          rooms[roomId].sockets.delete(ws);
          if (rooms[roomId].participants.length === 0) {
            delete rooms[roomId];
          } else {
            await broadcastToRoom(roomId, {
              type: "room-users-updated",
              room: roomId,
              participants: rooms[roomId].participants,
            });
          }
        }
      }
    }
    userSessions.delete(currentUser);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

async function handleWebSocketMessage(ws, data, updateSession) {
  switch (data.type) {
    case "user-connected":
      await handleUserConnected(ws, data, updateSession);
      break;

    case "join-room":
      await handleJoinRoom(ws, data, updateSession);
      break;

    case "message":
      await handleChatMessage(ws, data);
      break;

    case "get-rooms":
      handleGetRooms(ws);
      break;
    case "set-language":
      handleSetLanguage(ws, data);
      break;

    default:
      console.log("Unknown message type:", data.type);
  }
}
function handleSetLanguage(ws, data) {
  const { user, language } = data;
  console.log(`User ${user} set language to ${language}`);
  if (user && language) {
    userPreferredLanguage.set(user, String(language).trim().toLowerCase());
    if (ws) {
      ws.language = String(language).trim().toLowerCase();
    }
  }
}

function handleUserConnected(ws, data, updateSession) {
  const { user } = data;
  console.log(`User connected: ${user}`);
  ws.user = user;
  userSessions.set(user, ws);
  updateSession(user, null);
  broadcastRoomsList();
}

async function handleJoinRoom(ws, data, updateSession) {
  const { user, room, roomName } = data;

  console.log(`User ${user} joining room ${room}`);

  // Create room if it doesn't exist
  if (!rooms[room]) {
    rooms[room] = {
      id: room,
      name: roomName || room,
      participants: [],
      messages: [],
      sockets: new Set(),
      createdAt: new Date(),
    };
  }

  // Add user to room if not already there
  if (!rooms[room].participants.includes(user)) {
    rooms[room].participants.push(user);
  }

  if (!rooms[room].sockets.has(ws)) {
    rooms[room].sockets.add(ws);
  }

  updateSession(user, room);

  // Send updated room info to all participants in the room
  await broadcastToRoom(room, {
    type: "room-users-updated",
    room: room,
    participants: rooms[room].participants,
  });

  // Broadcast updated rooms list to everyone
  broadcastRoomsList();

  // Send all existing messages in the room to the joining user
  rooms[room].messages.forEach((msg) => {
    ws.send(JSON.stringify(msg));
  });

  // Notify user of successful room join
  ws.send(
    JSON.stringify({
      type: "room-joined",
      room: room,
      participants: rooms[room].participants,
    })
  );
}

async function handleChatMessage(ws, data) {
  const { room, author, language, text, timestamp } = data;

  if (!rooms[room]) {
    console.error(`Room not found: ${room}`);
    return;
  }

  const targetLanguage =
    language || userPreferredLanguage.get(author) || 'en';

  let translatedText;
  if (targetLanguage === "English" || targetLanguage === "english") {
    translatedText = await translateText(text, 'en');
  } else if (targetLanguage === "en") {
    translatedText = text;
  } else {
    translatedText = await translateText(text, targetLanguage);
  }

  const message = {
    type: "message",
    room: room,
    author: author,
    text: translatedText,
    sourceText: text,
    translatedText: translatedText,
    language: targetLanguage,
    timestamp: timestamp,
  };

  // Store message in room
  rooms[room].messages.push(message);

  // Broadcast message to all participants in the room
  await broadcastToRoom(room, message);

  console.log(`Message in room ${room} from ${author} (detected source): ${text}`);
}

function getRoomsList() {
  const roomsList = {};
  Object.keys(rooms).forEach((roomId) => {
    roomsList[roomId] = {
      id: rooms[roomId].id,
      name: rooms[roomId].name,
      participants: rooms[roomId].participants,
      messageCount: rooms[roomId].messages.length,
    };
  });
  return roomsList;
}

function handleGetRooms(ws) {
  ws.send(
    JSON.stringify({
      type: "rooms-list",
      rooms: getRoomsList(),
    })
  );
}

function broadcastRoomsList() {
  const payload = JSON.stringify({
    type: "rooms-list",
    rooms: getRoomsList(),
  });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

async function getUserByWebSocket(ws) {
  for (const [user, socket] of userSessions.entries()) {
    if (socket === ws) {
      return user;
    }
  }
  return null;
}

async function broadcastToRoom(roomId, message) {
  if (!rooms[roomId]) {
    return;
  }

  const participants = rooms[roomId].participants;
  const sourceText = message.sourceText || message.text || '';

  const roomSockets = rooms[roomId]?.sockets;
  if (!roomSockets) {
    return;
  }

  for (const client of roomSockets) {
    if (client.readyState !== 1) {
      continue;
    }

    const clientUser = client.user || (await getUserByWebSocket(client));
    if (!clientUser) {
      continue;
    }

    const isGuest = !rooms[roomId].participants.includes(clientUser);
    if (isGuest) {
      continue;
    }

    const clientLang = (userPreferredLanguage.get(clientUser) || client.language || 'en').toLowerCase();
    let textToSend = sourceText;

    if (clientLang !== 'en') {
      textToSend = await translateText(sourceText, clientLang);
    }

    const payload = {
      type: 'message',
      room: roomId,
      author: message.author,
      text: textToSend,
      sourceText: sourceText,
      translatedText: textToSend,
      language: clientLang,
      timestamp: message.timestamp,
    };

    client.send(JSON.stringify(payload));
    console.log(`Broadcast to ${clientUser} (${clientLang}) in room ${roomId}: ${textToSend}`);
  }
}

const chosenPort = process.env.PORT ? Number(process.env.PORT) : PORT;

function startServer(port) {
  const onError = (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use. Trying ${port + 1}...`);
      server.removeListener('error', onError);
      setTimeout(() => startServer(port + 1), 1000);
    } else {
      console.error('Server error:', error);
      process.exit(1);
    }
  };

  server.once('error', onError);

  server.listen(port, () => {
    console.log(`✨ Server is running at http://localhost:${port}`);
    console.log(`WebSocket endpoint: ws://localhost:${port}`);
  });
}

startServer(chosenPort);
