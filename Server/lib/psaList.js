/**
 * psaList.js
 *
 * Fixed list of Pilot Special Abilities (PSAs) from the Alpha Strike
 * Campaign rulebook. Seeded into psa_definitions table on first run.
 *
 * min_rank: minimum campaign rank required to select this PSA.
 */

const PSA_LIST = [
  // ── Rank I available ──────────────────────────────────────────
  {
    id:          'psa-01',
    name:        'Ace Pilot',
    description: 'Once per game, this pilot may re-roll any one to-hit roll.',
    min_rank:    1,
  },
  {
    id:          'psa-02',
    name:        'Weapon Specialist',
    description: 'The pilot receives +1 damage with one weapon type chosen at selection.',
    min_rank:    1,
  },
  {
    id:          'psa-03',
    name:        'Maneuvering Ace',
    description: 'The pilot may add +1 to their TMM once per turn.',
    min_rank:    1,
  },
  {
    id:          'psa-04',
    name:        'Lucky',
    description: 'Once per game, this pilot may ignore one critical hit result.',
    min_rank:    1,
  },
  {
    id:          'psa-05',
    name:        'Jumping Jack',
    description: 'This pilot does not suffer the +1 to-hit penalty when jumping.',
    min_rank:    1,
  },
  {
    id:          'psa-06',
    name:        'Speed Demon',
    description: 'This pilot\'s unit moves as if its Move value is 2 higher for TMM purposes.',
    min_rank:    1,
  },
  // ── Rank II available ─────────────────────────────────────────
  {
    id:          'psa-07',
    name:        'Sharpshooter',
    description: 'This pilot ignores the range penalty when firing at long range.',
    min_rank:    2,
  },
  {
    id:          'psa-08',
    name:        'Brawler',
    description: 'This pilot adds +1 damage to all physical/melee attacks.',
    min_rank:    2,
  },
  {
    id:          'psa-09',
    name:        'Tactical Genius',
    description: 'Once per game, this pilot may activate out of initiative order.',
    min_rank:    2,
  },
  {
    id:          'psa-10',
    name:        'Iron Will',
    description: 'This pilot unit may continue to operate normally even when structure is breached (ignore first critical effect).',
    min_rank:    2,
  },
  {
    id:          'psa-11',
    name:        'Scout',
    description: 'This pilot\'s unit may spot for indirect fire without a to-hit penalty.',
    min_rank:    2,
  },
  {
    id:          'psa-12',
    name:        'Suppressive Fire',
    description: 'Once per turn, this pilot may force a target to pass a morale check or fall back.',
    min_rank:    2,
  },
  // ── Rank III available ────────────────────────────────────────
  {
    id:          'psa-13',
    name:        'Marksman',
    description: 'This pilot may add +1 to damage on a called shot once per game.',
    min_rank:    3,
  },
  {
    id:          'psa-14',
    name:        'Juggernaut',
    description: 'This pilot\'s unit ignores difficult terrain movement penalties.',
    min_rank:    3,
  },
  {
    id:          'psa-15',
    name:        'Combat Intuition',
    description: 'This pilot may never be surprised and always acts first in initiative ties.',
    min_rank:    3,
  },
  {
    id:          'psa-16',
    name:        'Natural Aptitude (Gunnery)',
    description: 'Reduce this pilot\'s gunnery skill by 1 (minimum 1) for all ranged attacks.',
    min_rank:    3,
  },
  {
    id:          'psa-17',
    name:        'Natural Aptitude (Piloting)',
    description: 'Reduce this pilot\'s piloting skill by 1 (minimum 1) for all movement checks.',
    min_rank:    3,
  },
  // ── Rank IV available ─────────────────────────────────────────
  {
    id:          'psa-18',
    name:        'Elite Pilot',
    description: 'This pilot may re-roll one die result of any type once per game.',
    min_rank:    4,
  },
  {
    id:          'psa-19',
    name:        'Legendary',
    description: 'Friendly units within 6 inches of this pilot gain +1 morale.',
    min_rank:    4,
  },
  {
    id:          'psa-20',
    name:        'Death from Above',
    description: 'This pilot may perform a Death from Above attack once per game without the normal prerequisites.',
    min_rank:    4,
  },
];

module.exports = { PSA_LIST };
