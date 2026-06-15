/**
 * repairCalculator.js
 *
 * All financial formulas for units:
 *   - per-type repair cost per pip
 *   - total current repair cost
 *   - sale value (7-step formula)
 *   - salvage value  (base_pv - total_repair_cost, min 1)
 */

/**
 * Calculate the repair cost per pip for each damage type.
 * All results rounded to nearest integer.
 *
 * @param {number} basePv        - Unit's default point value
 * @param {number} armorMax      - Total armor pips
 * @returns {object} costPerPip  - Cost per single damaged pip of each type
 */
function calcCostPerPip(basePv, armorMax) {
  return {
    armor:     Math.round((basePv / 4) / armorMax),
    structure: Math.round((basePv / 2) / armorMax),  // denominator is armor, per spec
    engine:    Math.round(basePv / 2),                // per hit (max 2)
    fcu:       Math.round(basePv / 4),                // per hit (max 4)
    mp:        Math.round(basePv / 4),                // per hit (max 4 or 5)
    weapon:    Math.round(basePv / 4),                // per hit (max 4)
  };
}

/**
 * Calculate the total repair cost given the unit's current damage state.
 *
 * @param {object} unit - unit record with base_pv, armor_max, and all _dmg fields
 * @returns {number} totalRepairCost
 */
function calcRepairCost(unit) {
  const cpp = calcCostPerPip(unit.base_pv, unit.armor_max);
  return (
    (unit.armor_dmg     * cpp.armor)     +
    (unit.structure_dmg * cpp.structure) +
    (unit.engine_dmg    * cpp.engine)    +
    (unit.fcu_dmg       * cpp.fcu)       +
    (unit.mp_dmg        * cpp.mp)        +
    (unit.weapon_dmg    * cpp.weapon)
  );
}

/**
 * Calculate the repair cost as if ALL pips were damaged (fully destroyed unit).
 * Used as the basis for the sale value formula.
 *
 * @param {object} unit
 * @returns {number} totalFullRepairCost
 */
function calcFullRepairCost(unit) {
  const cpp = calcCostPerPip(unit.base_pv, unit.armor_max);
  return (
    (unit.armor_max         * cpp.armor)     +
    (unit.structure_max     * cpp.structure) +
    (unit.engine_hits_max   * cpp.engine)    +
    (unit.fcu_hits_max      * cpp.fcu)       +
    (unit.mp_hits_max       * cpp.mp)        +
    (unit.weapon_hits_max   * cpp.weapon)
  );
}

/**
 * Calculate the sale value of a unit using the full 7-step formula.
 * Minimum sale value is always 1.
 *
 * Steps (per pip type, then summed):
 *  1. Total Repair Cost = full repair cost (all pips damaged)
 *  2. Parts Total = sum of all max pips across all types
 *  3. Parts Percentage = Parts Total / Total Repair Cost  (rounded)
 *  4. Part Value = cost per pip for each type
 *  5. Intact Parts = max pips - damaged pips (per type)
 *  6. Intact Value = Part Value * Intact Parts  (per type)
 *  7. Salvage Penalty = Intact Value * Parts Percentage  (per type)
 *  8. Weight Penalty = Intact Value * weight%  (10% all types, 50% engine)
 *  9. Intact Result = Intact Value - (Salvage Penalty + Weight Penalty)  (per type)
 * 10. Sales Value = max(1, sum(all Intact Results) * Parts Percentage)
 *
 * @param {object} unit
 * @returns {object} { saleValue, breakdown }
 */
function calcSaleValue(unit) {
  const cpp        = calcCostPerPip(unit.base_pv, unit.armor_max);
  const fullRepair = calcFullRepairCost(unit);

  const partsTotal =
    unit.armor_max       +
    unit.structure_max   +
    unit.engine_hits_max +
    unit.fcu_hits_max    +
    unit.mp_hits_max     +
    unit.weapon_hits_max;

  const partsPct = partsTotal / fullRepair;  // rounded per spec

  const WEIGHT = {
    armor:     0.10,
    structure: 0.10,
    engine:    0.50,
    fcu:       0.10,
    mp:        0.10,
    weapon:    0.10,
  };

  const types = ['armor','structure','engine','fcu','mp','weapon'];
  const maxMap = {
    armor:     unit.armor_max,
    structure: unit.structure_max,
    engine:    unit.engine_hits_max,
    fcu:       unit.fcu_hits_max,
    mp:        unit.mp_hits_max,
    weapon:    unit.weapon_hits_max,
  };
  const dmgMap = {
    armor:     unit.armor_dmg,
    structure: unit.structure_dmg,
    engine:    unit.engine_dmg,
    fcu:       unit.fcu_dmg,
    mp:        unit.mp_dmg,
    weapon:    unit.weapon_dmg,
  };

  const breakdown = {};
  let totalIntactResult = 0;

  for (const t of types) {
    const partValue     = cpp[t];
    const intactParts   = maxMap[t] - dmgMap[t];
    const intactValue   = partValue * intactParts;
    const salvagePen    = intactValue * partsPct;
    const weightPen     = intactValue * WEIGHT[t];
    const intactResult  = intactValue - (salvagePen + weightPen);

    breakdown[t] = {
      partValue,
      maxPips:      maxMap[t],
      damagedPips:  dmgMap[t],
      intactParts,
      intactValue,
      salvagePenalty: salvagePen,
      weightPenalty:  weightPen,
      intactResult,
    };

    totalIntactResult += intactResult;
  }

  const rawSaleValue = totalIntactResult * partsPct;
  const saleValue    = Math.max(1, Math.round(rawSaleValue));

  return {
    saleValue,
    partsPct: Math.round(partsPct * 10000) / 10000,  // 4dp for display
    partsTotal,
    fullRepairCost: fullRepair,
    breakdown,
  };
}

/**
 * Calculate the salvage value when claiming an enemy unit.
 * salvage_value = base_pv - current_repair_cost, minimum 1
 *
 * @param {object} unit - enemy unit with current damage applied
 * @returns {number} salvageValue
 */
function calcSalvageValue(unit) {
  const repairCost = calcRepairCost(unit);
  return Math.max(1, unit.base_pv - repairCost);
}

/**
 * Derive pip counts from Jeff's tool boolean arrays.
 * Jeff stores damage as boolean arrays where true = damaged pip.
 *
 * @param {boolean[]} arr
 * @returns {number} count of true values
 */
function countDamaged(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.filter(Boolean).length;
}

module.exports = {
  calcCostPerPip,
  calcRepairCost,
  calcFullRepairCost,
  calcSaleValue,
  calcSalvageValue,
  countDamaged,
};
