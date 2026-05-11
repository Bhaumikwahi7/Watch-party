const socket = io(); 
let player;
let ROOM_ID = "";
let lastTime = 0;

function createNewRoom() {
    const name = document.getElementById('user-name').value.trim();
    if (!name) return alert("Enter your name!");
    const newID = Math.random().toString(36).substring(2, 8).toUpperCase();
    window.location.search = `?room=${newID}&user=${encodeURIComponent(name)}`;
}

function joinExistingRoom() {
    const name = document.getElementById('user-name').value.trim();
    const room = document.getElementById('room-input').value.trim().toUpperCase();
    if (!name || !room) return alert("Name and Room ID required!");
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
        height: '100%', width: '100%', videoId: '6JoCNbsPg4k',
        events: { 'onStateChange': onPlayerStateChange, 'onReady': onPlayerReady }
    });
}

function onPlayerReady() {
    setInterval(() => {
        if (!player || typeof player.getCurrentTime !== 'function') return;
        const currentTime = player.getCurrentTime();
        if (Math.abs(currentTime - lastTime) > 2) {
            socket.emit('seek_video', { roomId: ROOM_ID, time: currentTime });
        }
        lastTime = currentTime;
    }, 500);
}

function onPlayerStateChange(event) {
    const time = player.getCurrentTime();
    if (event.data == YT.PlayerState.PLAYING) socket.emit('play_video', { roomId: ROOM_ID, time });
    if (event.data == YT.PlayerState.PAUSED) socket.emit('pause_video', { roomId: ROOM_ID, time });
}

socket.on('room_data', (data) => {
    const listDiv = document.getElementById('user-list');
    listDiv.innerHTML = '';
    const currentUser = data.participants.find(p => p.id === socket.id);
    const isHost = currentUser?.role === 'Host';

    if (data.isNewJoiner && data.targetId === socket.id) {
        player.loadVideoById(data.videoId, data.currentTime);
    }

    data.participants.forEach(p => {
        const card = document.createElement('div');
        card.className = 'user-card';
        const roleClass = p.role === 'Host' ? 'role-host' : (p.role === 'Moderator' ? 'role-mod' : '');
        
        let controls = '';
        if (isHost && p.id !== socket.id) {
            controls = `<div style="margin-top:8px; display:flex; gap:5px;">
                <button class="btn-mod" style="background:#22c55e; color:white; font-size:10px; padding:4px;" onclick="promote('${p.id}')">Mod</button>
                <button class="btn-kick" style="background:#ef4444; color:white; font-size:10px; padding:4px;" onclick="kick('${p.id}')">Kick</button>
            </div>`;
        }

        card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
            <span>${p.username}</span>
            <span class="role-badge ${roleClass}">${p.role}</span>
        </div> ${controls}`;
        listDiv.appendChild(card);
    });
});

socket.on('sync_action', (data) => {
    if (data.action === 'play') { player.seekTo(data.time); player.playVideo(); }
    if (data.action === 'pause') { player.pauseVideo(); }
    if (data.action === 'seek') { player.seekTo(data.time); }
});

socket.on('video_changed', (data) => player.loadVideoById(data.videoId));
socket.on('permission_denied', () => alert("Host or Moderator only!"));
socket.on('kicked', () => { alert("You were removed by the host."); window.location.href = "/"; });

function promote(id) { socket.emit('assign_role', { roomId: ROOM_ID, targetUserId: id, role: 'Moderator' }); }
function kick(id) { if(confirm("Kick user?")) socket.emit('remove_participant', { roomId: ROOM_ID, targetUserId: id }); }

document.getElementById('change-video-btn').onclick = () => {
    const url = document.getElementById('video-url').value.trim();
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    if (match && match[1]) {
        socket.emit('change_video', { roomId: ROOM_ID, videoId: match[1] });
    }
};