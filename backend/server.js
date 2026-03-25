const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Services
const lsController = require("./liquidsoap-controller");
const youtubeService = require("./youtube-service");
const ttsService = require("./tts-service");

// Configuración de directorios
const MUSIC_DIR = process.env.MUSIC_DIR || "/radio/music";
const PLAYLIST_DIR = process.env.PLAYLIST_DIR || "/radio/playlists";
const PLAYLIST_FILE = path.join(PLAYLIST_DIR, "playlist.m3u");
const TTS_DIR = process.env.TTS_DIR || "/radio/tts";
const QUEUE_DIR = process.env.QUEUE_DIR || "/radio/queue";

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

// === ENDPOINTS: SALUD ===
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// === ENDPOINTS: ESTADO DE RADIO ===
app.get("/api/status", async (req, res) => {
  try {
    const status = await lsController.getStatus();
    const songs = getSongs();
    const ttsFiles = ttsService.getQueueFiles();
    const downloading = youtubeService.getDownloading();

    res.json({
      liquidsoap: status,
      songsCount: songs.length,
      ttsQueue: ttsFiles.length,
      downloading: downloading,
      uptime: process.uptime()
    });
  } catch (err) {
    res.json({ liquidsoap: { connected: false }, error: err.message });
  }
});

app.get("/api/listeners", (req, res) => {
  // Icecast no tiene API REST nativa, se conecta por stats
  // Por ahora devolvemos un estimado o se puede consultar XML
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
app.get("/api/queue", async (req, res) => {
  try {
    const queue = await lsController.queueAll();
    res.json({ ok: true, queue: queue || [] });
  } catch (err) {
    res.json({ ok: false, queue: [], error: err.message });
  }
});

app.post("/api/queue", async (req, res) => {
  const { url, file } = req.body;

  if (url) {
    // Es una URL directa
    try {
      await lsController.queuePush(url);
      res.json({ ok: true, message: "URL agregada a cola" });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  } else if (file) {
    // Es un archivo local
    const filePath = path.join(MUSIC_DIR, file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: "Archivo no existe" });
    }
    try {
      await lsController.queuePush(filePath);
      res.json({ ok: true, message: "Archivo agregado a cola" });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  } else {
    res.status(400).json({ ok: false, error: "url o file requerido" });
  }
});

app.delete("/api/queue/:rid", async (req, res) => {
  try {
    await lsController.queueRemove(req.params.rid);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.post("/api/queue/skip", async (req, res) => {
  try {
    const result = await lsController.queueSkip();
    res.json({ ok: true, result });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.post("/api/queue/play-now", async (req, res) => {
  const { url, file } = req.body;

  try {
    // Skip current and play immediately
    try {
      await lsController.queueSkip();
    } catch (skipErr) {
      console.warn("[API] No se pudo saltar la canción actual:", skipErr.message);
    }

    if (url) {
      await lsController.queuePush(url);
      res.json({ ok: true, message: "Reproduciendo ahora" });
    } else if (file) {
      const filePath = path.join(MUSIC_DIR, file);
      await lsController.queuePush(filePath);
      res.json({ ok: true, message: "Reproduciendo ahora" });
    } else {
      res.json({ ok: true, message: "Saltado a siguiente" });
    }
  } catch (err) {
    res.status(200).json({ ok: false, error: `Error en Liquidsoap: ${err.message}` });
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
    const result = await youtubeService.addToQueue(url);
    if (result.success) {
      // Agregar a cola de Liquidsoap
      try {
        await lsController.queuePush(result.file);
        res.json({ ok: true, file: result.file, message: "YouTube agregado a cola" });
      } catch (lsErr) {
        res.json({ ok: true, file: result.file, message: "YouTube descargado (agregar manualmente a cola)", error: lsErr.message });
      }
    } else {
      res.status(500).json({ ok: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === ENDPOINTS: TTS ===
app.get("/api/tts/voices", (req, res) => {
  res.json({ voices: ttsService.listVoices() });
});

app.get("/api/tts/queue", (req, res) => {
  res.json({ files: ttsService.getQueueFiles() });
});

app.post("/api/tts", async (req, res) => {
  const { text, voice, speed } = req.body;

  if (!text) {
    return res.status(400).json({ ok: false, error: "Texto requerido" });
  }

  console.log(`[API] Generando TTS: "${text.substring(0, 50)}..."`);

  try {
    const result = await ttsService.addToTTSQueue(text, { voice, speed });
    if (result.success) {
      // Agregar a cola de Liquidsoap
      try {
        await lsController.queuePush(result.file);
        res.json({ ok: true, file: result.file, message: "TTS agregado a cola" });
      } catch (lsErr) {
        res.json({ ok: true, file: result.file, message: "TTS generado (agregar manualmente)", error: lsErr.message });
      }
    } else {
      res.status(500).json({ ok: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === ENDPOINTS: CONTROL DE VOLUMEN ===
app.get("/api/volume", async (req, res) => {
  try {
    const vars = await lsController.getVars();
    res.json({ ok: true, vars });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.post("/api/volume/master", async (req, res) => {
  const { level } = req.body;
  if (typeof level !== 'number') {
    return res.status(400).json({ ok: false, error: "level requerido (0.0-1.0)" });
  }
  try {
    await lsController.setMasterVolume(level);
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
    await lsController.setMusicVolume(level);
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
    await lsController.setMicVolume(level);
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
    await lsController.setMicEnabled(enabled);
    res.json({ ok: true, enabled });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get("/api/mic/status", async (req, res) => {
  res.json({ enabled: false, message: "Consultar estado desde Liquidsoap" });
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
  const content = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(Boolean);
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
  // Copiar como playlist activa
  fs.copyFileSync(filePath, PLAYLIST_FILE);
  res.json({ ok: true, message: "Playlist activada" });
});

// === CONEXIÓN CON LIQUIDSOAP ===
async function initLiquidsoap() {
  try {
    await lsController.connect();
    console.log('[Server] Liquidsoap conectado');
  } catch (err) {
    console.warn('[Server] No se pudo conectar a Liquidsoap (¿no está corriendo?):', err.message);
    console.warn('[Server] El servidor seguirá funcionando sin control de Liquidsoap');
  }
}

// === INICIO ===
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`);
  initLiquidsoap();
});
