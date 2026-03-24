# Logs FM - Guía de Instalación en Servidor

Esta guía te ayudará a instalar y configurar la radio profesional en tu servidor Linux (Debian/Ubuntu).

## Requisitos Previos

- Servidor con Debian/Ubuntu
- Icecast instalado y configurado
- Acceso root o sudo

## 1. Paquetes del Sistema

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Liquidsoap
sudo apt install liquidsoap

# Instalar TTS (espeak-ng)
sudo apt install espeak-ng

# Instalar yt-dlp para YouTube
sudo apt install yt-dlp

# Instalar ffmpeg (necesario para algunas conversiones)
sudo apt install ffmpeg

# Herramientas de audio (ALSA, PulseAudio)
sudo apt install alsa-utils pulseaudio
```

## 2. Estructura de Directorios

Crea la estructura de directorios en `/radio`:

```bash
sudo mkdir -p /radio/{music,playlists,tts,queue,logs,scripts}

# Dar permisos al usuario que correrá la radio
sudo chown -R tu-usuario:tu-usuario /radio
```

## 3. Archivos Necesarios

### 3.1 Archivo de Silencio

Crea un archivo de silencio de 1 segundo para el fallback:

```bash
# Crear silencio de 1 segundo
ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 1 -q:a 9 /radio/silence.mp3
```

### 3.2 Copiar Archivos del Proyecto

Desde tu máquina local, copia los archivos:

```bash
# En tu máquina local (desde el directorio del proyecto)
rsync -avz --exclude='node_modules' --exclude='.git' \
  ./backend/ user@tu-servidor:/radio/
rsync -avz ./radio.liq user@tu-servidor:/radio/
rsync -avz ./music/ user@tu-servidor:/radio/music/
```

### 3.3 Permissions de Scripts

```bash
chmod +x /radio/scripts/*.sh
```

## 4. Configuración de Icecast

Edita la configuración de Icecast (`/etc/icecast2/icecast.xml`):

```xml
<icecast>
    <limits>
        <clients>100</clients>
        <sources>10</sources>
        <threadpool>5</threadpool>
        <queue-size>524288</queue-size>
    </limits>

    <authentication>
        <source-password>source123</source-password>
        <relay-password>source123</relay-password>
        <admin-user>admin</admin-user>
        <admin-password>tu-password-admin</admin-password>
    </authentication>

    <listen-socket>
        <port>8000</port>
    </listen-socket>

    <fileserve>1</fileserve>

    <paths>
        <logdir>/var/log/icecast2</logdir>
        <webroot>/usr/share/icecast2/web</webroot>
        <adminroot>/usr/share/icecast2/admin</adminroot>
    </paths>
</icecast>
```

Iniciar Icecast:

```bash
sudo systemctl enable icecast2
sudo systemctl start icecast2
```

## 5. Variables de Entorno (Opcional)

Crea un archivo `.env` en `/radio/` para configuración:

```bash
# /radio/.env
MUSIC_DIR=/radio/music
PLAYLIST_DIR=/radio/playlists
TTS_DIR=/radio/tts
QUEUE_DIR=/radio/queue
LIQUIDSOAP_HOST=127.0.0.1
LIQUIDSOAP_PORT=1234
PORT=3001
```

## 6. Instalar Dependencias Node.js

```bash
cd /radio/backend

# Instalar nvm (Node Version Manager) si no tienes Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18

# Instalar dependencias
npm install
```

## 7. Iniciar Servicios

### 7.1 Iniciar Liquidsoap

```bash
# Crear directorio para PID
sudo mkdir -p /var/run/liquidsoap

# Iniciar Liquidsoap en background
liquidsoap --daemon /radio/radio.liq

# Verificar logs
tail -f /radio/logs/liquidsoap.log
```

### 7.2 Iniciar Backend

```bash
cd /radio/backend
node server.js
```

O con PM2 para mantenerlo corriendo:

```bash
# Instalar PM2
npm install -g pm2

# Iniciar con PM2
pm2 start server.js --name logsfm-backend

# Guardar configuración de PM2
pm2 save
pm2 startup
```

## 8. Verificar Funcionamiento

### 8.1 Probar la API

```bash
# Health check
curl http://localhost:3001/api/health

# Ver estado
curl http://localhost:3001/api/status

# Ver canciones
curl http://localhost:3001/api/songs
```

### 8.2 Probar la Radio

Abre en tu navegador:
- Radio stream: `http://tu-servidor:8000/radio.mp3`
- Panel admin: `http://tu-servidor:3001` (o sirviendo la carpeta `frontend/`)

### 8.3 Probar TTS

```bash
# Generar un TTS de prueba
curl -X POST http://localhost:3001/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Bienvenidos a Logs FM, la radio para programadores", "voice": "es-ES"}'
```

### 8.4 Probar YouTube

```bash
# Descargar de YouTube
curl -X POST http://localhost:3001/api/youtube \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=TU_VIDEO_ID"}'
```

## 9. Configurar SSL (Recomendado)

Para producción, usa Nginx como proxy reverso con SSL:

```nginx
# /etc/nginx/sites-available/radio

server {
    listen 443 ssl;
    server_name radio.tudominio.com;

    ssl_certificate /etc/letsencrypt/live/tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tudominio.com/privkey.pem;

    # Panel Admin
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name radio.tudominio.com;
    return 301 https://$server_name$request_uri;
}
```

## 10. Comandos Útiles

```bash
# Ver estado de Liquidsoap
ps aux | grep liquidsoap

# Reiniciar Liquidsoap
pkill liquidsoap
liquidsoap --daemon /radio/radio.liq

# Ver logs en tiempo real
tail -f /radio/logs/liquidsoap.log

# Comandos de control de Liquidsoap (telnet)
telnet 127.0.0.1 1234

# Dentro de telnet:
# var.list                    → Ver variables
# var.set music_volume = 0.5  → Ajustar volumen
# queue.push /path/to/file    → Agregar a cola
# help                        → Ver ayuda
```

## 11. Troubleshooting

### Error: "Mic input not available"

El micrófono no está disponible. Verifica:
```bash
# Ver dispositivos de audio
pactl list short sources
```

### Error: "Cannot connect to Liquidsoap"

```bash
# Verificar que Liquidsoap está corriendo
ps aux | grep liquidsoap

# Verificar telnet
telnet 127.0.0.1 1234
```

### Error: "yt-dlp not found"

```bash
# Instalar yt-dlp correctamente
sudo apt remove yt-dlp
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### Error: Playlist vacía

```bash
# Reconstruir playlist
curl -X POST http://localhost:3001/api/rebuild-playlist
```

## 12. Firewall

Asegúrate de abrir los puertos necesarios:

```bash
sudo ufw allow 8000/tcp  # Icecast
sudo ufw allow 3001/tcp  # Backend API
sudo ufw allow 1234/tcp  # Liquidsoap Telnet (solo localhost)
```

---

¿Necesitas ayuda? Revisa los logs en `/radio/logs/` o contacta al desarrollador.
