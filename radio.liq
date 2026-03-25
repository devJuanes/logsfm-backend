#!/usr/bin/liquidsoap

# ============================================================
# LOGS FM - Radio Professional Configuration
# ============================================================

# === CONFIGURACIÓN INICIAL ===
settings.log.file := "/radio/logs/liquidsoap.log"
settings.log.level := 3
settings.init.allow_root := true

# === SERVIDOR TELNET PARA CONTROL EXTERNO ===
settings.server.telnet := true
settings.server.telnet.bind_addr := "127.0.0.1"
settings.server.telnet.port := 1234

# ============================================================
# FUENTES DE AUDIO
# ============================================================

# 1. PLAYLIST PRINCIPAL (archivos locales)
main_playlist = playlist(
  reload_mode="watch",
  "/radio/playlists/playlist.m3u"
)

# 2. COLA DINÁMICA (URLs y archivos agregados via API)
dynamic_queue = request.queue()

# 3. TTS (audios generados por espeak-ng)
tts_playlist = playlist(
  reload_mode="watch",
  "/radio/tts/"
)

# ============================================================
# CONTROL DE VOLUMEN INTERACTIVO (via telnet)
# ============================================================

master_volume = interactive.float("master_volume", 1.0)
music_volume = interactive.float("music_volume", 1.0)
# Nota: Micrófono deshabilitado en servidor - usar input.alsa en desktop
mic_enabled = interactive.bool("mic_enabled", false)
mic_volume = interactive.float("mic_volume", 0.8)

# ============================================================
# MEZCLA DE FUENTES CON PRIORIDAD
# ============================================================

# Mezcla normal: playlist + tts a volumen controlado
radio = add([
  amplify(music_volume, main_playlist),
  amplify(0.95, tts_playlist)
])

# Si hay algo en la cola dinámica, tiene prioridad total
radio = fallback(track_sensitive=false, [
  dynamic_queue,
  radio
])

# Aplicar volumen master
radio = amplify(master_volume, radio)

# ============================================================
# FALLBACK FINAL (si todo falla, reproducir fallback)
# ============================================================

radio = fallback(track_sensitive=false, [
  radio,
  single("/radio/music/fallback.mp3")
])

# ============================================================
# OUTPUT ICECAST
# ============================================================

output.icecast(
  %mp3(bitrate=128, samplerate=44100),
  host="127.0.0.1",
  port=8000,
  password="source123",
  mount="/radio.mp3",
  name="Logs FM",
  description="Radio online para programadores",
  genre="Tech",
  url="https://radio.logsfm.com",
  radio
)

# ============================================================
# LOGS DE INICIO
# ============================================================

print("========================================")
print("  LOGS FM - Radio Professional")
print("========================================")
print("Servidor Telnet: 127.0.0.1:1234")
print("Icecast Output: 127.0.0.1:8000")
print("Playlist: /radio/playlists/playlist.m3u")
print("TTS: /radio/tts/")
print("========================================")
