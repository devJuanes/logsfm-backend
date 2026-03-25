const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const net = require("net");

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de directorios
const MUSIC_DIR = process.env.MUSIC_DIR || "/radio/music";
const PLAYLIST_DIR = process.env.PLAYLIST_DIR || "/radio/playlists";
const PLAYLIST_FILE = path.join(PLAYLIST_DIR, "playlist.m3u");
const TTS_DIR = process.env.TTS_DIR || "/radio/tts";
const QUEUE_DIR = process.env.QUEUE_DIR || "/radio/queue";

const LIQUIDSOAP_HOST = "127.0.0.1";
const LIQUIDSOAP_PORT = 1234;

// Cola en memoria
let currentQueue = [];
let currentIndex = 0;

// Asegurar que los directorios existen
[MUSIC_DIR, PLAYLIST_DIR, TTS_DIR, QUEUE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// === CONFIGURACIÓN MULTER ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MUSIC_DIR),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// === UTILIDADES ===
function rebuildPlaylist() {
  const files = fs.readdirSync(MUSIC_DIR)
    .filter(file => /\.(mp3|aac|ogg|wav)$/i.test(file))
    .map(file => path.join(MUSIC_DIR, file));

  fs.writeFileSync(PLAYLIST_FILE, files.join("\n"));
  return files;
}

function getSongs() {
  return fs.readdirSync(MUSIC_DIR)
    .filter(file => /\.(mp3|aac|ogg|wav)$/i.test(file));
}

function getPlaylists() {
  if (!fs.existsSync(PLAYLIST_DIR)) return [];
  return fs.readdirSync(PLAYLIST_DIR)
    .filter(f => f.endsWith('.m3u'))
    .map(f => ({
      name: f,
      path: path.join(PLAYLIST_DIR, f),
      tracks: fs.readFileSync(path.join(PLAYLIST_DIR, f), 'utf-8')
        .split('\n')
        .filter(Boolean)
    }));
}

// === COMUNICACIÓN CON LIQUIDSOAP ===
function sendLSCommand(cmd) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let buffer = '';

    client.connect(LIQUIDSOAP_PORT, LIQUIDSOAP_HOST, () => {
      client.write(cmd + '\n');
    });

    client.on('data', (data) => {
      buffer += data.toString();
    });

    client.on('close', () => {
      resolve(buffer.trim());
    });

    client.on('error', (err) => {
      reject(err);
    });

    // Timeout de 2 segundos
    setTimeout(() => {
      client.destroy();
      resolve(buffer.trim() || 'ok');
    }, 2000);
  });
}

// === ENDPOINTS: SALUD ===
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// === ENDPOINTS: ESTADO DE RADIO ===
app.get("/api/status", async (req, res) => {
  try {
    const lsStatus = await sendLSCommand('source').catch(() => 'offline');
    const songs = getSongs();
    res.json({
      liquidsoap: lsStatus !== 'offline' ? { connected: true } : { connected: false },
      songsCount: songs.length,
      queueLength: currentQueue.length,
      uptime: process.uptime()
    });
  } catch (err) {
    res.json({ liquidsoap: { connected: false }, error: err.message });
  }
});

app.get("/api/listeners", (req, res) => {
  res.json({ listeners: 0, message: "Consultar Icecast stats" });
});

// === ENDPOINTS: MÚSICA LOCAL ===
app.get("/api/songs", (req, res) => {
  const songs = getSongs();
  res.json(songs);
});

app.post("/api/upload", upload.single("song"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No file uploaded" });
  }
  rebuildPlaylist();
  res.json({ ok: true, file: req.file.filename });
});

app.delete("/api/songs/:name", (req, res) => {
  const filePath = path.join(MUSIC_DIR, req.params.name);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: "No existe" });
  }

  fs.unlinkSync(filePath);
  rebuildPlaylist();
  res.json({ ok: true });
});

app.post("/api/rebuild-playlist", (req, res) => {
  const files = rebuildPlaylist();
  res.json({ ok: true, total: files.length, files });
});

// === ENDPOINTS: COLA ===
app.get("/api/queue", (req, res) => {
  res.json({ ok: true, queue: currentQueue, currentIndex });
});

app.post("/api/queue", async (req, res) => {
  const { url, file } = req.body;

  try {
    if (url) {
      // URL directa
      await sendLSCommand(`queue.push ${url}`);
      currentQueue.push({ type: 'url', uri: url, id: Date.now().toString() });
      res.json({ ok: true, message: "URL agregada a cola" });
    } else if (file) {
      // Archivo local
      const filePath = path.join(MUSIC_DIR, file);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ ok: false, error: "Archivo no existe" });
      }
      await sendLSCommand(`queue.push ${filePath}`);
      currentQueue.push({ type: 'file', uri: filePath, name: file, id: Date.now().toString() });
      res.json({ ok: true, message: "Archivo agregado a cola" });
    } else {
      res.status(400).json({ ok: false, error: "url o file requerido" });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/queue/:id", async (req, res) => {
  try {
    const item = currentQueue.find(q => q.id === req.params.id);
    if (item) {
      await sendLSCommand(`queue.remove ${item.rid || ''}`);
      currentQueue = currentQueue.filter(q => q.id !== req.params.id);
    }
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.post("/api/queue/skip", async (req, res) => {
  try {
    await sendLSCommand(`queue.skip`);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.post("/api/queue/play-now", async (req, res) => {
  const { url, file } = req.body;

  try {
    // Skip current
    try {
      await sendLSCommand(`queue.skip`);
    } catch (e) {}

    if (url) {
      await sendLSCommand(`queue.push ${url}`);
      currentQueue.unshift({ type: 'url', uri: url, id: Date.now().toString() });
      res.json({ ok: true, message: "Reproduciendo ahora" });
    } else if (file) {
      const filePath = path.join(MUSIC_DIR, file);
      await sendLSCommand(`queue.push ${filePath}`);
      currentQueue.unshift({ type: 'file', uri: filePath, name: file, id: Date.now().toString() });
      res.json({ ok: true, message: "Reproduciendo ahora" });
    } else {
      res.json({ ok: true, message: "Saltado a siguiente" });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === ENDPOINTS: YOUTUBE ===
app.post("/api/youtube", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ ok: false, error: "URL requerida" });
  }

  console.log(`[API] Descargando YouTube: ${url}`);

  try {
    const { exec } = require('child_process');
    const outputFile = `/radio/queue/yt_${Date.now()}.mp3`;

    exec(`yt-dlp --extract-audio --audio-format mp3 -o "${outputFile}" "${url}"`, async (error) => {
      if (error) {
        res.status(500).json({ ok: false, error: `Descarga fallida: ${error.message}` });
        return;
      }
      if (fs.existsSync(outputFile)) {
        await sendLSCommand(`queue.push ${outputFile}`);
        currentQueue.push({ type: 'file', uri: outputFile, name: path.basename(outputFile), id: Date.now().toString() });
        res.json({ ok: true, file: outputFile, message: "YouTube agregado a cola" });
      } else {
        res.status(500).json({ ok: false, error: "Descarga fallida" });
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === ENDPOINTS: TTS ===
app.get("/api/tts/voices", (req, res) => {
  res.json({ voices: ['es-ES', 'es-MX', 'es', 'en-US', 'en'] });
});

app.get("/api/tts/queue", (req, res) => {
  const files = fs.existsSync(TTS_DIR)
    ? fs.readdirSync(TTS_DIR).filter(f => f.endsWith('.wav')).map(f => ({ name: f, path: path.join(TTS_DIR, f) }))
    : [];
  res.json({ files });
});

app.post("/api/tts", async (req, res) => {
  const { text, voice, speed } = req.body;

  if (!text) {
    return res.status(400).json({ ok: false, error: "Texto requerido" });
  }

  console.log(`[API] Generando TTS: "${text.substring(0, 50)}..."`);

  try {
    const { exec } = require('child_process');
    const outputFile = path.join(TTS_DIR, `tts_${Date.now()}.wav`);
    const voiceArg = voice || 'es-ES';
    const speedArg = speed || 1.0;

    exec(`espeak-ng -w "${outputFile}" -v ${voiceArg} -s ${speedArg} "${text.replace(/"/g, '\\"')}"`, async (error) => {
      if (error) {
        res.status(500).json({ ok: false, error: `TTS fallido: ${error.message}` });
        return;
      }
      if (fs.existsSync(outputFile)) {
        await sendLSCommand(`queue.push ${outputFile}`);
        currentQueue.push({ type: 'tts', uri: outputFile, name: text.substring(0, 30) + '...', id: Date.now().toString() });
        res.json({ ok: true, file: outputFile, message: "TTS agregado a cola" });
      } else {
        res.status(500).json({ ok: false, error: "TTS fallido" });
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === ENDPOINTS: CONTROL DE VOLUMEN ===
app.get("/api/volume", async (req, res) => {
  res.json({ ok: true });
});

app.post("/api/volume/master", async (req, res) => {
  const { level } = req.body;
  if (typeof level !== 'number') {
    return res.status(400).json({ ok: false, error: "level requerido (0.0-1.0)" });
  }
  try {
    await sendLSCommand(`var.set master_volume = ${level}`);
    res.json({ ok: true, level });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.post("/api/volume/music", async (req, res) => {
  const { level } = req.body;
  if (typeof level !== 'number') {
    return res.status(400).json({ ok: false, error: "level requerido (0.0-1.0)" });
  }
  try {
    await sendLSCommand(`var.set music_volume = ${level}`);
    res.json({ ok: true, level });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.post("/api/volume/mic", async (req, res) => {
  const { level } = req.body;
  if (typeof level !== 'number') {
    return res.status(400).json({ ok: false, error: "level requerido (0.0-1.0)" });
  }
  try {
    await sendLSCommand(`var.set mic_volume = ${level}`);
    res.json({ ok: true, level });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// === ENDPOINTS: MICRO ===
app.post("/api/mic", async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ ok: false, error: "enabled requerido (true/false)" });
  }
  try {
    await sendLSCommand(`var.set mic_enabled = ${enabled}`);
    res.json({ ok: true, enabled });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// === ENDPOINTS: PLAYLISTS ===
app.get("/api/playlists", (req, res) => {
  res.json(getPlaylists());
});

app.get("/api/playlists/:name", (req, res) => {
  const filePath = path.join(PLAYLIST_DIR, req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: "Playlist no existe" });
  }
  const content = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  res.json({ ok: true, name: req.params.name, tracks: content });
});

app.post("/api/playlists", (req, res) => {
  const { name, tracks } = req.body;
  if (!name || !tracks) {
    return res.status(400).json({ ok: false, error: "name y tracks requeridos" });
  }
  const filePath = path.join(PLAYLIST_DIR, name.endsWith('.m3u') ? name : `${name}.m3u`);
  fs.writeFileSync(filePath, tracks.join('\n'));
  res.json({ ok: true, name: path.basename(filePath) });
});

app.delete("/api/playlists/:name", (req, res) => {
  const filePath = path.join(PLAYLIST_DIR, req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: "Playlist no existe" });
  }
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

app.post("/api/playlists/:name/activate", async (req, res) => {
  const filePath = path.join(PLAYLIST_DIR, req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: "Playlist no existe" });
  }
  fs.copyFileSync(filePath, PLAYLIST_FILE);
  res.json({ ok: true, message: "Playlist activada" });
});

// === INICIO ===
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`);
});
