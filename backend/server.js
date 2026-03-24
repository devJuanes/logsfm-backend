const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const MUSIC_DIR = "/radio/music";
const PLAYLIST_FILE = "/radio/playlists/playlist.m3u";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MUSIC_DIR),
  filename: (req, file, cb) => cb(null, file.originalname)
});

const upload = multer({ storage });

function rebuildPlaylist() {
  const files = fs.readdirSync(MUSIC_DIR)
    .filter(file => /\.(mp3|aac|ogg)$/i.test(file))
    .map(file => path.join(MUSIC_DIR, file));

  fs.writeFileSync(PLAYLIST_FILE, files.join("\n"));
  return files;
}

app.get("/songs", (req, res) => {
  const files = fs.readdirSync(MUSIC_DIR)
    .filter(file => /\.(mp3|aac|ogg)$/i.test(file));
  res.json(files);
});

app.get("/playlist", (req, res) => {
  if (!fs.existsSync(PLAYLIST_FILE)) return res.json([]);
  const content = fs.readFileSync(PLAYLIST_FILE, "utf-8")
    .split("\n")
    .filter(Boolean);
  res.json(content);
});

app.post("/rebuild-playlist", (req, res) => {
  const files = rebuildPlaylist();
  res.json({ ok: true, total: files.length, files });
});

app.post("/upload", upload.single("song"), (req, res) => {
  rebuildPlaylist();
  res.json({ ok: true, file: req.file.filename });
});

app.delete("/songs/:name", (req, res) => {
  const filePath = path.join(MUSIC_DIR, req.params.name);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: "No existe" });
  }

  fs.unlinkSync(filePath);
  rebuildPlaylist();
  res.json({ ok: true });
});

app.listen(3001, () => {
  console.log("Backend corriendo en puerto 3001");
});
