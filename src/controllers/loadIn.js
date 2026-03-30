import path from 'path';
import fs, { read } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rooms = {};


function readRoomData() {
  const roomsFile = path.join(__dirname, '../../data/chats.json');
  const data = fs.readFileSync(roomsFile, 'utf8');
  return JSON.parse(data);
}
export function loadRoomsList() {
  const roomData = readRoomData();
  Object.keys(roomData).forEach((roomId) => {
    rooms[roomId] = roomData[roomId];
  });
  return rooms;
}