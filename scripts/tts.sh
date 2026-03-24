#!/bin/bash
# ============================================
# TTS Helper Script
# Genera audio TTS usando espeak-ng
# ============================================

# Configuración
TTS_DIR="/radio/tts"
VOICE="${VOICE:-es-ES}"
SPEED="${SPEED:-1.0}"

# Verificar que espeak-ng está instalado
if ! command -v espeak-ng &> /dev/null; then
    echo "Error: espeak-ng no está instalado"
    exit 1
fi

# Verificar directorio
if [ ! -d "$TTS_DIR" ]; then
    mkdir -p "$TTS_DIR"
fi

# Generar nombre de archivo único
TIMESTAMP=$(date +%s)
OUTPUT_FILE="$TTS_DIR/tts_${TIMESTAMP}.wav"

# Texto a generar (argumentos)
TEXT="$*"

if [ -z "$TEXT" ]; then
    echo "Uso: $0 <texto>"
    echo "Ejemplo: $0 'Hola mundo'"
    exit 1
fi

# Generar TTS
echo "Generando TTS: $TEXT"
espeak-ng -w "$OUTPUT_FILE" -v "$VOICE" -s "$SPEED" "$TEXT"

if [ -f "$OUTPUT_FILE" ]; then
    echo "Generado: $OUTPUT_FILE"
    exit 0
else
    echo "Error generando TTS"
    exit 1
fi
