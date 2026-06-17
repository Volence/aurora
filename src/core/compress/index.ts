import { nemesisCompress, nemesisDecompress } from './nemesis';
import { kosinskiDecompress } from '../formats/kosinski';

export type CompressionKind = 'nemesis' | 'kosinski' | 'uncompressed';

export interface Codec {
  decompress(input: Uint8Array): Uint8Array;
  compress(input: Uint8Array): Uint8Array;
}

const identity = (x: Uint8Array): Uint8Array => x.slice();

/** Kosinski encode is only needed for LEVEL art (sprite art is Nemesis); it lands with the
 *  multi-game level-art spec. Decode exists today; encode throws until then. */
function kosinskiCompressNotYet(): Uint8Array {
  throw new Error('Kosinski compression is not implemented yet (planned with the multi-game level-art work)');
}

const CODECS: Record<CompressionKind, Codec> = {
  nemesis: { decompress: nemesisDecompress, compress: nemesisCompress },
  kosinski: { decompress: kosinskiDecompress, compress: kosinskiCompressNotYet },
  uncompressed: { decompress: identity, compress: identity },
};

/** Look up a compression codec by kind. Adapters reference compression by kind only. */
export function compressionFor(kind: CompressionKind): Codec {
  return CODECS[kind];
}
