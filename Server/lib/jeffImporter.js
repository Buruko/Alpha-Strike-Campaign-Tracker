/**
 * jeffImporter.js
 *
 * Parses JSON exports from Jeff's Battletech tool into the
 * alpha-strike-tracker enemy_unit schema.
 *
 * Supports both favoriteASGroups and currentASForce.groups structures —
 * both use identical member schemas.
 *
 * Jeff's boolean arrays:
 *   currentArmor[]        — length = armor_max, true = pip damaged
 *   currentStructure[]    — length = structure_max
 *   engineHits[]          — length 2
 *   fireControlHits[]     — length 4
 *   mpControlHits[]       — length 4 or 5
 *   weaponHits[]          — length 4
 *
 * roundArmor/roundStructure etc. are per-round overlays — ignored on import.
 */

const { countDamaged } = require('./repairCalculator');

/**
 * Map Jeff's unit type strings to our internal types.
 */
const TYPE_MAP = {
  BM: 'BM',   // BattleMech
  CV: 'CV',   // Combat Vehicle
  CF: 'CF',   // Conventional Fighter / Aerospace
  AF: 'CF',   // Aerospace Fighter (alternate label)
  BA: 'BA',   // Battle Armor
  CI: 'CI',   // Conventional Infantry
  PM: 'BM',   // ProtoMech — treat as Mech for XP purposes
};

/**
 * Parse a single unit member object from Jeff's JSON.
 *
 * @param {object} member   - unit member from Jeff's tool
 * @param {string} groupName - lance/group label
 * @param {string} sessionId - session this import is being attached to
 * @returns {object} enemy_unit record (without id, created_at — caller adds those)
 */
function parseMember(member, groupName, sessionId) {
  const armorMax     = member.armor       ?? member.currentArmor?.length     ?? 0;
  const structureMax = member.structure   ?? member.currentStructure?.length  ?? 0;
  const engineMax    = member.engineHits?.length      ?? 2;
  const fcuMax       = member.fireControlHits?.length ?? 4;
  const mpMax        = member.mpControlHits?.length   ?? 4;
  const weaponMax    = member.weaponHits?.length       ?? 4;

  // Damage counts from current boolean arrays
  const armorDmg    = countDamaged(member.currentArmor);
  const structDmg   = countDamaged(member.currentStructure);
  const engineDmg   = countDamaged(member.engineHits);
  const fcuDmg      = countDamaged(member.fireControlHits);
  const mpDmg       = countDamaged(member.mpControlHits);
  const weaponDmg   = countDamaged(member.weaponHits);

  const unitType    = TYPE_MAP[member.type] || 'BM';
  const pilotSkill  = member.pilot?.gunnery ?? member.currentSkill ?? 4;

  // Build display name
  const displayName = member.customName?.trim()
    ? member.customName.trim()
    : [member.name, member.variant].filter(Boolean).join(' ');

  return {
    session_id:         sessionId,
    jeff_uuid:          member.uuid ?? null,
    name:               displayName,
    variant:            member.variant ?? null,
    unit_type:          unitType,
    size:               member.size ?? 1,
    base_pv:            member.basePoints ?? 0,
    tonnage:            member.tonnage ?? null,
    role:               member.role ?? null,
    tmm:                member.tmm ?? 0,
    pilot_skill:        pilotSkill,
    armor_max:          armorMax,
    structure_max:      structureMax,
    engine_hits_max:    engineMax,
    fcu_hits_max:       fcuMax,
    mp_hits_max:        mpMax,
    weapon_hits_max:    weaponMax,
    armor_dmg:          armorDmg,
    structure_dmg:      structDmg,
    engine_dmg:         engineDmg,
    fcu_dmg:            fcuDmg,
    mp_dmg:             mpDmg,
    weapon_dmg:         weaponDmg,
    status:             'active',
    kill_credit_pilot_id: null,
    abilities:          JSON.stringify(member.abilities ?? []),
    move_data:          JSON.stringify(member.move ?? []),
    image_url:          member.imageURL ?? null,
    group_name:         groupName,
  };
}

/**
 * Extract all groups from a Jeff JSON export.
 * Checks favoriteASGroups first, then currentASForce.groups.
 *
 * @param {object} json - parsed JSON from Jeff's tool
 * @returns {Array<{name, members}>}
 */
function extractGroups(json) {
  if (json.favoriteASGroups?.length) {
    return json.favoriteASGroups.map(g => ({
      name:    g.name ?? g.groupLabel ?? 'Unnamed Lance',
      members: g.members ?? [],
    }));
  }
  if (json.currentASForce?.groups?.length) {
    return json.currentASForce.groups.map(g => ({
      name:    g.name ?? g.groupLabel ?? 'Unnamed Lance',
      members: g.members ?? [],
    }));
  }
  return [];
}

/**
 * Parse an entire Jeff JSON export into an array of enemy_unit records.
 *
 * @param {object|string} input   - raw JSON object or string
 * @param {string}        sessionId
 * @returns {object} { units: enemy_unit[], groups: string[], errors: string[] }
 */
function parseJeffExport(input, sessionId) {
  const errors = [];
  let json;

  try {
    json = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (e) {
    return { units: [], groups: [], errors: ['Invalid JSON: ' + e.message] };
  }

  const groups = extractGroups(json);
  if (!groups.length) {
    return {
      units:  [],
      groups: [],
      errors: ['No unit groups found. Expected favoriteASGroups or currentASForce.groups.'],
    };
  }

  const units      = [];
  const groupNames = [];

  for (const group of groups) {
    groupNames.push(group.name);
    for (const member of group.members) {
      try {
        const unit = parseMember(member, group.name, sessionId);
        units.push(unit);
      } catch (e) {
        errors.push(`Failed to parse unit "${member.name ?? 'unknown'}": ${e.message}`);
      }
    }
  }

  return { units, groups: groupNames, errors };
}

/**
 * Preview import without a session ID — useful for showing the
 * unit list to the GM before confirming the import.
 *
 * @param {object|string} input
 * @returns {object} { units, groups, errors }
 */
function previewJeffExport(input) {
  return parseJeffExport(input, '__preview__');
}

module.exports = {
  parseJeffExport,
  previewJeffExport,
  parseMember,
  extractGroups,
};
