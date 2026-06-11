/**
 * Parse SonLVL object definitions INI + XML to extract
 * object type → name + default sprite image path.
 */

export interface ObjectDef {
  id: number;
  name: string;
  imagePath: string | null;  // relative to project basePath
  offsetX: number;           // sprite draw offset
  offsetY: number;
}

/**
 * Parse s2obj.ini to get object ID → name + xmlfile mapping.
 */
export function parseObjectDefsIni(iniContent: string): Map<number, { name: string; xmlFile: string }> {
  const result = new Map<number, { name: string; xmlFile: string }>();
  const lines = iniContent.split(/\r?\n/);

  let currentId: number | null = null;
  let currentName = '';
  let currentXml = '';

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[([0-9A-Fa-f]{2})\]$/);
    if (sectionMatch) {
      // Save previous
      if (currentId !== null && currentXml) {
        result.set(currentId, { name: currentName, xmlFile: currentXml });
      }
      currentId = parseInt(sectionMatch[1], 16);
      currentName = '';
      currentXml = '';
      continue;
    }

    // Skip Sprite sections
    if (trimmed.match(/^\[Sprite\d+\]$/)) {
      currentId = null;
      continue;
    }

    if (currentId === null) continue;

    const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim().toLowerCase();
      const value = kvMatch[2].trim();
      if (key === 'name') currentName = value;
      if (key === 'xmlfile') currentXml = value;
    }
  }

  // Save last
  if (currentId !== null && currentXml) {
    result.set(currentId, { name: currentName, xmlFile: currentXml });
  }

  return result;
}

/**
 * Parse an object definition XML to extract the default image path.
 * We use simple regex instead of a full XML parser.
 */
export function parseObjectDefXml(xmlContent: string): { imagePath: string | null; offsetX: number; offsetY: number } {
  // Find the default image ID from ObjDef Image attribute
  const objDefMatch = xmlContent.match(/Image="(\w+)"/);
  const defaultImageId = objDefMatch?.[1] || 'Image1';

  // Find the filename for that image ID
  const imagePattern = new RegExp(`id="${defaultImageId}"[^>]*filename="([^"]+)"`, 'i');
  const imageMatch = xmlContent.match(imagePattern);
  const imagePath = imageMatch?.[1]?.replace(/\\\\/g, '/').replace(/\\/g, '/') || null;

  // Try to find offset from Display section
  let offsetX = 0;
  let offsetY = 0;
  const offsetMatch = xmlContent.match(/<Offset\s+X="(-?\d+)"\s+Y="(-?\d+)"/);
  if (offsetMatch) {
    offsetX = parseInt(offsetMatch[1], 10);
    offsetY = parseInt(offsetMatch[2], 10);
  }

  return { imagePath, offsetX, offsetY };
}
