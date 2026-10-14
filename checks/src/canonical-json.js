/**
 * Sorts object keys recursively so equal documents serialise to equal bytes.
 *
 * @param {unknown} value - Any JSON value.
 * @returns {unknown} The same value with every object's keys sorted.
 */
function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    )
  }

  return value
}

/**
 * The deterministic serialisation every machine-written file uses: keys
 * sorted at every level, two-space indent, LF line endings and one trailing
 * newline. The Portal API and the submit workflow must produce identical
 * bytes for the same document.
 *
 * @param {unknown} value - The document to serialise.
 * @returns {string} The canonical JSON text.
 */
function canonicalJson(value) {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`
}

/**
 * Whether a file's text is already in canonical form.
 *
 * @param {string} text - The file contents.
 * @returns {boolean} True when re-serialising changes nothing.
 */
function isCanonical(text) {
  try {
    return canonicalJson(JSON.parse(text)) === text
  } catch {
    return false
  }
}

export { canonicalJson, isCanonical, sortKeys }
