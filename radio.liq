#!/usr/bin/liquidsoap

# ============================================================
# LOGS FM - Radio Professional Configuration
# ============================================================

# === CONFIGURACIÓN INICIAL ===
set("log.file", "/radio/logs/liquidsoap.log")
set("log.level", 3)
set("init.daemon", true)
set("init.daemon.pidfile", "/var/run/liquidsoap/liquidsoap.pid")

# === SERVIDOR TELNET PARA CONTROL EXTERNO ===
set("server.telnet", true)
set("server.address", "127.0.0.1")
set("server.port", 1234)

# ============================================================
# FUENTES DE AUDIO
# ============================================================

# 1. PLAYLIST PRINCIPAL (archivos locales)
main_playlist = playlist(
  reload_mode="watch",
  "/radio/playlists/playlist.m3u"
)

# 2. COLA DINÁMICA (URLs y archivos agregados via API)
dynamic_queue = request.queue(id="dynamic_queue")

# 3. TTS (audios generados por espeak-ng)
tts_playlist = playlist(
  reload_mode="watch",
  "/radio/tts/"
)

# 4. MICROÍFONO EN VIVO
def mic_or_silence() =
  try
    input.pulseaudio(device="default")
  catch error do
    print("Mic no disponible: #{error}")
    single("/radio/silence.mp3")
  end
end

mic_source = mic_or_silence()

# ============================================================
# CONTROL DE VOLUMEN INTERACTIVO (via telnet)
# ============================================================

master_volume = interactive.float("master_volume", 1.0)
music_volume = interactive.float("music_volume", 1.0)
mic_volume = interactive.float("mic_volume", 0.8)
mic_enabled = interactive.bool("mic_enabled", false)

# ============================================================
# MEZCLA DE FUENTES
# ============================================================

# Aplicar volúmenes a cada fuente
music_with_vol = amplify(music_volume, main_playlist)
queue_with_vol = amplify(0.9, dynamic_queue)
tts_with_vol = amplify(0.95, tts_playlist)
mic_with_vol = amplify(mic_volume, mic_source)

# Mezclar: música + queue + TTS (cada una con su peso usando amplify)
radio_base = add([
  amplify(0.7, music_with_vol),
  amplify(0.8, queue_with_vol),
  amplify(0.85, tts_with_vol)
])

# Mic solo si está habilitado (sino silencio)
mic_mixed = switch(track_sensitive=false, [
  (mic_enabled, mic_with_vol),
  ({true}, single("/radio/silence.mp3"))
])

# Mezclar todo con volumen master
radio = amplify(master_volume, add([radio_base, mic_mixed]))

# ============================================================
# CROSSFADE SUAVE
# ============================================================

radio = crossfade(fade_in=2.0, fade_out=2.0, radio)

# ============================================================
# FALLBACK FINAL (si todo falla)
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
