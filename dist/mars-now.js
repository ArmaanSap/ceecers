// "Mars now" strip for the header: Jezero local Mars time, Perseverance sol, typical air
// temperature for that hour, surface pressure and a radiation reference.
// Time and sol are computed (real). Temperature, pressure and radiation are REFERENCE values,
// not a live feed: there is no public live Jezero weather service, so the strip says so.

const JD_UNIX_EPOCH = 2440587.5;
const SOL_S = 88775.244;                    // seconds in a Mars solar day
const LANDING_MS = Date.UTC(2021, 1, 18, 20, 55, 0); // Perseverance touchdown (sol 0)
export const JEZERO_LON_E = 77.45;
export const RAD_MSV_DAY = 0.67;            // Curiosity RAD surface average at Gale (2012-13), reference only
export const EARTH_MSV_DAY = 2.4 / 365;     // typical Earth background, for scale
export const PRESSURE_MBAR = 7;             // typical Jezero surface pressure, varies with season
const T_MIN = -80, T_MAX = -10;             // typical diurnal air temperature range, deg C (reference)

export function marsNow(date = new Date()) {
  const ms = +date;
  const jdUtc = ms / 86400000 + JD_UNIX_EPOCH;
  const jdTt = jdUtc + (37 + 32.184) / 86400;
  const msd = (jdTt - 2405522.0028779) / 1.0274912517;
  const mtc = ((msd % 1) + 1) % 1 * 24;               // Mars Coordinated Time, hours
  const lmst = (((mtc + JEZERO_LON_E / 15) % 24) + 24) % 24; // local mean solar time at Jezero
  const sol = Math.floor((ms - LANDING_MS) / 1000 / SOL_S);
  // Smooth day/night curve: coldest near 04:30, warmest near 13:30 local time.
  const phase = (lmst - 13.5) / 24 * 2 * Math.PI;
  const temp = (T_MAX + T_MIN) / 2 + (T_MAX - T_MIN) / 2 * Math.cos(phase);
  const h = Math.floor(lmst), m = Math.floor((lmst - h) * 60);
  return {
    sol, lmst, clock: String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'),
    daylight: lmst >= 6 && lmst < 18, tempC: Math.round(temp),
    pressureMbar: PRESSURE_MBAR, radMsvDay: RAD_MSV_DAY,
    radVsEarth: Math.round(RAD_MSV_DAY / EARTH_MSV_DAY)
  };
}

export function mountMarsNow(doc = document) {
  const host = doc.querySelector('header .status');
  if (!host) return null;
  host.classList.add('marsnow');
  const draw = () => {
    const n = marsNow();
    host.innerHTML =
      `<span class="mn" title="Jezero local mean solar time. Perseverance sol count since landing (computed, live)."><b>SOL ${n.sol}</b> ${n.clock} ${n.daylight ? '☀' : '☾'}</span>` +
      `<span class="mn" title="Typical air temperature for this hour at Jezero. Reference, not a live measurement."><b>${n.tempC}°C</b><i>typ.</i></span>` +
      `<span class="mn" title="Typical surface pressure at Jezero. Reference, not live."><b>${n.pressureMbar} mbar</b></span>` +
      `<span class="mn" title="Curiosity RAD surface average at Gale Crater, 2012-13: about ${n.radVsEarth}x typical Earth background. Reference only, not a Jezero measurement or a suit dose."><b>☢ ${n.radMsvDay} mSv/day</b><i>ref.</i></span>`;
    host.setAttribute('aria-label', `Mars now. Sol ${n.sol}, ${n.clock} local time. Temperature, pressure and radiation are reference values, not live.`);
  };
  draw();
  return setInterval(draw, 30000);
}

if (typeof document !== 'undefined') mountMarsNow();
