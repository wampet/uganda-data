// Merchandise trade (US$ million), 1996 to date. Build time only.
import tradeJson from '../data/trade.json';

interface Src { title: string; url: string; updated: string | null }
interface Named { name: string; values: number[] }

const raw = tradeJson as unknown as {
  sources: Record<'monthly' | 'export_products' | 'import_products' | 'destinations' | 'origins', Src>;
  monthly: { months: string[]; exports: number[]; imports: number[] };
  annual: {
    years: number[];
    exports: number[]; imports: number[];
    exports_ex_gold: number[]; imports_ex_gold: number[];
    gold_exports: number[]; gold_imports: number[];
  };
  export_products: Named[];
  import_products: Named[];
  destinations: Named[];
  origins: Named[];
  export_regions: Named[];
  import_regions: Named[];
  notes: string[];
};

export const sources = raw.sources;
export const monthly = raw.monthly;
export const annual = raw.annual;
export const notes = raw.notes;
export const { export_products, import_products, destinations, origins, export_regions, import_regions } = raw;

const L = annual.years.length - 1;
export const year = annual.years[L];
export const prevYear = annual.years[L - 1];
export const latest = {
  exports: annual.exports[L],
  imports: annual.imports[L],
  balance: annual.exports[L] - annual.imports[L],
  exportsExGold: annual.exports_ex_gold[L],
  importsExGold: annual.imports_ex_gold[L],
  goldShare: (100 * annual.gold_exports[L]) / annual.exports[L],
};

export const bn = (m: number, d = 1) => `US$${(m / 1000).toFixed(d)} billion`;
export const pctChange = (a: number, b: number) => ((b / a - 1) * 100);

/** Latest-year value and growth for a named series. */
export const lastOf = (n: Named) => ({ now: n.values[L], prev: n.values[L - 1] });

export function facts() {
  const coffee = export_products.find((p) => p.name === 'Coffee');
  const cocoa = export_products.find((p) => p.name.startsWith('Cocoa'));
  const topDest = destinations[0];
  const topOrig = origins[0];
  const firstYear = annual.years[0];
  const out = [
    `Uganda sold ${bn(latest.exports)} of goods abroad in ${year} and bought ${bn(latest.imports)}: a trade gap of ${bn(-latest.balance)}.`,
    `Gold made up ${Math.round(latest.goldShare)}% of exports in ${year}. Uganda also imported ${bn(annual.gold_imports[L])} of gold, much of it refined and sold on.`,
    `Without gold, exports were ${bn(latest.exportsExGold)} and imports ${bn(latest.importsExGold)}.`,
  ];
  if (coffee) {
    const c = lastOf(coffee);
    out.push(`Coffee earned a record ${bn(c.now, 2)} in ${year}, up ${pctChange(c.prev, c.now).toFixed(0)}% on ${prevYear}.`);
  }
  if (cocoa) {
    const c = lastOf(cocoa);
    out.push(`Cocoa exports ${c.now > c.prev * 1.8 ? 'roughly doubled' : `grew ${pctChange(c.prev, c.now).toFixed(0)}%`} to ${bn(c.now, 2)} in ${year}.`);
  }
  out.push(`The biggest buyer of Ugandan goods was ${topDest.name} (${bn(topDest.values[L])}); the biggest supplier was ${topOrig.name} (${bn(topOrig.values[L])}).`);
  out.push(`Exports were ${bn(annual.exports[0], 2)} in ${firstYear}, ${Math.round(latest.exports / annual.exports[0])} times smaller than today.`);
  return out;
}
