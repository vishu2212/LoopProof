/**
 * Off-chain category catalog for LoopProof batches (`uint16` non-zero codes, 1..65535).
 * Mirrors `category_code` in `public.batches` and `uint16 category` in `LoopProofRegistry.sol`.
 * Per DECISIONS.md (D-06), AI classification is advisory only; a human registrar confirms the code.
 */
export type CategoryOption = {
  code: number;
  name: string;
  examples: string;
};

export const CATEGORY_OPTIONS: readonly CategoryOption[] = [
  {
    code: 101,
    name: "Small IT & telecommunication equipment",
    examples: "Laptops, tablets, routers, handsets",
  },
  {
    code: 102,
    name: "Lithium-ion battery packs & modules",
    examples: "Notebook battery packs, power-tool packs, UPS cells",
  },
  {
    code: 103,
    name: "Printed circuit board (PCB) assemblies",
    examples: "Motherboards, server backplanes, controller cards",
  },
  {
    code: 104,
    name: "Flat-panel displays & monitors",
    examples: "LCD/LED monitors, all-in-one display assemblies",
  },
  {
    code: 105,
    name: "Power supplies, chargers & cabling",
    examples: "SMPS units, AC adapters, copper harnesses",
  },
  {
    code: 106,
    name: "Enterprise servers & data-center hardware",
    examples: "Rack servers, switches, storage enclosures",
  },
  {
    code: 107,
    name: "Photovoltaic & power-electronics sub-assemblies",
    examples: "Inverters, charge controllers, junction boxes",
  },
] as const;

export function categoryLabel(code: number): string {
  const found = CATEGORY_OPTIONS.find((c) => c.code === code);
  return found ? `${found.name} (#${found.code})` : `Category #${code}`;
}

export function isValidCategoryCode(code: number): boolean {
  return Number.isInteger(code) && code >= 1 && code <= 65535;
}

/**
 * Off-chain recovered material fraction codes (`uint16` non-zero codes, 1..65535).
 * Mirrors `material_code` in `public.processing_outputs` and `OutputFraction.materialCode` in `LoopProofRegistry.sol`.
 */
export type MaterialOption = {
  code: number;
  name: string;
  description: string;
};

export const MATERIAL_OPTIONS: readonly MaterialOption[] = [
  {
    code: 201,
    name: "Copper & copper-alloy fraction",
    description: "Shredded or separated copper windings, busbars, and cabling",
  },
  {
    code: 202,
    name: "Aluminum enclosure & heatsink fraction",
    description: "Sorted non-ferrous aluminum housings, frames, and heatsinks",
  },
  {
    code: 203,
    name: "Ferrous steel chassis fraction",
    description: "Magnetic steel enclosures, fasteners, and brackets",
  },
  {
    code: 204,
    name: "Printed circuit board (precious-metal bearing) fraction",
    description: "Depopulated or populated PCB fraction for smelter refining",
  },
  {
    code: 205,
    name: "Lithium-ion cell / black-mass fraction",
    description: "Discharged battery modules or intermediate black-mass fraction",
  },
  {
    code: 206,
    name: "Clean engineering plastics (ABS/PC) fraction",
    description: "Sorted non-brominated polymer housings",
  },
  {
    code: 207,
    name: "Display glass & panel fraction",
    description: "Separated flat-panel glass and optical sheets",
  },
  {
    code: 299,
    name: "Controlled residual / non-recoverable fraction",
    description: "Process dust, mixed shredder residue, or hazardous fraction sent to authorized disposal",
  },
] as const;

export function materialLabel(code: number): string {
  const found = MATERIAL_OPTIONS.find((m) => m.code === code);
  return found ? `${found.name} (#${found.code})` : `Material code #${code}`;
}

export function isValidMaterialCode(code: number): boolean {
  return Number.isInteger(code) && code >= 1 && code <= 65535;
}

