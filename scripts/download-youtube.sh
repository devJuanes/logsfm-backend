#!/bin/bash
# ============================================
# YouTube Downloader Helper
# Descarga audio de YouTube usando yt-dlp
# ============================================

# Configuración
QUEUE_DIR="/radio/queue"
MUSIC_DIR="/radio/music"

# Verificar que yt-dlp está instalado
if ! command -v yt-dlp &> /dev/null; then
    echo "Error: yt-dlp no está instalado"
    echo "Instala con: sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp"
    exit 1
fi

# Crear directorios si no existen
mkdir -p "$QUEUE_DIR" "$MUSIC_DIR"

# URL como argumento
URL="$1"

if [ -z "$URL" ]; then
    echo "Uso: $0 <youtube_url>"
    echo "Ejemplo: $0 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'"
    exit 1
fi

# Generar nombre de archivo
TIMESTAMP=$(date +%s)
OUTPUT_TEMPLATE="$QUEUE_DIR/%(title)s_${TIMESTAMP}.%(ext)s"

echo "Descargando: $URL"
echo "Destino: $QUEUE_DIR"

# Descargar solo audio
yt-dlp \
    --extract-audio \
    --audio-format mp3 \
    --audio-quality 0 \
    -o "$OUTPUT_TEMPLATE" \
    --no-playlist \
    "$URL"

if [ $? -eq 0 ]; then
    echo "Descarga completada"
    ls -la "$QUEUE_DIR"/*.mp3 2>/dev/null | tail -1
else
    echo "Error en descarga"
    exit 1
fi
