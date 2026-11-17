import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Locate a Stockfish binary. Set STOCKFISH_PATH to override.
 */
export function findEnginePath() {
  const candidates = [
    process.env.STOCKFISH_PATH,
    path.join(process.cwd(), 'bin', 'stockfish'),
    path.join(os.homedir(), 'stockfish', 'stockfish'),
    path.join(os.homedir(), 'stockfish', 'stockfish-linux-x86-64-universal'),
    '/usr/local/bin/stockfish',
    '/usr/bin/stockfish',
    '/usr/games/stockfish',
    '/opt/homebrew/bin/stockfish',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const START_TIMEOUT_MS = 20_000;
const POSITION_TIMEOUT_MS = 45_000;

/**
 * A tiny, dependency-free UCI client for Stockfish.
 * Analyses are serialized through a promise queue so many matches can share one process.
 */
export class StockfishEngine {
  constructor(binary, { threads = 2, hashMb = 256 } = {}) {
    this.binary = binary;
    this.threads = threads;
    this.hashMb = hashMb;
    this.proc = null;
    this.name = 'Stockfish';
    this.ready = false;
    this.stderr = '';
    this.handshake = null;
    this.current = null;
    this.queue = Promise.resolve();
  }

  async start() {
    if (this.ready) return this;
    if (!this.binary) throw new Error('Stockfish binary not found. Run `npm run engine:install`.');

    this.proc = spawn(this.binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');

    let buf = '';
    this.proc.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) this.#onLine(line);
      }
    });
    this.proc.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-4000);
    });
    this.proc.on('exit', () => {
      this.ready = false;
      const current = this.current;
      this.current = null;
      if (current) current.reject(new Error('Stockfish stopped unexpectedly. ' + this.stderr.slice(-400)));
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handshake = null;
        reject(new Error('Stockfish did not start in time.'));
      }, START_TIMEOUT_MS);
      this.handshake = {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.#write('uci');
    });
    return this;
  }

  #write(cmd) {
    if (!this.proc || !this.proc.stdin.writable) throw new Error('Stockfish process is not running.');
    this.proc.stdin.write(cmd + '\n');
  }

  #onLine(line) {
    if (line.startsWith('id name ')) {
      this.name = line.slice('id name '.length).trim();
      return;
    }
    if (line === 'uciok') {
      this.#write(`setoption name Threads value ${this.threads}`);
      this.#write(`setoption name Hash value ${this.hashMb}`);
      this.#write('isready');
      return;
    }
    if (line === 'readyok') {
      this.ready = true;
      const handshake = this.handshake;
      this.handshake = null;
      handshake?.resolve(this);
      return;
    }
    if (line.startsWith('info ')) {
      this.#onInfo(line);
      return;
    }
    if (line.startsWith('bestmove')) {
      const best = line.split(/\s+/)[1];
      const current = this.current;
      this.current = null;
      if (!current) return;
      current.clearTimer?.();
      const lines = [...current.lines.values()]
        .filter((entry) => entry.pv.length > 0)
        .sort((a, b) => a.multipv - b.multipv)
        .map((entry) => ({
          multipv: entry.multipv,
          depth: entry.depth,
          cp: entry.cp ?? null,
          mate: entry.mate ?? null,
          pv: entry.pv,
        }));
      current.resolve({ lines, bestmove: best && best !== '(none)' ? best : lines[0]?.pv[0] ?? null });
    }
  }

  #onInfo(line) {
    if (!this.current) return;
    const tokens = line.split(/\s+/);
    let depth = 0;
    let multipv = 1;
    let cp = null;
    let mate = null;
    let pv = [];
    let inPv = false;
    const pvStart = tokens.indexOf('pv');
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (inPv) continue;
      if (token === 'depth') depth = Number(tokens[i + 1]) || depth;
      else if (token === 'multipv') multipv = Number(tokens[i + 1]) || multipv;
      else if (token === 'score') {
        if (tokens[i + 1] === 'cp') cp = Number(tokens[i + 2]);
        else if (tokens[i + 1] === 'mate') mate = Number(tokens[i + 2]);
      }
      if (token === 'pv') inPv = true;
    }
    if (pvStart > 0) pv = tokens.slice(pvStart + 1);
    if (!pv.length) return;
    const previous = this.current.lines.get(multipv);
    if (previous && previous.depth > depth) return;
    this.current.lines.set(multipv, { multipv, depth, cp, mate, pv });
  }

  /**
   * @param {string} fen position to analyse
   * @param {{depth?: number, multipv?: number}} options
   */
  analyze(fen, { depth = 14, multipv = 2 } = {}) {
    const run = async () => {
      await this.start();
      this.#write(`setoption name MultiPV value ${multipv}`);
      this.#write(`position fen ${fen}`);
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          try {
            this.#write('stop');
          } catch {
            /* ignore */
          }
          const lines = [...this.current?.lines.values()] ?? [];
          this.current = null;
          if (lines.length) {
            resolve({
              lines: lines.map((entry) => ({
                multipv: entry.multipv,
                depth: entry.depth,
                cp: entry.cp ?? null,
                mate: entry.mate ?? null,
                pv: entry.pv,
              })),
              bestmove: null,
            });
          } else {
            reject(new Error('Stockfish analysis timed out.'));
          }
        }, POSITION_TIMEOUT_MS);
        this.current = {
          lines: new Map(),
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        };
        this.#write(`go depth ${depth}`);
      });
      return { fen, ...result };
    };
    const task = this.queue.then(run, run);
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  async stop() {
    if (!this.proc) return;
    try {
      this.#write('quit');
    } catch {
      /* ignore */
    }
    this.proc = null;
    this.ready = false;
  }
}
