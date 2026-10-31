import { Writable } from "node:stream";

/** In-memory log destination: collects the JSON lines pino writes. */
export class LogSink extends Writable {
  private chunks: string[] = [];

  override _write(chunk: Buffer | string, _encoding: string, callback: () => void) {
    this.chunks.push(chunk.toString());
    callback();
  }

  raw(): string {
    return this.chunks.join("");
  }

  lines(): Record<string, any>[] {
    return this.raw()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  clear() {
    this.chunks = [];
  }
}
