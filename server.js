const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

const rooms = new Map();

io.on('connection', (socket) => {
    // Join room logic: First person is Host, others are Participants [cite: 15, 34, 36]
    socket.on('join_room', ({ roomId, username }) => {
        socket.join(roomId);
        if (!rooms.has(roomId)) {
            rooms.set(roomId, { 
                hostId: socket.id, 
                currentVideoId: '6JoCNbsPg4k',
                currentTime: 0,
                participants: [] 
            });
        }
        const room = rooms.get(roomId);
        const role = (socket.id === room.hostId) ? 'Host' : 'Participant';
        
        room.participants = room.participants.filter(p => p.id !== socket.id);
        room.participants.push({ id: socket.id, username, role });

        io.to(roomId).emit('room_data', { 
            participants: room.participants, 
            videoId: room.currentVideoId,
            currentTime: room.currentTime,
            isNewJoiner: true,
            targetId: socket.id
        });
    });

    // Validates that only Host/Moderator can play/pause/seek [cite: 15, 22, 43]
    const checkPermission = (roomId) => {
        const room = rooms.get(roomId);
        const user = room?.participants.find(p => p.id === socket.id);
        return user && (user.role === 'Host' || user.role === 'Moderator');
    };

    socket.on('play_video', (data) => {
        if (checkPermission(data.roomId)) {
            rooms.get(data.roomId).currentTime = data.time;
            socket.to(data.roomId).emit('sync_action', { action: 'play', time: data.time });
        } else {
            socket.emit('permission_denied');
        }
    });

    socket.on('pause_video', (data) => {
        if (checkPermission(data.roomId)) {
            rooms.get(data.roomId).currentTime = data.time;
            socket.to(data.roomId).emit('sync_action', { action: 'pause', time: data.time });
        } else {
            socket.emit('permission_denied');
        }
    });

    socket.on('seek_video', (data) => {
        if (checkPermission(data.roomId)) {
            rooms.get(data.roomId).currentTime = data.time;
            socket.to(data.roomId).emit('sync_action', { action: 'seek', time: data.time });
        } else {
            socket.emit('permission_denied');
        }
    });

    socket.on('change_video', (data) => {
        if (checkPermission(data.roomId)) {
            const room = rooms.get(data.roomId);
            room.currentVideoId = data.videoId;
            room.currentTime = 0;
            io.to(data.roomId).emit('video_changed', { videoId: data.videoId });
        } else {
            socket.emit('permission_denied');
        }
    });

    // Host Capability: Assign roles [cite: 13, 18, 34, 39]
    socket.on('assign_role', (data) => {
        const room = rooms.get(data.roomId);
        const sender = room?.participants.find(p => p.id === socket.id);
        if (sender?.role === 'Host') {
            const target = room.participants.find(p => p.id === data.targetUserId);
            if (target) {
                target.role = data.role;
                io.to(data.roomId).emit('room_data', { participants: room.participants, videoId: room.currentVideoId });
            }
        }
    });

    // Host Capability: Remove participants [cite: 15, 19, 34, 41]
    socket.on('remove_participant', (data) => {
        const room = rooms.get(data.roomId);
        const sender = room?.participants.find(p => p.id === socket.id);
        if (sender?.role === 'Host') {
            const kickedSocket = io.sockets.sockets.get(data.targetUserId);
            if (kickedSocket) {
                kickedSocket.emit('kicked');
                kickedSocket.leave(data.roomId);
                room.participants = room.participants.filter(p => p.id !== data.targetUserId);
                io.to(data.roomId).emit('room_data', { participants: room.participants, videoId: room.currentVideoId });
            }
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            room.participants = room.participants.filter(p => p.id !== socket.id);
            if (room.participants.length > 0) {
                if (room.hostId === socket.id) {
                    room.hostId = room.participants[0].id;
                    room.participants[0].role = 'Host'; // Auto-transfer host [cite: 20]
                }
                io.to(roomId).emit('room_data', { participants: room.participants, videoId: room.currentVideoId });
            } else { rooms.delete(roomId); }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`SERVER LIVE: Port ${PORT}`));