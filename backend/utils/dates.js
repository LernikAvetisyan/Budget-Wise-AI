function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function laOffsetHoursForDate(yyyyMmDd) {
  const [Y, M, D] = yyyyMmDd.split('-').map(Number);

  function nthSunday(year, month, n) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const dow = first.getUTCDay();
    const delta = (7 - dow) % 7;
    const dayOfMonth = 1 + delta + 7 * (n - 1);
    return new Date(Date.UTC(year, month - 1, dayOfMonth));
  }

  const secondSundayMarch = nthSunday(Y, 3, 2);
  const firstSundayNov = nthSunday(Y, 11, 1);
  const curDay = new Date(Date.UTC(Y, M - 1, D));
  return curDay >= secondSundayMarch && curDay < firstSundayNov ? 7 : 8;
}

function laUtcRangeForDay(yyyyMmDd) {
  const [Y, M, D] = yyyyMmDd.split('-').map(Number);
  const offsetHrs = laOffsetHoursForDate(yyyyMmDd);
  const startUtc = new Date(Date.UTC(Y, M - 1, D, offsetHrs, 0, 0));
  const endUtc = new Date(Date.UTC(Y, M - 1, D + 1, offsetHrs, 0, 0));
  return { startUtc, endUtc };
}

function laDateTimeToUtc(yyyyMmDd, hhMm) {
  const [Y, M, D] = yyyyMmDd.split('-').map(Number);
  const [h, m] = hhMm.split(':').map(Number);
  const offsetHrs = laOffsetHoursForDate(yyyyMmDd);
  return new Date(Date.UTC(Y, M - 1, D, h + offsetHrs, m, 0));
}

function utcToLaParts(utcDate) {
  const Y = utcDate.getUTCFullYear();
  const M = utcDate.getUTCMonth() + 1;
  const D = utcDate.getUTCDate();
  const guessDateStr = `${Y}-${pad2(M)}-${pad2(D)}`;
  const offsetHrs = laOffsetHoursForDate(guessDateStr);
  const laMs = utcDate.getTime() - offsetHrs * 3600000;
  const la = new Date(laMs);
  const ly = la.getUTCFullYear();
  const lm = la.getUTCMonth() + 1;
  const ld = la.getUTCDate();
  const lh = la.getUTCHours();
  const lmin = la.getUTCMinutes();
  return {
    date: `${ly}-${pad2(lm)}-${pad2(ld)}`,
    time: `${pad2(lh)}:${pad2(lmin)}`
  };
}

module.exports = {
  laOffsetHoursForDate,
  laUtcRangeForDay,
  laDateTimeToUtc,
  utcToLaParts
};
