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
    const [translation] = await translate.translate(text, targetLanguage);
    console.log(`Translation: ${translation}`);
  } catch (error) {
    console.error('ERROR:', error);
  }
}

translateText('Hello, world!', 'es');

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

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("New client connected");
  let currentUser = null;
  let userRooms = new Set();

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(ws, data, (user, room) => {
        currentUser = user;
        if (room) {
          userRooms.add(room);
        }
      });
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected: ${currentUser}`);
    if (currentUser) {
      // Remove user from all rooms
      userRooms.forEach((roomId) => {
        if (rooms[roomId]) {
          rooms[roomId].participants = rooms[roomId].participants.filter(
            (p) => p !== currentUser
          );
          if (rooms[roomId].participants.length === 0) {
            delete rooms[roomId];
          } else {
            broadcastToRoom(roomId, {
              type: "room-users-updated",
              room: roomId,
              participants: rooms[roomId].participants,
            });
          }
        }
      });
    }
    userSessions.delete(currentUser);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

function handleWebSocketMessage(ws, data, updateSession) {
  switch (data.type) {
    case "user-connected":
      handleUserConnected(ws, data, updateSession);
      break;

    case "join-room":
      handleJoinRoom(ws, data, updateSession);
      break;

    case "message":
      handleChatMessage(ws, data);
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
  // Here you can store the user's preferred language in a session or database

}
function handleUserConnected(ws, data, updateSession) {
  const { user } = data;
  console.log(`User connected: ${user}`);
  userSessions.set(user, ws);
  updateSession(user, null);
}

function handleJoinRoom(ws, data, updateSession) {
  const { user, room, roomName } = data;

  console.log(`User ${user} joining room ${room}`);

  // Create room if it doesn't exist
  if (!rooms[room]) {
    rooms[room] = {
      id: room,
      name: roomName || room,
      participants: [],
      messages: [],
      createdAt: new Date(),
    };
  }

  // Add user to room if not already there
  if (!rooms[room].participants.includes(user)) {
    rooms[room].participants.push(user);
  }

  updateSession(user, room);

  // Send updated room info to all participants in the room
  broadcastToRoom(room, {
    type: "room-users-updated",
    room: room,
    participants: rooms[room].participants,
  });

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

function handleChatMessage(ws, data) {
  const { room, author, language, text, timestamp } = data;

  if (!rooms[room]) {
    console.error(`Room not found: ${room}`);
    return;
  }

  const message = {
    type: "message",
    room: room,
    author: author,
    language: language,
    text: text,
    timestamp: timestamp,
  };

  // Store message in room
  rooms[room].messages.push(message);

  // Broadcast message to all participants in the room
  broadcastToRoom(room, message);

  console.log(`Message in room ${room} from ${author}: ${text}`);
}

function handleGetRooms(ws) {
  // Send list of all active rooms
  const roomsList = {};
  Object.keys(rooms).forEach((roomId) => {
    roomsList[roomId] = {
      id: rooms[roomId].id,
      name: rooms[roomId].name,
      participants: rooms[roomId].participants,
      messageCount: rooms[roomId].messages.length,
    };
  });

  ws.send(
    JSON.stringify({
      type: "rooms-list",
      rooms: roomsList,
    })
  );
}

function broadcastToRoom(roomId, message) {
  if (!rooms[roomId]) {
    return;
  }

  const participants = rooms[roomId].participants;

  // Send message to all connected clients who are in this room
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      // 1 = OPEN
      client.send(JSON.stringify(message));
    }
  });
}

server.listen(PORT, () => {
  console.log(`✨ Server is running at http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
