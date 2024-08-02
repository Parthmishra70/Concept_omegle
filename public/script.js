const socket = io({ secure: true });
const mainVideoGrid = document.getElementById('mainVideoGrid');
const bottomPanel = document.getElementById('bottomPanel');
const videoList = document.getElementById('videoList');
const logsContainer = document.getElementById('logs');
const startButton = document.getElementById('startButton');
const shareScreenButton = document.getElementById('shareScreenButton');
const peers = {};

// Get the room ID from the URL
const roomId = window.location.pathname.split('/')[1];
const myId = Math.floor(Math.random() * 10000); // Unique ID for each user (you can use any unique identifier)

const addLog = (message) => {
  const logElement = document.createElement('div');
  logElement.classList.add('log');
  logElement.textContent = message;
  logsContainer.appendChild(logElement);
  logsContainer.scrollTop = logsContainer.scrollHeight;
};

const addVideoStream = (stream, username) => {
  const videoContainer = document.createElement('div');
  videoContainer.classList.add('video-container');
  const video = document.createElement('video');
  video.srcObject = stream;
  video.addEventListener('loadedmetadata', () => {
    video.play();
  });
  const usernameDiv = document.createElement('div');
  usernameDiv.classList.add('username');
  usernameDiv.innerText = username;
  videoContainer.appendChild(usernameDiv);
  videoContainer.appendChild(video);
  mainVideoGrid.appendChild(videoContainer);

  // Add to bottom panel as well
  const videoListContainer = document.createElement('div');
  videoListContainer.classList.add('video-container');
  const videoCopy = video.cloneNode(true);
  videoCopy.srcObject = stream;
  videoListContainer.appendChild(videoCopy);
  const usernameDivCopy = document.createElement('div');
  usernameDivCopy.classList.add('username');
  usernameDivCopy.innerText = username;
  videoListContainer.appendChild(usernameDivCopy);
  videoList.appendChild(videoListContainer);
};

const startVideoStream = () => {
  const username = document.getElementById('username').value || 'Anonymous';
  addLog(`Starting video stream as ${username}`);
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        addLog('Accessed media devices successfully.');
        addVideoStream(stream, username);

        socket.emit('join-room', roomId, socket.id, username);
        addLog(`Joined room ${roomId}`);

        socket.on('user-connected', (userId, remoteUsername) => {
          addLog(`${remoteUsername} connected.`);
          connectToNewUser(userId, stream, remoteUsername);
          checkUsersInRoom(roomId);
        });

        socket.on('user-disconnected', userId => {
          addLog(`User disconnected: ${userId}`);
          if (peers[userId]) peers[userId].close();
          checkUsersInRoom(roomId);
        });

        socket.on('signal', data => {
          const peer = peers[data.userId];
          if (peer) {
            peer.signal(data.signal);
          } else {
            addLog(`Received signal from ${data.username}`);
            connectToNewUser(data.userId, stream, data.username, false, data.signal);
          }
        });

        const connectToNewUser = (userId, stream, remoteUsername, initiator = true, receivedSignal = null) => {
          const peer = new SimplePeer({
            initiator: initiator,
            trickle: false,
            stream: stream
          });

          peer.on('signal', signal => {
            socket.emit('signal', { userId, signal, username });
            addLog(`Sending signal to ${remoteUsername}`);
          });

          peer.on('stream', userVideoStream => {
            addVideoStream(userVideoStream, remoteUsername);
          });

          peer.on('close', () => {
            addLog(`Connection closed with ${remoteUsername}`);
            if (peers[userId]) {
              delete peers[userId];
            }
          });

          if (receivedSignal) {
            peer.signal(receivedSignal);
          }

          peers[userId] = peer;
        };

        const checkUsersInRoom = (roomId) => {
          const room = io.sockets.adapter.rooms[roomId];
          const numClients = room ? room.length : 0;
          if (numClients >= 2) {
            shareScreenButton.style.display = 'block';
          } else {
            shareScreenButton.style.display = 'none';
          }
        };

        shareScreenButton.addEventListener('click', () => {
          navigator.mediaDevices.getDisplayMedia({ video: true }).then(screenStream => {
            Object.values(peers).forEach(peer => {
              peer.replaceTrack(
                stream.getVideoTracks()[0],
                screenStream.getVideoTracks()[0],
                stream
              );
            });
            addVideoStream(screenStream, `${username} (Screen)`);
          });
        });
      })
      .catch(error => {
        console.error('Error accessing media devices.', error);
        addLog(`Error accessing media devices: ${error.message}`);
        alert('Error accessing media devices: ' + error.message);
      });
  } else {
    addLog('getUserMedia is not supported in your browser.');
    alert('getUserMedia is not supported in your browser.');
  }
};

startButton.addEventListener('click', startVideoStream);
