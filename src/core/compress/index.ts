import { nemesisCompress, nemesisDecompress } from './nemesis';
import { kosinskiDecompress, kosinskiModuledDecompress } from '../formats/kosinski';

export type CompressionKind = 'nemesis' | 'kosinski' | 'kosinski-moduled' | 'uncompressed';

export interface Codec {
  decompress(input: Uint8Array): Uint8Array;
  compress(input: Uint8Array): Uint8Array;
}

const identity = (x: Uint8Array): Uint8Array => x.slice();

/** Kosinski encode (plain + moduled) is deferred to the level-art work; decode exists
 *  today (S3K sprite art is often Kosinski-moduled). Encode throws until then. */
function notYet(kind: string): () => Uint8Array {
  return () => { throw new Error(`${kind} compression (encode) is not implemented yet`); };
}

const CODECS: Record<CompressionKind, Codec> = {
  nemesis: { decompress: nemesisDecompress, compress: nemesisCompress },
  kosinski: { decompress: kosinskiDecompress, compress: notYet('Kosinski') },
  'kosinski-moduled': { decompress: kosinskiModuledDecompress, compress: notYet('Kosinski-moduled') },
  uncompressed: { decompress: identity, compress: identity },
};

/** Look up a compression codec by kind. Adapters reference compression by kind only. */
export function compressionFor(kind: CompressionKind): Codec {
  return CODECS[kind];
}
