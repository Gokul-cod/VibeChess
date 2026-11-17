/**
 * Stockfish 19 (WASM, lite single-threaded build) running in a Web Worker.
 * Exposes the same `analyze()` contract as the Node UCI client so the shared
 * review pipeline in server/review.mjs can run in the browser unchanged.
 */

// BASE_URL keeps the worker (and the .wasm it loads next to itself) reachable
// when the app is served from a sub-path, as GitHub Pages project sites are.
const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

interface EngineLine {
  multipv: number;
  depth: number;
  cp: number | null;
  mate: number | null;
  pv: string[];
}

interface CurrentAnalysis {
  lines: Map<number, EngineLine>;
  resolve: (value: { lines: EngineLine[]; bestmove: string | null }) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export class WebEngine {
  name = 'Stockfish 19 (WASM)';
  ready = false;

  private worker: Worker | null = null;
  private startPromise: Promise<WebEngine> | null = null;
  private handshake: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private current: CurrentAnalysis | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;

  start(): Promise<WebEngine> {
    if (this.startPromise) return this.startPromise;
    this.stopped = false;
    this.startPromise = new Promise<WebEngine>((resolve, reject) => {
      const worker = new Worker(ENGINE_URL);
      this.worker = worker;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('The chess engine took too long to load.'));
      }, 60_000);

      worker.onmessage = (event: MessageEvent) => {
        const data = typeof event.data === 'string' ? event.data : event.data?.data;
        if (typeof data === 'string') this.onLine(data);
      };
      worker.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('The chess engine could not be loaded.'));
        }
      };

      this.handshake = {
        resolve: () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.ready = true;
          resolve(this);
        },
        reject: (error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      };
      this.post('uci');
    });
    return this.startPromise;
  }

  private post(command: string) {
    this.worker?.postMessage(command);
  }

  private onLine(line: string) {
    if (line.startsWith('id name ')) {
      const name = line.slice('id name '.length).trim();
      if (name) this.name = /wasm/i.test(name) ? name : `${name} (WASM)`;
      return;
    }
    if (line === 'uciok') {
      // The lite build is single-threaded; keep the hash small for browser memory.
      this.post('setoption name Threads value 1');
      this.post('setoption name Hash value 32');
      this.post('isready');
      return;
    }
    if (line === 'readyok') {
      const handshake = this.handshake;
      this.handshake = null;
      handshake?.resolve();
      return;
    }
    if (line.startsWith('info ') && this.current) this.parseInfo(line);
    if (line.startsWith('bestmove')) {
      const current = this.current;
      this.current = null;
      if (!current) return;
      if (current.timer) clearTimeout(current.timer);
      const best = line.split(/\s+/)[1];
      current.resolve({
        lines: [...current.lines.values()].sort((a, b) => a.multipv - b.multipv),
        bestmove: best && best !== '(none)' ? best : null,
      });
    }
  }

  private parseInfo(line: string) {
    const current = this.current;
    if (!current) return;
    const tokens = line.split(/\s+/);
    let depth = 0;
    let multipv = 1;
    let cp: number | null = null;
    let mate: number | null = null;
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === 'pv') break;
      if (token === 'depth') depth = Number(tokens[i + 1]) || depth;
      else if (token === 'multipv') multipv = Number(tokens[i + 1]) || multipv;
      else if (token === 'score') {
        if (tokens[i + 1] === 'cp') cp = Number(tokens[i + 2]);
        else if (tokens[i + 1] === 'mate') mate = Number(tokens[i + 2]);
      }
    }
    const pvStart = tokens.indexOf('pv');
    const pv = pvStart > 0 ? tokens.slice(pvStart + 1) : [];
    if (!pv.length) return;
    const previous = current.lines.get(multipv);
    if (previous && previous.depth > depth) return;
    current.lines.set(multipv, { multipv, depth, cp, mate, pv });
  }

  analyze(fen: string, { depth = 14, multipv = 2, movetime = 0 }: { depth?: number; multipv?: number; movetime?: number } = {}) {
    const run = async () => {
      if (this.stopped) throw new Error('Engine stopped.');
      await this.start();
      if (this.stopped) throw new Error('Engine stopped.');
      this.post(`setoption name MultiPV value ${multipv}`);
      this.post(`position fen ${fen}`);
      return new Promise<{ fen: string; lines: EngineLine[]; bestmove: string | null }>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.post('stop');
          const current = this.current;
          this.current = null;
          if (current && current.lines.size) {
            resolve({
              fen,
              lines: [...current.lines.values()].sort((a, b) => a.multipv - b.multipv),
              bestmove: null,
            });
          } else {
            reject(new Error('The engine did not answer in time.'));
          }
        }, 90_000);
        this.current = { lines: new Map(), resolve: (value) => resolve({ fen, ...value }), reject, timer };
        // A time budget keeps the long tail of slow positions predictable.
        this.post(`go depth ${depth}${movetime ? ` movetime ${Math.round(movetime)}` : ''}`);
      });
    };
    const task = this.queue.then(run, run);
    this.queue = task.catch(() => undefined);
    return task;
  }

  terminate() {
    this.stopped = true;
    this.ready = false;
    if (this.current) {
      if (this.current.timer) clearTimeout(this.current.timer);
      this.current.reject(new Error('Review cancelled.'));
      this.current = null;
    }
    this.worker?.terminate();
    this.worker = null;
    this.startPromise = null;
    this.handshake = null;
  }
}
