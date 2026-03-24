// ============================================
// LOGS FM - Admin Panel JavaScript
// ============================================

const API_BASE = window.location.origin;

// ============================================
// STATE
// ============================================

const state = {
  connected: false,
  songs: [],
  queue: [],
  playlists: [],
  volumes: {
    master: 1.0,
    music: 1.0,
    mic: 0.8
  },
  micEnabled: false
};

// ============================================
// DOM ELEMENTS
// ============================================

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Status
const statusIndicator = $('#statusIndicator');
const listenersCount = $('#listenersCount');

// Now Playing
const nowPlaying = $('#nowPlaying');

// Volume Controls
const masterVolume = $('#masterVolume');
const masterVolumeValue = $('#masterVolumeValue');
const musicVolume = $('#musicVolume');
const musicVolumeValue = $('#musicVolumeValue');
const micVolume = $('#micVolume');
const micVolumeValue = $('#micVolumeValue');
const micToggle = $('#micToggle');

// Tabs
const tabs = $$('.tab');
const tabContents = $$('.tab-content');

// URL Tab
const urlInput = $('#urlInput');
const addUrlBtn = $('#addUrlBtn');
const playNowBtn = $('#playNowBtn');

// YouTube Tab
const youtubeInput = $('#youtubeInput');
const downloadYoutubeBtn = $('#downloadYoutubeBtn');

// TTS Tab
const ttsVoice = $('#ttsVoice');
const ttsText = $('#ttsText');
const generateTtsBtn = $('#generateTtsBtn');

// File Upload
const fileDropZone = $('#fileDropZone');
const fileInput = $('#fileInput');
const uploadProgress = $('#uploadProgress');
const progressFill = $('#progressFill');
const uploadStatus = $('#uploadStatus');

// Queue
const queueList = $('#queueList');
const skipBtn = $('#skipBtn');

// Library
const songsList = $('#songsList');
const refreshLibraryBtn = $('#refreshLibraryBtn');

// Playlists
const playlistsGrid = $('#playlistsGrid');

// Toast
const toastContainer = $('#toastContainer');

// ============================================
// API HELPERS
// ============================================

async function api(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    return await res.json();
  } catch (err) {
    console.error(`API Error: ${endpoint}`, err);
    return { ok: false, error: err.message };
  }
}

async function apiPost(endpoint, body) {
  return api(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

async function apiUpload(endpoint, formData) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      body: formData
    });
    return await res.json();
  } catch (err) {
    console.error(`Upload Error: ${endpoint}`, err);
    return { ok: false, error: err.message };
  }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      ${type === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' :
        type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' :
        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
    </svg>
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// STATUS
// ============================================

async function checkStatus() {
  const status = await api('/api/status');

  if (status.liquidsoap && status.liquidsoap.connected !== false) {
    state.connected = true;
    statusIndicator.classList.add('connected');
    statusIndicator.classList.remove('error');
    statusIndicator.querySelector('.status-text').textContent = 'En línea';
  } else {
    state.connected = false;
    statusIndicator.classList.remove('connected');
    statusIndicator.classList.add('error');
    statusIndicator.querySelector('.status-text').textContent = 'Sin conexión';
  }

  listenersCount.textContent = status.listeners || 0;
}

// ============================================
// NOW PLAYING
// ============================================

function updateNowPlaying(track) {
  if (!track) {
    nowPlaying.innerHTML = `
      <div class="now-playing-empty">
        <span>Esperando transmisión...</span>
      </div>
    `;
    return;
  }

  nowPlaying.innerHTML = `
    <div class="now-playing-track">
      <div class="now-playing-icon">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </div>
      <div class="now-playing-details">
        <div class="now-playing-title">${track.title || 'Sin título'}</div>
        <div class="now-playing-artist">${track.artist || track.source || 'Unknown'}</div>
      </div>
    </div>
  `;
}

// ============================================
// VOLUME CONTROLS
// ============================================

function updateVolumeUI() {
  masterVolume.value = state.volumes.master * 100;
  masterVolumeValue.textContent = `${Math.round(state.volumes.master * 100)}%`;

  musicVolume.value = state.volumes.music * 100;
  musicVolumeValue.textContent = `${Math.round(state.volumes.music * 100)}%`;

  micVolume.value = state.volumes.mic * 100;
  micVolumeValue.textContent = `${Math.round(state.volumes.mic * 100)}%`;

  if (state.micEnabled) {
    micToggle.classList.add('active');
  } else {
    micToggle.classList.remove('active');
  }
}

async function setVolume(type, level) {
  state.volumes[type] = level;
  updateVolumeUI();

  const result = await apiPost('/api/volume/' + type, { level });
  if (!result.ok) {
    showToast(`Error ajustando volumen: ${result.error}`, 'error');
  }
}

masterVolume.addEventListener('input', (e) => {
  setVolume('master', e.target.value / 100);
});

musicVolume.addEventListener('input', (e) => {
  setVolume('music', e.target.value / 100);
});

micVolume.addEventListener('input', (e) => {
  setVolume('mic', e.target.value / 100);
});

micToggle.addEventListener('click', async () => {
  state.micEnabled = !state.micEnabled;
  updateVolumeUI();

  const result = await apiPost('/api/mic', { enabled: state.micEnabled });
  if (!result.ok) {
    showToast(`Error con micrófono: ${result.error}`, 'error');
  } else {
    showToast(state.micEnabled ? 'Micrófono activado' : 'Micrófono desactivado', 'success');
  }
});

// ============================================
// TABS
// ============================================

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;

    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
  });
});

// ============================================
// URL / AUDIO
// ============================================

addUrlBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) {
    showToast('Ingresa una URL', 'warning');
    return;
  }

  addUrlBtn.disabled = true;
  addUrlBtn.textContent = 'Agregando...';

  const result = await apiPost('/api/queue', { url });

  addUrlBtn.disabled = false;
  addUrlBtn.textContent = 'Agregar a Cola';

  if (result.ok) {
    showToast('URL agregada a la cola', 'success');
    urlInput.value = '';
    refreshQueue();
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
});

playNowBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) {
    showToast('Ingresa una URL', 'warning');
    return;
  }

  playNowBtn.disabled = true;
  playNowBtn.textContent = 'Reproduciendo...';

  const result = await apiPost('/api/queue/play-now', { url });

  playNowBtn.disabled = false;
  playNowBtn.textContent = 'Reproducir Ahora';

  if (result.ok) {
    showToast('Reproduciendo ahora', 'success');
    urlInput.value = '';
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
});

// ============================================
// YOUTUBE
// ============================================

downloadYoutubeBtn.addEventListener('click', async () => {
  const url = youtubeInput.value.trim();
  if (!url) {
    showToast('Ingresa un enlace de YouTube', 'warning');
    return;
  }

  downloadYoutubeBtn.disabled = true;
  downloadYoutubeBtn.textContent = 'Descargando...';

  const result = await apiPost('/api/youtube', { url });

  downloadYoutubeBtn.disabled = false;
  downloadYoutubeBtn.textContent = 'Descargar y Agregar';

  if (result.ok) {
    showToast('YouTube agregado a la cola', 'success');
    youtubeInput.value = '';
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
});

// ============================================
// TTS
// ============================================

generateTtsBtn.addEventListener('click', async () => {
  const text = ttsText.value.trim();
  if (!text) {
    showToast('Ingresa texto para convertir', 'warning');
    return;
  }

  generateTtsBtn.disabled = true;
  generateTtsBtn.textContent = 'Generando...';

  const result = await apiPost('/api/tts', {
    text,
    voice: ttsVoice.value
  });

  generateTtsBtn.disabled = false;
  generateTtsBtn.textContent = 'Generar y Agregar';

  if (result.ok) {
    showToast('Texto agregado a la cola', 'success');
    ttsText.value = '';
    refreshQueue();
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
});

// ============================================
// FILE UPLOAD
// ============================================

fileDropZone.addEventListener('click', () => fileInput.click());

fileDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDropZone.style.borderColor = 'var(--accent)';
});

fileDropZone.addEventListener('dragleave', () => {
  fileDropZone.style.borderColor = '';
});

fileDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDropZone.style.borderColor = '';

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    uploadFile(files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    uploadFile(e.target.files[0]);
  }
});

async function uploadFile(file) {
  uploadProgress.classList.remove('hidden');
  progressFill.style.width = '0%';
  uploadStatus.textContent = 'Subiendo...';

  const formData = new FormData();
  formData.append('song', file);

  try {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = `${percent}%`;
        uploadStatus.textContent = `Subiendo... ${percent}%`;
      }
    });

    xhr.addEventListener('load', () => {
      uploadProgress.classList.add('hidden');

      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        if (result.ok) {
          showToast(`Archivo "${file.name}" subido`, 'success');
          refreshSongs();
        } else {
          showToast(`Error: ${result.error}`, 'error');
        }
      } else {
        showToast('Error al subir archivo', 'error');
      }
    });

    xhr.addEventListener('error', () => {
      uploadProgress.classList.add('hidden');
      showToast('Error de conexión', 'error');
    });

    xhr.open('POST', `${API_BASE}/api/upload`);
    xhr.send(formData);

  } catch (err) {
    uploadProgress.classList.add('hidden');
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ============================================
// QUEUE
// ============================================

async function refreshQueue() {
  const result = await api('/api/queue');

  if (result.ok) {
    state.queue = result.queue || [];
    renderQueue();
  }
}

function renderQueue() {
  if (state.queue.length === 0) {
    queueList.innerHTML = `
      <div class="queue-empty">
        <span>La cola está vacía</span>
      </div>
    `;
    return;
  }

  queueList.innerHTML = state.queue.map((item, index) => `
    <div class="queue-item" data-rid="${item.rid || index}">
      <div class="queue-item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
      <div class="queue-item-info">
        <div class="queue-item-title">${item.uri || 'Unknown'}</div>
        <div class="queue-item-source">${item.source || 'queue'}</div>
      </div>
      <button class="queue-item-remove" onclick="removeFromQueue('${item.rid || index}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `).join('');
}

async function removeFromQueue(rid) {
  const result = await api(`/api/queue/${rid}`, { method: 'DELETE' });
  if (result.ok) {
    showToast('Eliminado de cola', 'success');
    refreshQueue();
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
}

skipBtn.addEventListener('click', async () => {
  skipBtn.disabled = true;

  const result = await apiPost('/api/queue/skip', {});

  skipBtn.disabled = false;

  if (result.ok) {
    showToast('Saltando...', 'success');
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
});

// Make removeFromQueue global
window.removeFromQueue = removeFromQueue;

// ============================================
// SONGS LIBRARY
// ============================================

async function refreshSongs() {
  const songs = await api('/api/songs');

  if (songs && Array.isArray(songs)) {
    state.songs = songs;
    renderSongs();
  }
}

function renderSongs() {
  if (state.songs.length === 0) {
    songsList.innerHTML = `
      <div class="songs-empty">
        <span>No hay canciones en la biblioteca</span>
      </div>
    `;
    return;
  }

  songsList.innerHTML = state.songs.map(song => `
    <div class="song-item" data-song="${song}">
      <div class="song-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
      <div class="song-info">
        <div class="song-title">${song}</div>
      </div>
      <div class="song-actions">
        <button class="song-btn" onclick="playSong('${song}')">Reproducir</button>
        <button class="song-btn" onclick="addSongToQueue('${song}')">+ Cola</button>
        <button class="song-btn danger" onclick="deleteSong('${song}')">×</button>
      </div>
    </div>
  `).join('');
}

async function playSong(song) {
  const result = await apiPost('/api/queue/play-now', { file: song });
  if (result.ok) {
    showToast('Reproduciendo ahora', 'success');
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
}

async function addSongToQueue(song) {
  const result = await apiPost('/api/queue', { file: song });
  if (result.ok) {
    showToast('Agregado a la cola', 'success');
    refreshQueue();
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
}

async function deleteSong(song) {
  if (!confirm(`¿Eliminar "${song}"?`)) return;

  const result = await api(`/api/songs/${encodeURIComponent(song)}`, { method: 'DELETE' });
  if (result.ok) {
    showToast('Canción eliminada', 'success');
    refreshSongs();
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
}

refreshLibraryBtn.addEventListener('click', async () => {
  refreshLibraryBtn.disabled = true;
  refreshLibraryBtn.textContent = 'Actualizando...';

  await apiPost('/api/rebuild-playlist', {});
  await refreshSongs();

  refreshLibraryBtn.disabled = false;
  refreshLibraryBtn.textContent = 'Actualizar';
});

// Make functions global
window.playSong = playSong;
window.addSongToQueue = addSongToQueue;
window.deleteSong = deleteSong;

// ============================================
// PLAYLISTS
// ============================================

async function refreshPlaylists() {
  const playlists = await api('/api/playlists');

  if (playlists && Array.isArray(playlists)) {
    state.playlists = playlists;
    renderPlaylists();
  }
}

function renderPlaylists() {
  if (state.playlists.length === 0) {
    playlistsGrid.innerHTML = '<p style="color: var(--text-muted)">No hay playlists</p>';
    return;
  }

  playlistsGrid.innerHTML = state.playlists.map(playlist => `
    <div class="playlist-card">
      <span class="playlist-name">${playlist.name}</span>
      <button class="btn btn-small" onclick="activatePlaylist('${playlist.name}')">Activar</button>
    </div>
  `).join('');
}

async function activatePlaylist(name) {
  const result = await apiPost(`/api/playlists/${name}/activate`, {});
  if (result.ok) {
    showToast(`Playlist "${name}" activada`, 'success');
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
}

window.activatePlaylist = activatePlaylist;

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  console.log('Logs FM Admin Panel initializing...');

  // Check status periodically
  await checkStatus();
  setInterval(checkStatus, 30000);

  // Load initial data
  await Promise.all([
    refreshSongs(),
    refreshQueue(),
    refreshPlaylists()
  ]);

  // Update volume UI
  updateVolumeUI();

  console.log('Logs FM Admin Panel ready');
}

// Start
init();
