const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));
const rooms = new Map();

io.on('connection', (socket) => {
    socket.on('join_room', ({ roomId, username }) => {
        socket.join(roomId);
        if (!rooms.has(roomId)) {
            rooms.set(roomId, { 
                hostId: socket.id, 
                currentVideoId: 'Ru4lEmhHTF4', // Default Video
                currentTime: 0,
                participants: [] 
            });
        }
        const room = rooms.get(roomId);
        const role = (socket.id === room.hostId) ? 'Host' : 'Participant';
        room.participants.push({ id: socket.id, username, role });

        io.to(roomId).emit('room_data', { 
            participants: room.participants, 
            videoId: room.currentVideoId,
            currentTime: room.currentTime
        });
    });

    const checkPrivilege = (roomId) => {
        const room = rooms.get(roomId);
        const user = room?.participants.find(p => p.id === socket.id);
        return user && (user.role === 'Host' || user.role === 'Moderator');
    };

    socket.on('play_video', (data) => {
        if (checkPrivilege(data.roomId)) {
            rooms.get(data.roomId).currentTime = data.time;
            socket.to(data.roomId).emit('sync_action', { action: 'play', time: data.time });
        } else { socket.emit('permission_denied'); }
    });

    socket.on('pause_video', (data) => {
        if (checkPrivilege(data.roomId)) {
            rooms.get(data.roomId).currentTime = data.time;
            socket.to(data.roomId).emit('sync_action', { action: 'pause', time: data.time });
        } else { socket.emit('permission_denied'); }
    });

    socket.on('seek_video', (data) => {
        if (checkPrivilege(data.roomId)) {
            rooms.get(data.roomId).currentTime = data.time;
            socket.to(data.roomId).emit('sync_action', { action: 'seek', time: data.time });
        } else { socket.emit('permission_denied'); }
    });

    socket.on('change_video', (data) => {
        if (checkPrivilege(data.roomId)) {
            const room = rooms.get(data.roomId);
            room.currentVideoId = data.videoId;
            room.currentTime = 0;
            io.to(data.roomId).emit('video_changed', { videoId: data.videoId });
        } else { socket.emit('permission_denied'); }
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            room.participants = room.participants.filter(p => p.id !== socket.id);
            if (room.participants.length > 0) {
                io.to(roomId).emit('room_data', { participants: room.participants, videoId: room.currentVideoId });
            } else { rooms.delete(roomId); }
        });
    });
});

server.listen(process.env.PORT || 3000, () => console.log("Server Live"));
