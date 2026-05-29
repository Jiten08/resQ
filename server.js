const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 3000 });

console.log('ResQ WebSocket server running on port 3000');

let activeFall = null;

server.on('connection', (socket) => {
  console.log('Device connected to ResQ Emergency Hub');
  
  // Send active fall state on connection
  if (activeFall) {
    socket.send(JSON.stringify(activeFall));
  }

  socket.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received event:', data);
      
      if (data.type === 'fall_alert') {
        activeFall = {
          triggered: true,
          senderId: data.senderId,
          senderName: data.senderName,
          latitude: data.latitude,
          longitude: data.longitude,
          timestamp: data.timestamp
        };
        // Broadcast to all connected clients
        broadcast(activeFall);
      } else if (data.type === 'clear_alert') {
        activeFall = { triggered: false };
        broadcast(activeFall);
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  socket.on('close', () => {
    console.log('Device disconnected');
  });
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
