const net = require('net');

const LIQUIDSOAP_HOST = process.env.LIQUIDSOAP_HOST || '127.0.0.1';
const LIQUIDSOAP_PORT = process.env.LIQUIDSOAP_PORT || 1234;

class LiquidsoapController {
  constructor() {
    this.client = null;
    this.connected = false;
    this.commandQueue = [];
    this.pendingResponses = {};
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.connected && this.client) {
        return resolve(true);
      }

      this.client = new net.Socket();

      this.client.connect(LIQUIDSOAP_PORT, LIQUIDSOAP_HOST, () => {
        console.log(`[LS] Conectado a Liquidsoap ${LIQUIDSOAP_HOST}:${LIQUIDSOAP_PORT}`);
        this.connected = true;
        this.processQueue();
        resolve(true);
      });

      this.client.on('error', (err) => {
        console.error('[LS] Error de conexión:', err.message);
        this.connected = false;
        reject(err);
      });

      this.client.on('close', () => {
        console.log('[LS] Conexión cerrada');
        this.connected = false;
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
  }

  sendCommand(cmd) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.client) {
        this.commandQueue.push({ cmd, resolve, reject });
        return this.connect().then(() => this.sendCommand(cmd)).catch(reject);
      }

      const cmdId = Date.now().toString();
      const fullCmd = cmd.includes('\n') ? cmd : `${cmd}\n`;

      this.pendingResponses[cmdId] = { resolve, reject };

      this.client.write(fullCmd, (err) => {
        if (err) {
          delete this.pendingResponses[cmdId];
          reject(err);
        } else {
          setTimeout(() => {
            if (this.pendingResponses[cmdId]) {
              this.pendingResponses[cmdId].resolve('ok');
              delete this.pendingResponses[cmdId];
            }
          }, 100);
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
