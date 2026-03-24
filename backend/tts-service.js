const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const TTS_DIR = process.env.TTS_DIR || '/radio/tts';

class TTSService {
  constructor() {
    this.voices = {
      'es': 'es',
      'es-ES': 'es-ES',
      'en': 'en',
      'en-US': 'en-US',
      'es-MX': 'es-MX'
    };

    this.defaultVoice = 'es-ES';
  }

  ensureDirectory() {
    if (!fs.existsSync(TTS_DIR)) {
      fs.mkdirSync(TTS_DIR, { recursive: true });
    }
  }

  async speak(text, options = {}) {
    this.ensureDirectory();

    const voice = this.voices[options.voice] || this.defaultVoice;
    const speed = options.speed || 1.0;
    const outputFile = path.join(TTS_DIR, `tts_${uuidv4()}.wav`);

    return new Promise((resolve, reject) => {
      // espeak-ng: -w archivo, -v voz, -s velocidad
      const cmd = `espeak-ng -w "${outputFile}" -v ${voice} -s ${speed} "${text.replace(/"/g, '\\"')}"`;

      console.log(`[TTS] Generando: "${text.substring(0, 50)}..." con voz ${voice}`);

      exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[TTS] Error: ${stderr || error.message}`);
          return reject(error);
        }

        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          if (stats.size > 100) {
            console.log(`[TTS] Generado: ${outputFile}`);
            resolve({
              id: uuidv4(),
              file: outputFile,
              text: text,
              voice: voice
            });
          } else {
            fs.unlinkSync(outputFile);
            reject(new Error('Archivo TTS demasiado pequeño'));
          }
        } else {
          reject(new Error('Archivo TTS no encontrado'));
        }
      });
    });
  }

  async addToTTSQueue(text, options = {}) {
    try {
      const result = await this.speak(text, options);
      return {
        success: true,
        file: result.file,
        message: 'Audio TTS agregado'
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  listVoices() {
    return Object.keys(this.voices);
  }

  getQueueFiles() {
    this.ensureDirectory();
    return fs.readdirSync(TTS_DIR)
      .filter(f => f.endsWith('.wav'))
      .map(f => ({
        name: f,
        path: path.join(TTS_DIR, f),
        size: fs.statSync(path.join(TTS_DIR, f)).size
      }));
  }
}

module.exports = new TTSService();
