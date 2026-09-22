/**
 * The slice of OPFS that `OpfsImageStore` actually uses, in memory.
 *
 * Node has no origin private file system, and driving a browser for every
 * assertion about retention and backup would make the suite too slow to run on
 * each save. So the store takes its directory handle by constructor and this
 * stands in for it here, while `e2e/opfs.spec.ts` proves the real thing works
 * in the browser the farmer will use.
 */
export class InMemoryDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly files = new Map<string, Uint8Array>();

  constructor(readonly name = 'images') {}

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!options?.create) {
        throw new DOMException(`${name} not found`, 'NotFoundError');
      }
      this.files.set(name, new Uint8Array());
    }
    return {
      kind: 'file' as const,
      name,
      createWritable: async () => {
        const chunks: Uint8Array[] = [];
        return {
          write: async (data: Uint8Array) => {
            chunks.push(new Uint8Array(data));
          },
          close: async () => {
            this.files.set(name, concat(chunks));
          },
        };
      },
      getFile: async () => {
        const bytes = this.files.get(name) ?? new Uint8Array();
        return {
          name,
          size: bytes.byteLength,
          arrayBuffer: async () => toArrayBuffer(bytes),
        };
      },
    };
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name)) {
      throw new DOMException(`${name} not found`, 'NotFoundError');
    }
  }

  async *keys(): AsyncIterableIterator<string> {
    for (const name of [...this.files.keys()]) {
      yield name;
    }
  }
}

/**
 * The double implements only what the store calls, so it is handed over as the
 * handle type rather than declared to be one.
 */
export const asDirectoryHandle = (fake: InMemoryDirectoryHandle): FileSystemDirectoryHandle =>
  fake as unknown as FileSystemDirectoryHandle;

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
