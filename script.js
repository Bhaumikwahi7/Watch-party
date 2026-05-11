const socket = io(); 
let player;
let ROOM_ID = "";
let lastTime = 0;
let currentVideoId = 'Ru4lEmhHTF4'; // Default: Zero Trailer
let remoteAction = false; 

// Professional Toast Notification
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

// Crucial: Only load YouTube when officially in the room
function enterRoom() {
    var tag = document.createElement('script'); 
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function createNewRoom() {
    const name = document.getElementById('user-name').value.trim();
    if (!name) return alert("Enter Name");
    const newID = Math.random().toString(36).substring(2, 8).toUpperCase();
    window.location.search = `?room=${newID}&user=${encodeURIComponent(name)}`;
}

function joinExistingRoom() {
    const name = document.getElementById('user-name').value.trim();
    const room = document.getElementById('room-input').value.trim().toUpperCase();
    if (!name || !room) return alert("Name & Room Code required");
    window.location.search = `?room=${room}&user=${encodeURIComponent(name)}`;
}

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    const userFromUrl = urlParams.get('user');
    
    if (roomFromUrl && userFromUrl) {
        ROOM_ID = roomFromUrl;
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('room-display').innerText = `ID: ${ROOM_ID}`;
        
        // Load YouTube logic only now to prevent "Ghost Voice"
        enterRoom();
        socket.emit('join_room', { roomId: ROOM_ID, username: userFromUrl });
    }
};

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '100%', width: '100%', videoId: currentVideoId,
        playerVars: { 'rel': 0, 'modestbranding': 1, 'autoplay': 1, 'mute': 0 },
        events: { 'onStateChange': onPlayerStateChange, 'onReady': onPlayerReady }
    });
}

function onPlayerReady(event) {
    event.target.playVideo();
    setInterval(() => {
        if (!player || typeof player.getCurrentTime !== 'function' || remoteAction) return;
        const currentTime = player.getCurrentTime();
        if (Math.abs(currentTime - lastTime) > 2.5) {
            socket.emit('seek_video', { roomId: ROOM_ID, time: currentTime });
        }
        lastTime = currentTime;
    }, 1000); 
}

function onPlayerStateChange(event) {
    if (remoteAction) return;
    const time = player.getCurrentTime();
    if (event.data == YT.PlayerState.PLAYING) socket.emit('play_video', { roomId: ROOM_ID, time });
    if (event.data == YT.PlayerState.PAUSED) socket.emit('pause_video', { roomId: ROOM_ID, time });
}

socket.on('sync_action', (data) => {
    remoteAction = true;
    if (data.action === 'play') {
        player.seekTo(data.time, true);
        player.playVideo();
    } else if (data.action === 'pause') {
        player.pauseVideo();
    } else if (data.action === 'seek') {
        player.seekTo(data.time, true);
    }
    setTimeout(() => { remoteAction = false; }, 1200);
});

socket.on('room_data', (data) => {
    const listDiv = document.getElementById('user-list');
    listDiv.innerHTML = '';
    
    if (data.videoId !== currentVideoId) {
        remoteAction = true;
        currentVideoId = data.videoId;
        if (player && player.loadVideoById) {
            player.loadVideoById(currentVideoId, data.currentTime || 0);
        }
        setTimeout(() => { remoteAction = false; }, 2000);
    }

    data.participants.forEach(p => {
        const card = document.createElement('div');
        card.className = 'user-card';
        const roleClass = p.role === 'Host' ? 'role-host' : (p.role === 'Moderator' ? 'role-mod' : '');
        card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:600;">${p.username}</span><span class="role-badge ${roleClass}">${p.role}</span>
        </div>`;
        listDiv.appendChild(card);
    });
});

socket.on('permission_denied', () => showToast("Host/Moderator only!"));

document.getElementById('change-video-btn').onclick = () => {
    const url = document.getElementById('video-url').value.trim();
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (match && match[1]) socket.emit('change_video', { roomId: ROOM_ID, videoId: match[1] });
};
