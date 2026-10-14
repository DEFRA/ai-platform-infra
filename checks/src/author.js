const BOT_SUFFIX = '[bot]'
const BREAK_GLASS_APPROVALS = 2

/**
 * Decides whether a pull request author may change an environment's
 * folder: a writer App from the registry entry, or a platform engineer's
 * break-glass pull request with two approvals from other people.
 *
 * @param {object} input - Pull request facts.
 * @param {string} input.author - Pull request author login.
 * @param {object} input.entry - The registry entry.
 * @param {string[]} [input.labels] - Pull request labels.
 * @param {string[]} [input.approvers] - Logins that approved the head.
 * @returns {{allowed: boolean, writer: boolean, reason: string}} Decision.
 */
function checkAuthor({ author, entry, labels = [], approvers = [] }) {
  if (author.endsWith(BOT_SUFFIX)) {
    const slug = author.slice(0, -BOT_SUFFIX.length)

    if (entry.writers.includes(slug)) {
      return { allowed: true, writer: true, reason: `${slug} is a writer` }
    }

    return {
      allowed: false,
      writer: false,
      reason: `${slug} may not change ${entry.name}`
    }
  }

  const others = new Set(approvers.filter((login) => login !== author))

  if (labels.includes('break-glass') && others.size >= BREAK_GLASS_APPROVALS) {
    return { allowed: true, writer: false, reason: 'break-glass approved' }
  }

  return {
    allowed: false,
    writer: false,
    reason:
      'only a registry writer App, or a break-glass pull request with ' +
      `${BREAK_GLASS_APPROVALS} approvals from other people, may change ` +
      entry.name
  }
}

export { checkAuthor }
