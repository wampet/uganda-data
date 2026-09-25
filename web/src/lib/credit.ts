// How a chart credits its source: UBOS tables are titled without the
// publisher ("Consumer Price Index..."), international ones name theirs.
const NAMED = /^(World Bank|IMF|WHO|Bank of Uganda)\b/;

export const credit = (title: string) => (NAMED.test(title) ? title : `UBOS, ${title}`);
