/**
 * xpCalculator.js
 *
 * Kill XP formula with unit type/size base values and disparity multiplier.
 */

/**
 * Base XP table keyed by [unitType][size].
 * Unit types: Infantry (CI), Battle Armor (BA), Vehicle (CV),
 *             Aerospace (CF), Mech (BM)
 * x = not applicable for that type/size combo.
 */
const BASE_XP = {
  CI: { 1: 1 },
  BA: { 1: 1 },
  CV: { 1: 2, 2: 3, 3: 5, 4: 6, 5: 10 },
  CF: { 1: 2, 2: 5, 3: 7, 4: 9, 5: 15 },
  BM: { 1: 3, 2: 6, 3: 9, 4: 12, 5: 20 },
};

/**
 * Disparity multiplier table.
 * Disparity = playerPilotSkill - enemyPilotSkill
 * NOTE: Lower skill number = better pilot in Alpha Strike.
 * A positive disparity means the player pilot has a HIGHER (worse) skill number
 * than the enemy, so they earn more XP for beating a better opponent.
 */
const DISPARITY_MULTIPLIER = [
  { threshold: 3,  multiplier: 2.00 },
  { threshold: 2,  multiplier: 1.66 },
  { threshold: 1,  multiplier: 1.33 },
  { threshold: 0,  multiplier: 1.00 },
  { threshold: -1, multiplier: 0.75 },
  { threshold: -2, multiplier: 0.50 },
];
const MIN_MULTIPLIER = 0.25;

/**
 * Get the disparity multiplier for a given skill difference.
 * @param {number} disparity - playerSkill - enemySkill
 * @returns {number} multiplier
 */
function getDisparityMultiplier(disparity) {
  for (const entry of DISPARITY_MULTIPLIER) {
    if (disparity >= entry.threshold) return entry.multiplier;
  }
  return MIN_MULTIPLIER;
}

/**
 * Calculate kill XP award.
 *
 * Steps:
 *  1. Look up base XP from unit type and size
 *  2. Disparity = playerSkill - enemySkill
 *  3. If disparity !== 0, apply multiplier
 *  4. Round result
 *
 * @param {string}  unitType    - BM, CV, CF, BA, CI
 * @param {number}  unitSize    - 1-5 (5+ treated as 5)
 * @param {number}  playerSkill - player pilot's current skill
 * @param {number}  enemySkill  - enemy pilot skill
 * @returns {object} { xp, baseXp, multiplier, disparity }
 */
function calcKillXP(unitType, unitSize, playerSkill, enemySkill) {
  const typeMap = BASE_XP[unitType] || BASE_XP['BM'];
  const sizeKey = Math.min(unitSize, 5);
  const baseXp  = typeMap[sizeKey] ?? typeMap[Math.max(...Object.keys(typeMap).map(Number))];

  if (baseXp === undefined) {
    throw new Error(`No base XP for type=${unitType} size=${unitSize}`);
  }

  const disparity   = playerSkill - enemySkill;
  const multiplier  = getDisparityMultiplier(disparity);
  const xp          = Math.round(baseXp * multiplier);

  return { xp, baseXp, multiplier, disparity };
}

/**
 * XP values for damage events (not kills).
 */
const DAMAGE_XP = {
  damage_tac:      2,  // Total Armor Clear
  damage_critical: 1,
  damage_melee:    1,
};

module.exports = {
  calcKillXP,
  getDisparityMultiplier,
  DAMAGE_XP,
  BASE_XP,
};
