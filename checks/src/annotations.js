// Escaping as the Actions toolkit applies it (actions/toolkit,
// packages/core/src/command.ts), so a file name or message taken from a pull
// request cannot end the command early and inject another.
function escapeData(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
}

function escapeProperty(value) {
  return escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C')
}

/**
 * A GitHub Actions `error` workflow command for one problem.
 *
 * @param {string} file - Path the problem is in.
 * @param {string} message - What is wrong.
 * @returns {string} The command line, ending in a newline.
 */
function errorAnnotation(file, message) {
  return `::error file=${escapeProperty(file)}::${escapeData(message)}\n`
}

/**
 * A GitHub Actions `notice` workflow command for something accepted but
 * worth a look.
 *
 * @param {string} file - Path the notice is about.
 * @param {string} message - What a person should know.
 * @returns {string} The command line, ending in a newline.
 */
function noticeAnnotation(file, message) {
  return `::notice file=${escapeProperty(file)}::${escapeData(message)}\n`
}

export { errorAnnotation, noticeAnnotation }
