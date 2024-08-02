const express = require('express');
// const fs = require('fs');
// const https = require('https');
const socketIo = require('socket.io');
const path = require('path');
const { createServer } = require('http');

const app = express();
const server = createServer(app);
// const server = https.createServer({
//   key: fs.readFileSync('key.pem'),
//   cert: fs.readFileSync('cert.pem')
// }, app);
const io = socketIo(server);

const rooms = new Map();
const waitingUsers = [];

app.use(express.static('public'));

app.get('/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    handleDisconnect(socket);
  });

  socket.on('join-room', (roomId, username) => {
    if (!roomId) {
      roomId = findOrCreateRoom();
      socket.emit('room-created', roomId);
    }

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    const room = rooms.get(roomId);

    if (room.size >= 2) {
      socket.emit('room-full');
      waitingUsers.push({ socketId: socket.id, username });
    } else {
      socket.join(roomId);
      room.add(socket.id);
      socket.to(roomId).emit('user-connected', socket.id, username);
      socket.emit('room-joined', roomId);
    }

    socket.on('signal', (data) => {
      io.to(data.userId).emit('signal', {
        userId: socket.id,
        signal: data.signal,
        username: data.username
      });
    });

    socket.on('next', async (currentRoomName, username) => {
      console.log('Next clicked, current room:', currentRoomName);

      if (rooms.has(currentRoomName)) {
        const currentRoom = rooms.get(currentRoomName);
        currentRoom.delete(socket.id);
        if (currentRoom.size === 0) {
          rooms.delete(currentRoomName);
        }

        async function createNewRoom(currentRoomName) {

          let nextFoundEmptyRoom = null;
  
          rooms.forEach((users, roomId) => {
            if (roomId !== currentRoomName && users.size < 2) {
              nextFoundEmptyRoom = roomId;
            }
          });
  
          console.log("createnew room  in next");
  
          if (!nextFoundEmptyRoom) {
            const newRoomId = generateRoomId();
            rooms.set(newRoomId, new Set());
  
            return newRoomId;
          } else {
            return nextFoundEmptyRoom;
          }
        };

        const newRoomId = await createNewRoom(currentRoomName);
        socket.leave(currentRoomName);
        socket.join(newRoomId);
        rooms.get(newRoomId).add(socket.id);
        socket.emit('room-created', newRoomId);
        socket.to(newRoomId).emit('user-connected', socket.id, username);
      }
    });
  });

  function handleDisconnect(socket) {
    rooms.forEach((users, roomId) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        socket.to(roomId).emit('user-disconnected', socket.id);

        // If room is not full anymore, move a user from the waiting array
        if (users.size < 2 && waitingUsers.length > 0) {
          const waitingUser = waitingUsers.shift();
          io.to(waitingUser.socketId).emit('room-created', roomId);
          users.add(waitingUser.socketId);
          socket.to(roomId).emit('user-connected', waitingUser.socketId, waitingUser.username);
        }
      }
    });
  }

  function findOrCreateRoom() {
    let foundEmptyRoom = null;
    rooms.forEach((users, roomId) => {
      if (!foundEmptyRoom && users.size < 2) {
        foundEmptyRoom = roomId;
      }
    });

    if (!foundEmptyRoom) {
      const newRoomId = generateRoomId();
      rooms.set(newRoomId, new Set());
      return newRoomId;
    }

    return foundEmptyRoom;
  }

  function generateRoomId() {
    return Math.random().toString(36).substr(2, 8);
  }

  socket.on('send-message', (message, room_user)=>{
    socket.to(room_user).emit('receive-message', message);

  })


  socket.on('send_message', async (data, cb) => {
    console.log("dat got");
    if (data.type == 'attachment') {
      console.log('Received file data:', data.fileName);
      socket.to(data.roomdata).emit("fileshare", data);
      cb("Received file successfully.");
    }
    // Process other business...
  });


  console.log("rooms:",rooms);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on https://localhost:${PORT}`);
});
