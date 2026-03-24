const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const QUEUE_DIR = process.env.QUEUE_DIR || '/radio/queue';
const MUSIC_DIR = process.env.MUSIC_DIR || '/radio/music';

class YoutubeService {
  constructor() {
    this.downloading = new Set();
  }

  ensureDirectories() {
    const dirs = [QUEUE_DIR, MUSIC_DIR];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  async download(url) {
    this.ensureDirectories();

    const downloadId = uuidv4();
    const outputFile = path.join(QUEUE_DIR, `${downloadId}.mp3`);

    return new Promise((resolve, reject) => {
      if (this.downloading.has(url)) {
        return reject(new Error('Esta URL ya se está descargando'));
      }

      this.downloading.add(url);
      console.log(`[YT] Descargando: ${url}`);

      // Usar yt-dlp para descargar solo audio
      const cmd = [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', outputFile,
        url
      ].join(' ');

      exec(cmd, { timeout: 300000 }, (error, stdout, stderr) => {
        this.downloading.delete(url);

        if (error) {
          console.error(`[YT] Error: ${stderr || error.message}`);
          // Si falla, intentar con formato diferente
          return this.downloadFallback(url, outputFile, reject);
        }

        // Verificar que el archivo existe
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          if (stats.size > 10000) {
            console.log(`[YT] Descargado: ${outputFile}`);
            resolve({
              id: downloadId,
              file: outputFile,
              originalUrl: url
            });
          } else {
            fs.unlinkSync(outputFile);
            reject(new Error('Archivo demasiado pequeño, descarga fallida'));
          }
        } else {
          reject(new Error('Archivo no encontrado después de descarga'));
        }
      });
    });
  }

  downloadFallback(url, outputFile, reject) {
    // Intentar con formatos compatibilidd con más sitios
    const cmd = [
      'yt-dlp',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--format', 'bestaudio/best',
      '-o', outputFile,
      url
    ].join(' ');

    exec(cmd, { timeout: 300000 }, (error, stdout, stderr) => {
      if (error) {
        fs.unlinkSync(outputFile);
        return reject(new Error(`Descarga fallida: ${stderr || error.message}`));
      }

      if (fs.existsSync(outputFile)) {
        resolve({
          id: uuidv4(),
          file: outputFile,
          originalUrl: url
        });
      } else {
        reject(new Error('Archivo no encontrado'));
      }
    });
  }

  async addToQueue(url) {
    try {
      const result = await this.download(url);
      return {
        success: true,
        file: result.file,
        message: 'Agregado a la cola'
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  getDownloading() {
    return Array.from(this.downloading);
  }
}

module.exports = new YoutubeService();
