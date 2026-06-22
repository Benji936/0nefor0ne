/**
 * parseYdk(text)
 *
 * Parses a YDK deck file text into structured sections.
 *
 * @param {string} text - Raw contents of a .ydk file
 * @returns {{ main: Array<{id: number, qty: number}>, extra: Array<{id: number, qty: number}>, side: Array<{id: number, qty: number}> }}
 */
export function parseYdk(text) {
  const result = {
    main: [],
    extra: [],
    side: [],
  }

  if (!text || typeof text !== 'string') {
    return result
  }

  // Accumulate counts per section using Maps keyed by passcode id
  const counts = {
    main: new Map(),
    extra: new Map(),
    side: new Map(),
  }

  let currentSection = 'main'

  const lines = text.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Skip blank lines
    if (line === '') continue

    // Section markers
    if (line === '#main') {
      currentSection = 'main'
      continue
    }
    if (line === '#extra') {
      currentSection = 'extra'
      continue
    }
    if (line === '!side') {
      currentSection = 'side'
      continue
    }

    // Skip comment lines (lines starting with '#' that are NOT section markers)
    if (line.startsWith('#')) continue

    // Skip lines starting with '!' that are NOT the side marker
    if (line.startsWith('!')) continue

    // Try to parse as a numeric passcode
    const id = parseInt(line, 10)

    // Skip non-numeric or NaN entries gracefully
    if (isNaN(id) || String(id) !== line.replace(/^\s+|\s+$/g, '')) {
      // Allow lines that are purely numeric (possibly with leading zeros ignored by parseInt)
      // More robust check: every character must be a digit
      if (!/^\d+$/.test(line)) continue
    }

    // Re-parse ensuring we only accept all-digit lines
    if (!/^\d+$/.test(line)) continue

    const numId = parseInt(line, 10)
    const map = counts[currentSection]
    map.set(numId, (map.get(numId) || 0) + 1)
  }

  // Convert Maps to arrays of {id, qty}
  for (const section of ['main', 'extra', 'side']) {
    for (const [id, qty] of counts[section]) {
      result[section].push({ id, qty })
    }
  }

  return result
}
