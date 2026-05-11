const socket = io(); 
let player;
let ROOM_ID = "";
let lastTime = 0;
let currentVideoId = '6JoCNbsPg4k'; 
let isSyncing = false; 

// Notification Throttling
let lastToastTime = 0;
function showToast(msg) {
    const now = Date.now();
    if (now - lastToastTime < 3000) return; // Only show once every 3 seconds
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    lastToastTime = now;
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function createNewRoom() {
    const name = document.getElementById('user-name').value.trim();
    if (!name) return;
    const newID = Math.random().toString(36).substring(2, 8).toUpperCase();
    window.location.search = `?room=${newID}&user=${encodeURIComponent(name)}`;
}

function joinExistingRoom() {
    const name = document.getElementById('user-name').value.trim();
    const room = document.getElementById('room-input').value.trim().toUpperCase();
    if (!name || !room) return;
    window.location.search = `?room=${room}&user=${encodeURIComponent(name)}`;
}

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    const userFromUrl = urlParams.get('user');
    if (roomFromUrl && userFromUrl) {
        ROOM_ID = roomFromUrl;
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('room-display').innerText = `Room: ${ROOM_ID}`;
        socket.emit('join_room', { roomId: ROOM_ID, username: userFromUrl });
    }
};

var tag = document.createElement('script'); 
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '100%', width: '100%', videoId: currentVideoId,
        playerVars: { 'rel': 0, 'modestbranding': 1, 'autoplay': 1 },
        events: { 'onStateChange': onPlayerStateChange, 'onReady': onPlayerReady }
    });
}

function onPlayerReady() {
    setInterval(() => {
        if (!player || typeof player.getCurrentTime !== 'function' || isSyncing) return;
        const currentTime = player.getCurrentTime();
        if (Math.abs(currentTime - lastTime) > 2) {
            socket.emit('seek_video', { roomId: ROOM_ID, time: currentTime });
        }
        lastTime = currentTime;
    }, 1000); 
}

function onPlayerStateChange(event) {
    if (isSyncing) return;
    const time = player.getCurrentTime();
    if (event.data == YT.PlayerState.PLAYING) socket.emit('play_video', { roomId: ROOM_ID, time });
    if (event.data == YT.PlayerState.PAUSED) socket.emit('pause_video', { roomId: ROOM_ID, time });
}

socket.on('room_data', (data) => {
    const listDiv = document.getElementById('user-list');
    listDiv.innerHTML = '';
    const currentUser = data.participants.find(p => p.id === socket.id);
    const isHost = currentUser?.role === 'Host';

    if (data.videoId !== currentVideoId) {
        isSyncing = true;
        currentVideoId = data.videoId;
        player.loadVideoById(currentVideoId, data.currentTime || 0);
        setTimeout(() => isSyncing = false, 1200);
    }

    data.participants.forEach(p => {
        const card = document.createElement('div');
        card.className = 'user-card';
        const roleClass = p.role === 'Host' ? 'role-host' : (p.role === 'Moderator' ? 'role-mod' : '');
        let controls = (isHost && p.id !== socket.id) ? `
            <div style="margin-top:10px; display:flex; gap:8px;">
                <button style="padding:5px 10px; font-size:11px; background:#10b981;" onclick="promote('${p.id}')">Promote</button>
                <button style="padding:5px 10px; font-size:11px; background:#ef4444;" onclick="kick('${p.id}')">Kick</button>
            </div>` : '';
        card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:500;">${p.username}</span><span class="role-badge ${roleClass}">${p.role}</span>
        </div> ${controls}`;
        listDiv.appendChild(card);
    });
});

socket.on('sync_action', (data) => {
    isSyncing = true;
    const localTime = player.getCurrentTime();
    if (data.action === 'play') { 
        if (Math.abs(localTime - data.time) > 2) player.seekTo(data.time); 
        player.playVideo(); 
    } else if (data.action === 'pause') { 
        player.pauseVideo(); 
    } else if (data.action === 'seek') { 
        player.seekTo(data.time); 
    }
    setTimeout(() => isSyncing = false, 1000);
});

socket.on('permission_denied', () => {
    showToast("Access Denied: Only Hosts can control playback.");
});

socket.on('video_changed', (data) => {
    if (data.videoId !== currentVideoId) {
        isSyncing = true;
        currentVideoId = data.videoId;
        player.loadVideoById(currentVideoId);
        setTimeout(() => isSyncing = false, 1200);
    }
});

function promote(id) { socket.emit('assign_role', { roomId: ROOM_ID, targetUserId: id, role: 'Moderator' }); }
function kick(id) { if(confirm("Remove this user from the room?")) socket.emit('remove_participant', { roomId: ROOM_ID, targetUserId: id }); }

document.getElementById('change-video-btn').onclick = () => {
    const url = document.getElementById('video-url').value.trim();
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (match && match[1]) socket.emit('change_video', { roomId: ROOM_ID, videoId: match[1] });
};s
