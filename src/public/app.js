// Chat application state
const state = {
    currentUser: null,
    currentRoom: null,
    rooms: {},
    messages: {},
    socket: null,
};

// DOM Elements
const userInput = document.getElementById('userInput');
const setUserBtn = document.getElementById('setUserBtn');
const username = document.getElementById('username');
const roomInput = document.getElementById('roomInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const roomList = document.getElementById('roomList');
const roomTitle = document.getElementById('roomTitle');
const roomDescription = document.getElementById('roomDescription');
const roomUsers = document.getElementById('roomUsers');
const messagesContainer = document.getElementById('messagesContainer');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// Initialize WebSocket connection
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    state.socket = new WebSocket(wsUrl);

    state.socket.onopen = () => {
        console.log('Connected to WebSocket');
        if (state.currentUser) {
            state.socket.send(JSON.stringify({
                type: 'user-connected',
                user: state.currentUser,
            }));
        }
    };

    state.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    state.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    state.socket.onclose = () => {
        console.log('Disconnected from WebSocket');
        setTimeout(initWebSocket, 3000);
    };
}

// Handle incoming messages
function handleMessage(data) {
    switch (data.type) {
        case 'message':
            addMessage(data.room, data);
            break;
        case 'room-created':
            addRoomToList(data.room, data.participants);
            break;
        case 'room-users-updated':
            updateRoomUsers(data.room, data.participants);
            break;
        case 'rooms-list':
            loadRoomsList(data.rooms);
            break;
    }
}

// Set username
setUserBtn.addEventListener('click', () => {
    const name = userInput.value.trim();
    if (name) {
        state.currentUser = name;
        username.textContent = `👤 ${name}`;
        userInput.value = '';
        userInput.disabled = true;
        setUserBtn.disabled = true;
        
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            state.socket.send(JSON.stringify({
                type: 'user-connected',
                user: state.currentUser,
            }));
        }
        requestRoomsList();
    }
});

// Create or join room
createRoomBtn.addEventListener('click', () => {
    if (!state.currentUser) {
        alert('Please set your username first');
        return;
    }

    const roomName = roomInput.value.trim();
    if (roomName) {
        createOrJoinRoom(roomName);
        roomInput.value = '';
    }
});

// Send message
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    if (!state.currentRoom) {
        alert('Please select a room first');
        return;
    }

    const message = messageInput.value.trim();
    if (message) {
        const msgData = {
            type: 'message',
            room: state.currentRoom,
            author: state.currentUser,
            text: message,
            timestamp: new Date().toISOString(),
        };

        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            state.socket.send(JSON.stringify(msgData));
        }

        messageInput.value = '';
        messageInput.focus();
    }
}

// Add message to display
function addMessage(room, msgData) {
    if (!state.messages[room]) {
        state.messages[room] = [];
    }
    state.messages[room].push(msgData);

    if (state.currentRoom === room) {
        displayMessage(msgData);
    }
}

function displayMessage(msgData) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msgData.author === state.currentUser ? 'own' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = msgData.author.charAt(0).toUpperCase();

    const content = document.createElement('div');
    content.className = 'message-content';

    const header = document.createElement('div');
    header.className = 'message-header';

    if (msgData.author !== state.currentUser) {
        const author = document.createElement('span');
        author.className = 'message-author';
        author.textContent = msgData.author;
        header.appendChild(author);
    }

    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatTime(msgData.timestamp);
    header.appendChild(time);

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = msgData.text;

    content.appendChild(header);
    content.appendChild(text);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    messages.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Create or join room
function createOrJoinRoom(roomName) {
    const roomId = roomName.toLowerCase().replace(/\s+/g, '-');

    if (!state.rooms[roomId]) {
        state.rooms[roomId] = {
            id: roomId,
            name: roomName,
            participants: [state.currentUser],
            messages: [],
        };
    } else if (!state.rooms[roomId].participants.includes(state.currentUser)) {
        state.rooms[roomId].participants.push(state.currentUser);
    }

    selectRoom(roomId);

    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({
            type: 'join-room',
            room: roomId,
            roomName: roomName,
            user: state.currentUser,
        }));
    }

    addRoomToList(roomId, state.rooms[roomId].participants, roomName);
}

// Select room
function selectRoom(roomId) {
    state.currentRoom = roomId;
    const room = state.rooms[roomId];

    roomTitle.textContent = room.name;
    roomDescription.textContent = `${room.participants.length} participant${room.participants.length !== 1 ? 's' : ''}`;

    // Update room list UI
    document.querySelectorAll('.room-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeRoom = document.querySelector(`[data-room-id="${roomId}"]`);
    if (activeRoom) {
        activeRoom.classList.add('active');
    }

    // Clear and display messages
    messages.innerHTML = '';
    if (state.messages[roomId]) {
        state.messages[roomId].forEach(msg => displayMessage(msg));
    } else {
        messages.innerHTML = `<div class="empty-state"><div>No messages yet. Start the conversation!</div></div>`;
    }

    updateRoomUsers(roomId, room.participants);
    messageInput.focus();
}

// Add room to list
function addRoomToList(roomId, participants = [], roomName = null) {
    if (!state.rooms[roomId]) {
        state.rooms[roomId] = {
            id: roomId,
            name: roomName || roomId,
            participants: participants,
            messages: [],
        };
    }

    const existingRoom = document.querySelector(`[data-room-id="${roomId}"]`);
    if (!existingRoom) {
        const roomItem = document.createElement('div');
        roomItem.className = 'room-item';
        roomItem.dataset.roomId = roomId;

        const namePart = document.createElement('div');
        namePart.className = 'room-name';
        namePart.textContent = state.rooms[roomId].name;

        const badge = document.createElement('div');
        badge.className = 'room-badge';
        badge.textContent = participants.length;

        roomItem.appendChild(namePart);
        roomItem.appendChild(badge);

        roomItem.addEventListener('click', () => selectRoom(roomId));

        roomList.appendChild(roomItem);
    } else {
        const badge = existingRoom.querySelector('.room-badge');
        if (badge) {
            badge.textContent = participants.length;
        }
    }
}

// Update room users display
function updateRoomUsers(room, participants) {
    if (room === state.currentRoom) {
        roomUsers.innerHTML = '';
        participants.forEach(participant => {
            const userDiv = document.createElement('div');
            userDiv.className = 'user-avatar';
            userDiv.title = participant;
            userDiv.textContent = participant.charAt(0).toUpperCase();
            roomUsers.appendChild(userDiv);
        });
    }

    if (state.rooms[room]) {
        state.rooms[room].participants = participants;
    }
}

// Request rooms list from server
function requestRoomsList() {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({
            type: 'get-rooms',
        }));
    }
}

// Load rooms list
function loadRoomsList(roomsList) {
    roomList.innerHTML = '';
    Object.keys(roomsList).forEach(roomId => {
        const room = roomsList[roomId];
        addRoomToList(roomId, room.participants, room.name);
    });
}

// Format time
function formatTime(isoString) {
    const date = new Date(isoString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Initialize app
window.addEventListener('load', () => {
    initWebSocket();
});
