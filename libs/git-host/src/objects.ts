import { concat } from "./pkt-line";

// Writing git objects of our own: the commits a merge makes, and the pack
// that carries them to a receive-pack.

const encoder = new TextEncoder();

export interface Signature {
  name: string;
  email: string;
  at: Date;
}

export interface CommitInput {
  tree: string;
  parents: string[];
  author: Signature;
  committer: Signature;
  message: string;
}

export interface GitObject {
  type: "commit";
  sha: string;
  // The object's content, without git's `<type> <size>\0` header.
  body: Uint8Array;
}

export async function commitObject(input: CommitInput): Promise<GitObject> {
  const lines = [
    `tree ${input.tree}`,
    ...input.parents.map((parent) => `parent ${parent}`),
    `author ${signatureLine(input.author)}`,
    `committer ${signatureLine(input.committer)}`,
    "",
    input.message.trimEnd(),
    "",
  ];
  const body = encoder.encode(lines.join("\n"));
  const header = encoder.encode(`commit ${body.length}\0`);
  return { type: "commit", sha: hex(await sha1(concat([header, body]))), body };
}

// A version 2 pack of the objects, whole (no deltas), with its checksum.
export async function packOf(objects: GitObject[]): Promise<Uint8Array> {
  const header = new Uint8Array(12);
  header.set(encoder.encode("PACK"));
  const view = new DataView(header.buffer);
  view.setUint32(4, 2);
  view.setUint32(8, objects.length);
  const entries = await Promise.all(objects.map(packEntry));
  const content = concat([header, ...entries]);
  return concat([content, await sha1(content)]);
}

const TYPE_CODES = { commit: 1 } as const;

async function packEntry(object: GitObject): Promise<Uint8Array> {
  return concat([
    entryHeader(TYPE_CODES[object.type], object.body.length),
    await deflate(object.body),
  ]);
}

// Type and size: the first byte holds the type and the size's low four bits,
// then seven bits a byte, the high bit saying another byte follows.
function entryHeader(type: number, size: number): Uint8Array {
  const bytes = [(type << 4) | (size & 0x0f)];
  let rest = size >>> 4;
  while (rest > 0) {
    bytes[bytes.length - 1]! |= 0x80;
    bytes.push(rest & 0x7f);
    rest >>>= 7;
  }
  return new Uint8Array(bytes);
}

// Names and emails cannot carry the characters that delimit them.
function signatureLine({ name, email, at }: Signature): string {
  const clean = (value: string) => value.replace(/[<>\n]/g, "").trim();
  return `${clean(name)} <${clean(email)}> ${Math.floor(at.getTime() / 1000)} +0000`;
}

// zlib, as git stores objects ("deflate" in CompressionStream is zlib-wrapped).
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function sha1(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
