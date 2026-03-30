// Chat application state
const state = {
    currentUser: null,
    currentRoom: null,
    rooms: {},
    messages: {},
    socket: null,
    pendingPasswordRoom: null, // Track which room needs password
    pendingJoinRoom: null,     // Track room we're waiting to join
    pendingJoinPassword: null, // Password for pending join
};

// DOM Elements
const userInput = document.getElementById('userInput');
const languageInput = document.getElementById('languageInput');
const setUserBtn = document.getElementById('setUserBtn');
const setLanguageBtn = document.getElementById('setLanguageBtn');
const languageLabel = document.getElementById('languageLabel');
const username = document.getElementById('username');
const roomInput = document.getElementById('roomInput');
const roomPasswordInput = document.getElementById('roomPasswordInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomList = document.getElementById('roomList');
const roomTitle = document.getElementById('roomTitle');
const roomDescription = document.getElementById('roomDescription');
const roomUsers = document.getElementById('roomUsers');
const messagesContainer = document.getElementById('messagesContainer');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const openSidebarBtn = document.getElementById('openSidebarBtn');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const sidebar = document.querySelector('.sidebar');
const temp = document.getElementById('temp');

// Modal Elements
const passwordModal = document.getElementById('passwordModal');
const modalRoomName = document.getElementById('modalRoomName');
const modalPasswordInput = document.getElementById('modalPasswordInput');
const modalSubmit = document.getElementById('modalSubmit');
const modalCancel = document.getElementById('modalCancel');
const modalClose = document.getElementById('modalClose');

// Initialize WebSocket connection
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    state.socket = new WebSocket(wsUrl);

    state.socket.onopen = () => {
        console.log('Connected to WebSocket');
        requestRoomsList();
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
    console.log('WS event:', data);
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
        case 'room-joined':
            // Keep UI in sync when the server confirms join
            if (data.room) {
                const roomId = data.room;
                const roomName = data.roomName || roomId;

                state.pendingJoinRoom = null;
                state.pendingJoinPassword = null;

                if (!state.rooms[roomId]) {
                    state.rooms[roomId] = {
                        id: roomId,
                        name: roomName,
                        participants: data.participants || [],
                        messages: state.messages[roomId] || [],
                        password: data.password || null,
                        isProtected: !!data.password,
                    };
                } else {
                    state.rooms[roomId].name = roomName;
                    state.rooms[roomId].participants = data.participants || [];
                    state.rooms[roomId].isProtected = state.rooms[roomId].isProtected || !!data.password;
                }

                addRoomToList(roomId, data.participants || [], state.rooms[roomId].name);
                selectRoom(roomId, false);
            }
            break;
        case 'join-room-failed':
            if (data.room && state.pendingJoinRoom === data.room) {
                state.pendingJoinRoom = null;
                state.pendingJoinPassword = null;
            }

            if (data.reason === 'incorrect-password') {
                alert('Incorrect password for this room');
            } else {
                alert('Failed to join room');
            }
            break;
        default:
            console.warn('Unhandled WS event type:', data.type);
    }
}

// Set username
setLanguageBtn.addEventListener('click', () => {
    const language = languageInput.value.trim();
    if (language) {
        const mappedLanguage = {
            english: 'en',
            spanish: 'es',
            french: 'fr',
            german: 'de',
            chinese: 'zh',
            japanese: 'ja',
        }[language.toLowerCase()] || language.toLowerCase();

        state.currentLanguage = mappedLanguage;
        languageLabel.textContent = `${mappedLanguage}`;
        languageInput.value = '';
        languageInput.disabled = true;
        setLanguageBtn.disabled = true;
        
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            state.socket.send(JSON.stringify({
                type: 'set-language',
                user: state.currentUser,
                language: state.currentLanguage,
            }));
        }
        requestRoomsList();
    }
});
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
    if (!roomName) {
        alert('Please enter a room name');
        return;
    }

    const roomPasswordValue = roomPasswordInput.value.trim();
    const roomPassword = roomPasswordValue ? roomPasswordValue : null;
    const isTemp = temp.checked;
    
    createOrJoinRoom(roomName, roomPassword, isTemp);
    roomInput.value = '';
    roomPasswordInput.value = '';
});

// Join existing room button
joinRoomBtn.addEventListener('click', () => {
    if (!state.currentUser) {
        alert('Please set your username first');
        return;
    }

    const roomName = roomInput.value.trim();
    if (!roomName) {
        alert('Please enter a room name to join');
        return;
    }

    const roomId = roomName.toLowerCase().replace(/\s+/g, '-');
    const roomPasswordValue = roomPasswordInput.value.trim();
    const roomPassword = roomPasswordValue ? roomPasswordValue : null;
    
    // Attempt to join via selectRoom (sends join-room message to server)
    selectRoom(roomId, true, roomPassword);
    
    roomInput.value = '';
    roomPasswordInput.value = '';
});

// Modal helper functions
function showPasswordModal(roomId, roomName) {
    state.pendingPasswordRoom = roomId;
    modalRoomName.textContent = `Enter password for "${roomName}"`;
    modalPasswordInput.value = '';
    passwordModal.classList.remove('hidden');
    modalPasswordInput.focus();
}

function hidePasswordModal() {
    passwordModal.classList.add('hidden');
    state.pendingPasswordRoom = null;
    modalPasswordInput.value = '';
}

function submitPassword() {
    if (!state.pendingPasswordRoom) return;
    const password = modalPasswordInput.value;
    hidePasswordModal();
    selectRoom(state.pendingPasswordRoom, true, password);
}

// Send message
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    if (!state.currentUser) {
        alert('Please set your username first');
        return;
    }

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
            language: state.currentLanguage,
            text: message,
            timestamp: new Date().toISOString(),
        };

        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            state.socket.send(JSON.stringify(msgData));
            // Do not add locally: server echo will handle display and avoid duplicates.
        } else {
            console.warn('Cannot send message: socket not open');
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

    const msgLeft = document.createElement('div');
    msgLeft.className = 'msg-left';

    const author = document.createElement('div');
    author.className = 'msg-author';
    author.textContent = msgData.author || 'Unknown';
    msgLeft.appendChild(author);

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = formatTime(msgData.timestamp);
    msgLeft.appendChild(time);

    const msgBody = document.createElement('div');
    msgBody.className = 'msg-body';
    msgBody.textContent = msgData.text;

    messageDiv.appendChild(msgLeft);
    messageDiv.appendChild(msgBody);

    messages.appendChild(messageDiv);
    
    // Auto-scroll to bottom, but only if user is already at the bottom
    setTimeout(() => {
        const isAtBottom = messagesContainer.scrollTop + messagesContainer.clientHeight >= messagesContainer.scrollHeight - 50;
        if (isAtBottom) {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, 0);
}

// Create or join room
function createOrJoinRoom(roomName, password = null, isTemp = false) {
    const roomId = roomName.toLowerCase().replace(/\s+/g, '-');

    if (!state.rooms[roomId]) {
        state.rooms[roomId] = {
            id: roomId,
            name: roomName,
            participants: [state.currentUser],
            messages: [],
            password: password,
            isTemp: isTemp,
        };
    } else if (!state.rooms[roomId].participants.includes(state.currentUser)) {
        state.rooms[roomId].participants.push(state.currentUser);
    }

    addRoomToList(roomId, state.rooms[roomId].participants, roomName);
    selectRoom(roomId, true, password);
}

// Select room
function selectRoom(roomId, notifyServer = false, password = null) {
    if (!state.currentUser) {
        alert('Please set your username first');
        return;
    }

    if (state.currentRoom === roomId && !notifyServer) {
        // Already selected (local state) - keep UI in sync.
        updateRoomUsers(roomId, state.rooms[roomId]?.participants || []);
        return;
    }

    const room = state.rooms[roomId] || {
        id: roomId,
        name: roomId,
        participants: [],
        messages: [],
    };

    if (notifyServer) {
        // Defer actual selection until the server authorizes the join.
        state.pendingJoinRoom = roomId;
        state.pendingJoinPassword = password || (room.password ? room.password : null);

        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            state.socket.send(JSON.stringify({
                type: 'join-room',
                room: roomId,
                roomName: room.name,
                user: state.currentUser,
                password: state.pendingJoinPassword,
            }));
        }
        return;
    }

    state.currentRoom = roomId;
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
    if (state.messages[roomId] && state.messages[roomId].length) {
        state.messages[roomId].forEach(msg => displayMessage(msg));
    } else {
        messages.innerHTML = `<div class="empty-state"><div>No messages yet. Start the conversation!</div></div>`;
    }

    updateRoomUsers(roomId, room.participants);

    // Scroll to bottom to show latest messages
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 0);

    messageInput.focus();
    hideSidebarOnMobile();
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
        const roomName = state.rooms[roomId].name;
        const isProtected = state.rooms[roomId].isProtected;
        namePart.textContent = isProtected ? `🔒 ${roomName}` : roomName;

        const badge = document.createElement('div');
        badge.className = 'room-badge';
        badge.textContent = participants.length;

        roomItem.appendChild(namePart);
        roomItem.appendChild(badge);

        roomItem.addEventListener('click', () => {
            const room = state.rooms[roomId];
            // If room has a password and we're not the creator, prompt for password
            if (room && room.isProtected && !room.password) {
                showPasswordModal(roomId, room.name);
            } else {
                selectRoom(roomId, true);
            }
        });

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
    if (!state.rooms[room]) {
        state.rooms[room] = {
            id: room,
            name: room,
            participants: participants,
            messages: [],
        };
    } else {
        state.rooms[room].participants = participants;
    }

    addRoomToList(room, participants, state.rooms[room].name);

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
        // Update room state with isProtected flag
        if (!state.rooms[roomId]) {
            state.rooms[roomId] = {
                id: roomId,
                name: room.name,
                participants: room.participants || [],
                messages: [],
                isProtected: room.isProtected || false,
            };
        } else {
            state.rooms[roomId].isProtected = room.isProtected || false;
        }
        addRoomToList(roomId, room.participants, room.name);
    });
}

// Format time
function formatTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
        return '--:--';
    }
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Modal event listeners
modalSubmit.addEventListener('click', submitPassword);
modalCancel.addEventListener('click', hidePasswordModal);
modalClose.addEventListener('click', hidePasswordModal);
modalPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        submitPassword();
    }
});

toggleSidebarBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('visible');
});

openSidebarBtn?.addEventListener('click', () => {
    sidebar?.classList.add('visible');
});

// Optionally auto-hide sidebar on room select in mobile mode
function hideSidebarOnMobile() {
    if (window.innerWidth <= 854) {
        sidebar?.classList.remove('visible');
    }
}

// Initialize app
window.addEventListener('load', () => {
    // Hide loading screen after 1 second
    setTimeout(() => {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
    }, 1000);
    
    initWebSocket();
});
