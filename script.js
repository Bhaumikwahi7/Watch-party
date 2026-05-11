const socket = io(); 
let player;
let ROOM_ID = "";
let lastTime = 0;
let currentVideoId = '6JoCNbsPg4k'; 
let remoteAction = false; // Flag to prevent sync loops

// Notification Throttling for the Toast
let lastToastTime = 0;
function showToast(msg) {
    const now = Date.now();
    if (now - lastToastTime < 3000) return; 
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
        if (!player || typeof player.getCurrentTime !== 'function' || remoteAction) return;
        const currentTime = player.getCurrentTime();
        // Only emit seek if user manually dragged the bar (difference > 2s)
        if (Math.abs(currentTime - lastTime) > 2.5) {
            socket.emit('seek_video', { roomId: ROOM_ID, time: currentTime });
        }
        lastTime = currentTime;
    }, 1000); 
}

function onPlayerStateChange(event) {
    // If the state changed because of a server command, do nothing
    if (remoteAction) return;

    const time = player.getCurrentTime();
    if (event.data == YT.PlayerState.PLAYING) {
        socket.emit('play_video', { roomId: ROOM_ID, time: time });
    } else if (event.data == YT.PlayerState.PAUSED) {
        socket.emit('pause_video', { roomId: ROOM_ID, time: time });
    }
}

socket.on('sync_action', (data) => {
    remoteAction = true; // LOCK: Stop local events from firing
    
    if (data.action === 'play') {
        player.seekTo(data.time, true);
        player.playVideo();
    } else if (data.action === 'pause') {
        player.pauseVideo();
    } else if (data.action === 'seek') {
        player.seekTo(data.time, true);
    }

    // UNLOCK after the player has had time to update
    setTimeout(() => { remoteAction = false; }, 1200);
});

socket.on('room_data', (data) => {
    const listDiv = document.getElementById('user-list');
    listDiv.innerHTML = '';
    const currentUser = data.participants.find(p => p.id === socket.id);
    const isHost = currentUser?.role === 'Host';

    // Initial sync for new joiners
    if (data.videoId !== currentVideoId) {
        remoteAction = true;
        currentVideoId = data.videoId;
        player.loadVideoById(currentVideoId, data.currentTime || 0);
        setTimeout(() => { remoteAction = false; }, 2000);
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

socket.on('video_changed', (data) => {
    if (data.videoId !== currentVideoId) {
        remoteAction = true;
        currentVideoId = data.videoId;
        player.loadVideoById(currentVideoId);
        setTimeout(() => { remoteAction = false; }, 2000);
    }
});

socket.on('permission_denied', () => {
    showToast("Access Denied: Only Hosts/Mods can control sync.");
});

socket.on('kicked', () => {
    alert("You have been removed from the room.");
    window.location.href = "/";
});

function promote(id) { socket.emit('assign_role', { roomId: ROOM_ID, targetUserId: id, role: 'Moderator' }); }
function kick(id) { if(confirm("Kick this user?")) socket.emit('remove_participant', { roomId: ROOM_ID, targetUserId: id }); }

document.getElementById('change-video-btn').onclick = () => {
    const url = document.getElementById('video-url').value.trim();
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (match && match[1]) {
        socket.emit('change_video', { roomId: ROOM_ID, videoId: match[1] });
    }
};
