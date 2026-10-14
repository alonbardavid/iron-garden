// Git's pkt-line framing: a four-hex-digit length that counts itself, then
// the payload. 0000 is a flush packet and carries none.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const FLUSH = encoder.encode("0000");

export function pktLine(payload: string): Uint8Array {
  const bytes = encoder.encode(payload);
  const length = (bytes.length + 4).toString(16).padStart(4, "0");
  return concat([encoder.encode(length), bytes]);
}

// Reads pkt-lines off a byte stream as they arrive, so a packfile carried in
// them never has to be held whole.
export class PktReader {
  private buffer: Uint8Array = new Uint8Array(0);
  private done = false;

  constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
  ) {}

  // The next payload, "flush" for a flush packet, or null at the end.
  async read(): Promise<Uint8Array | "flush" | null> {
    if (!(await this.fill(4))) {
      return null;
    }
    const length = parseInt(decoder.decode(this.buffer.subarray(0, 4)), 16);
    if (Number.isNaN(length)) {
      throw new Error("Malformed pkt-line from git server");
    }
    if (length < 4) {
      this.buffer = this.buffer.subarray(4);
      return "flush";
    }
    if (!(await this.fill(length))) {
      throw new Error("Git server ended mid pkt-line");
    }
    const payload = this.buffer.slice(4, length);
    this.buffer = this.buffer.subarray(length);
    return payload;
  }

  // Whatever follows the pkt-lines read so far, unframed.
  async *rest(): AsyncGenerator<Uint8Array> {
    if (this.buffer.length) {
      yield this.buffer;
      this.buffer = new Uint8Array(0);
    }
    while (!this.done) {
      const { value, done } = await this.reader.read();
      if (done) {
        this.done = true;
      } else if (value.length) {
        yield value;
      }
    }
  }

  async cancel(): Promise<void> {
    await this.reader.cancel().catch(() => undefined);
  }

  private async fill(bytes: number): Promise<boolean> {
    while (this.buffer.length < bytes && !this.done) {
      const { value, done } = await this.reader.read();
      if (done) {
        this.done = true;
      } else {
        this.buffer = concat([this.buffer, value]);
      }
    }
    return this.buffer.length >= bytes;
  }
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function lineText(payload: Uint8Array): string {
  return decoder.decode(payload).replace(/\n$/, "");
}
