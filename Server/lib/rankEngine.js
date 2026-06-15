/**
 * rankEngine.js
 *
 * Pilot rank progression logic.
 * Checks XP thresholds and PSA requirements, applies rank-up,
 * and returns notification payloads.
 */

/**
 * Rank definitions.
 * skill_bonus: how much to subtract from base skill on promotion
 *   (rank I -> skill improves by 1, i.e. 4 -> 3)
 */
const RANK_TABLE = [
  { rank: 0, name: 'Starting Pilot', xp_required: 0,  psa_required: 0, psa_slots: 0 },
  { rank: 1, name: 'Rank I',         xp_required: 10, psa_required: 0, psa_slots: 2 },
  { rank: 2, name: 'Rank II',        xp_required: 25, psa_required: 1, psa_slots: 4 },
  { rank: 3, name: 'Rank III',       xp_required: 40, psa_required: 2, psa_slots: 6 },
  { rank: 4, name: 'Rank IV',        xp_required: 55, psa_required: 3, psa_slots: 7 },
];

const MAX_RANK = 4;

/**
 * Get the rank definition object for a given rank number.
 * @param {number} rank
 */
function getRankDef(rank) {
  return RANK_TABLE.find(r => r.rank === rank) || RANK_TABLE[0];
}

/**
 * Get the next rank definition, or null if already at max.
 * @param {number} currentRank
 */
function getNextRankDef(currentRank) {
  if (currentRank >= MAX_RANK) return null;
  return RANK_TABLE.find(r => r.rank === currentRank + 1) || null;
}

/**
 * Check whether a pilot is eligible for promotion to the next rank.
 *
 * @param {object} pilot - pilot record from DB
 * @returns {object} { eligible, reason, nextRank }
 */
function checkRankEligibility(pilot) {
  const nextRankDef = getNextRankDef(pilot.rank);

  if (!nextRankDef) {
    return { eligible: false, reason: 'Already at maximum rank', nextRank: null };
  }

  if (pilot.xp_total < nextRankDef.xp_required) {
    return {
      eligible: false,
      reason: `Needs ${nextRankDef.xp_required - pilot.xp_total} more XP`,
      nextRank: nextRankDef,
    };
  }

  if (pilot.psa_slots_used < nextRankDef.psa_required) {
    return {
      eligible: false,
      reason: `Must select ${nextRankDef.psa_required - pilot.psa_slots_used} more PSA(s) before promoting`,
      nextRank: nextRankDef,
    };
  }

  return { eligible: true, reason: null, nextRank: nextRankDef };
}

/**
 * Apply a rank promotion to a pilot object (in-memory — caller persists to DB).
 * Skill improves by 1 (skill number decreases) with each rank.
 * Minimum skill is 1.
 *
 * @param {object} pilot - current pilot record
 * @returns {object} updated pilot fields to apply
 */
function applyRankUp(pilot) {
  const nextRankDef = getNextRankDef(pilot.rank);
  if (!nextRankDef) throw new Error('Pilot is already at max rank');

  return {
    rank:                nextRankDef.rank,
    skill:               Math.max(1, pilot.skill - 1),
    psa_slots_available: nextRankDef.psa_slots,
    rank_up_pending:     1,  // triggers PSA selection modal on client
  };
}

/**
 * After awarding XP to a pilot, check if they now qualify for rank-up.
 * Returns the promotion payload if eligible, null otherwise.
 *
 * Callers should:
 *  1. Add XP to pilot.xp_total
 *  2. Call this function
 *  3. If result is not null, apply the rank-up update and create a notification
 *
 * @param {object} pilotAfterXP - pilot with updated xp_total
 * @returns {object|null} rank-up update payload, or null
 */
function checkAndPromote(pilotAfterXP) {
  const { eligible, nextRank } = checkRankEligibility(pilotAfterXP);
  if (!eligible) return null;
  return { ...applyRankUp(pilotAfterXP), nextRankDef: nextRank };
}

/**
 * Build a notification record for a rank promotion.
 *
 * @param {object} pilot     - pilot after promotion
 * @param {object} rankDef   - the new rank definition
 * @param {string} userId    - user_id of the pilot's owner
 * @returns {object} notification fields (caller provides id + created_at)
 */
function buildRankUpNotification(pilot, rankDef, userId) {
  const newSlots = rankDef.psa_slots - (getRankDef(pilot.rank - 1)?.psa_slots ?? 0);
  return {
    user_id:  userId,
    type:     'rank_up',
    title:    `${pilot.name} promoted to ${rankDef.name}!`,
    body:     `Skill improved to ${pilot.skill}. ${newSlots} new PSA slot(s) unlocked. Open your pilot to select abilities.`,
    pilot_id: pilot.id,
    read:     0,
  };
}

module.exports = {
  RANK_TABLE,
  MAX_RANK,
  getRankDef,
  getNextRankDef,
  checkRankEligibility,
  applyRankUp,
  checkAndPromote,
  buildRankUpNotification,
};
