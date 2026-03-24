settings.init.allow_root := true
set("log.file", "/radio/logs/liquidsoap.log")
set("init.daemon", false)

playlist_radio = playlist(
  reload_mode="watch",
  "/radio/playlists/playlist.m3u"
)

radio = fallback(track_sensitive=false, [playlist_radio, single("/radio/music/fallback.mp3")])

output.icecast(
  %mp3(bitrate=128, stereo=true),
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
