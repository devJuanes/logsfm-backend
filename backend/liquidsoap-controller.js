const net = require('net');

const LIQUIDSOAP_HOST = process.env.LIQUIDSOAP_HOST || '127.0.0.1';
const LIQUIDSOAP_PORT = process.env.LIQUIDSOAP_PORT || 1234;

class LiquidsoapController {
  constructor() {
    this.client = null;
    this.connected = false;
    this.commandQueue = [];
    this.pendingResponses = {};
    this.lastConnectAttempt = 0;
    this.connectCooldown = 5000; // 5 segundos entre reintentos
    this.connectTimeout = 3000;   // 3 segundos de timeout para conectar
  }

  connect() {
    const now = Date.now();
    if (this.connected && this.client) {
      return Promise.resolve(true);
    }

    if (now - this.lastConnectAttempt < this.connectCooldown) {
      return Promise.reject(new Error(`Reintento de conexión en enfriamiento (${Math.round((this.connectCooldown - (now - this.lastConnectAttempt)) / 1000)}s restantes)`));
    }

    this.lastConnectAttempt = now;

    return new Promise((resolve, reject) => {
      this.client = new net.Socket();
      
      // Establecer timeout
      this.client.setTimeout(this.connectTimeout);

      this.client.connect(LIQUIDSOAP_PORT, LIQUIDSOAP_HOST, () => {
        console.log(`[LS] Conectado a Liquidsoap ${LIQUIDSOAP_HOST}:${LIQUIDSOAP_PORT}`);
        this.connected = true;
        this.processQueue();
        resolve(true);
      });

      this.client.on('error', (err) => {
        console.error('[LS] Error de conexión:', err.message);
        this.connected = false;
        this.client.destroy();
        reject(err);
      });

      this.client.on('timeout', () => {
        console.error('[LS] Timeout de conexión');
        this.connected = false;
        this.client.destroy();
        reject(new Error('Timeout conectando a Liquidsoap'));
      });

      this.client.on('close', () => {
        if (this.connected) {
          console.log('[LS] Conexión cerrada');
        }
        this.connected = false;
        this.client = null;
      });

      let buffer = '';
      this.client.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          this.handleResponse(line.trim());
        }
      });
    });
  }

  handleResponse(line) {
    console.log('[LS] Response:', line);
    // Liquidsoap telnet responde con "END" o similar para algunos comandos?
    // Usualmente solo envía la línea. Por ahora el timeout de 100ms en sendCommand
    // es lo que resuelve la promesa, pero podríamos mejorar esto.
  }

  sendCommand(cmd) {
    if (!this.connected || !this.client) {
      // Si no está conectado, intentamos conectar una vez y luego enviar.
      // Pero no encolamos infinitamente si falla.
      return this.connect()
        .then(() => this.sendCommand(cmd))
        .catch(err => {
          // Si falla la conexión, rechazamos inmediatamente (limpia la cola si es necesario)
          throw err;
        });
    }

    return new Promise((resolve, reject) => {
      const cmdId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      const fullCmd = cmd.includes('\n') ? cmd : `${cmd}\n`;

      this.pendingResponses[cmdId] = { resolve, reject };

      this.client.write(fullCmd, (err) => {
        if (err) {
          delete this.pendingResponses[cmdId];
          reject(err);
        } else {
          // Los comandos de telnet de Liquidsoap usualmente no necesitan esperar mucho
          // pero algunos pueden tardar. Por ahora mantenemos el timeout pero
          // lo hacemos un poco más robusto.
          setTimeout(() => {
            if (this.pendingResponses[cmdId]) {
              this.pendingResponses[cmdId].resolve('ok');
              delete this.pendingResponses[cmdId];
            }
          }, 200);
        }
      });
    });
  }

  processQueue() {
    while (this.commandQueue.length > 0 && this.connected) {
      const { cmd, resolve, reject } = this.commandQueue.shift();
      this.sendCommand(cmd).then(resolve).catch(reject);
    }
  }

  // === Control de Cola ===

  async queuePush(uri) {
    return this.sendCommand(`queue.push ${uri}`);
  }

  async queueRemove(rid) {
    return this.sendCommand(`queue.remove ${rid}`);
  }

  async queueSkip() {
    return this.sendCommand(`queue.skip`);
  }

  async queueAll() {
    return this.sendCommand(`request.all`);
  }

  // === Control de Volumen ===

  async setMusicVolume(level) {
    const clamped = Math.max(0, Math.min(1, level));
    return this.sendCommand(`var.set music_volume = ${clamped}`);
  }

  async setMicVolume(level) {
    const clamped = Math.max(0, Math.min(1, level));
    return this.sendCommand(`var.set mic_volume = ${clamped}`);
  }

  async setMasterVolume(level) {
    const clamped = Math.max(0, Math.min(1, level));
    return this.sendCommand(`var.set master_volume = ${clamped}`);
  }

  // === Control de Micrófono ===

  async setMicEnabled(enabled) {
    const value = enabled ? 'true' : 'false';
    return this.sendCommand(`var.set mic_enabled = ${value}`);
  }

  // === Estado ===

  async getStatus() {
    try {
      await this.sendCommand('source');
      return { connected: this.connected };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  async getVars() {
    return this.sendCommand('var.list');
  }

  async getMetadata() {
    return this.sendCommand('metadata');
  }

  // === Utilidades ===

  disconnect() {
    if (this.client) {
      this.client.destroy();
      this.client = null;
      this.connected = false;
    }
  }
}

module.exports = new LiquidsoapController();
