import { nemesisCompress, nemesisDecompress } from './nemesis';
import {
  kosinskiDecompress, kosinskiCompress,
  kosinskiModuledDecompress, kosinskiModuledCompress,
} from '../formats/kosinski';

export type CompressionKind = 'nemesis' | 'kosinski' | 'kosinski-moduled' | 'uncompressed';

export interface Codec {
  decompress(input: Uint8Array): Uint8Array;
  compress(input: Uint8Array): Uint8Array;
}

const identity = (x: Uint8Array): Uint8Array => x.slice();

const CODECS: Record<CompressionKind, Codec> = {
  nemesis: { decompress: nemesisDecompress, compress: nemesisCompress },
  kosinski: { decompress: kosinskiDecompress, compress: kosinskiCompress },
  'kosinski-moduled': { decompress: kosinskiModuledDecompress, compress: kosinskiModuledCompress },
  uncompressed: { decompress: identity, compress: identity },
};

/** Look up a compression codec by kind. Adapters reference compression by kind only. */
export function compressionFor(kind: CompressionKind): Codec {
  return CODECS[kind];
}
