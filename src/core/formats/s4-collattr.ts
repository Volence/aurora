// src/core/formats/s4-collattr.ts
// Editable collision attr-index plane (0-255 per tile) — its own file format so it
// never collides with the legacy crude .coll.bin. Identity bytes (like s4-collision).
export function parseCollAttr(data: Uint8Array): Uint8Array {
  return new Uint8Array(data);
}
export function serializeCollAttr(collisionEdit: Uint8Array): Uint8Array {
  return new Uint8Array(collisionEdit);
}
