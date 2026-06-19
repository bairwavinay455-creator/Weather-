/* =========================================================
   SKYLINE — Weather Console
   Vanilla JS. No frameworks, no build step.

   API: OpenWeather
     - Geocoding (city search + reverse lookup)
     - One Call 3.0 (current + hourly + daily + alerts + UV)
     - Air Pollution (AQI)

   Drop your API key into API_KEY below. See the bottom of
   this file / the README notes in the chat for setup help.
   ========================================================= */

// ---------------------------------------------------------
// 0. CONFIG
// ---------------------------------------------------------
const API_KEY = "YOUR_API_KEY_HERE"; // <-- 515534f2552ea7b3fc8991686ad175b2

const GEO_URL     = "https://api.openweathermap.org/geo/1.0/direct";
const REVERSE_URL = "https://api.openweathermap.org/geo/1.0/reverse";
const ONECALL_URL = "https://api.openweathermap.org/data/3.0/onecall";
const AQI_URL      = "https://api.openweathermap.org/data/2.5/air_pollution";

// ---------------------------------------------------------
// 1. STATE
// ---------------------------------------------------------
const state = {
  unit: localStorage.getItem("skyline_unit") || "C",     // 'C' | 'F'
  theme: localStorage.getItem("skyline_theme") || "dark", // 'dark' | 'light'
  range: 5,                  // daily forecast range: 5 or 7
  current: null,             // last full payload from One Call
  aqi: null,
  place: null,                // { name, country, state, lat, lon }
  favorites: JSON.parse(localStorage.getItem("skyline_favorites") || "[]"),
  recents: JSON.parse(localStorage.getItem("skyline_recents") || "[]"),
  soundOn: false,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

// ---------------------------------------------------------
// 2. DOM REFS
// ---------------------------------------------------------
const $ = (id) => document.getElementById(id);

const dom = {
  html: document.documentElement,
  cityInput: $("city-input"),
  suggestions: $("suggestions"),
  locateBtn: $("locate-btn"),
  unitToggle: $("unit-toggle"),
  themeToggle: $("theme-toggle"),
  soundToggle: $("sound-toggle"),
  favoriteChips: $("favorite-chips"),
  recentChips: $("recent-chips"),
  alertBanner: $("alert-banner"),
  alertTitle: $("alert-title"),
  alertDesc: $("alert-desc"),
  alertDismiss: $("alert-dismiss"),
  loading: $("loading"),
  errorToast: $("error-toast"),
  errorMessage: $("error-message"),
  errorClose: $("error-close"),
  main: $("main-content"),
  cityName: $("city-name"),
  cityMeta: $("city-meta"),
  favoriteBtn: $("favorite-btn"),
  weatherIcon: $("weather-icon"),
  tempValue: $("temp-value"),
  conditionText: $("condition-text"),
  feelsLike: $("feels-like"),
  sunArcSvg: $("sun-arc-svg"),
  arcMarker: $("arc-marker"),
  sunriseTime: $("sunrise-time"),
  sunsetTime: $("sunset-time"),
  hourlyStrip: $("hourly-strip"),
  detailHumidity: $("detail-humidity"),
  humidityFill: $("humidity-fill"),
  detailWind: $("detail-wind"),
  windArrow: $("wind-arrow"),
  detailPressure: $("detail-pressure"),
  detailVisibility: $("detail-visibility"),
  detailUv: $("detail-uv"),
  uvBand: $("uv-band"),
  detailAqi: $("detail-aqi"),
  aqiBand: $("aqi-band"),
  dailyList: $("daily-list"),
  range5: $("range-5"),
  range7: $("range-7"),
  canvas: $("sky-canvas"),
};

// ---------------------------------------------------------
// 3. UTILITIES
// ---------------------------------------------------------
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function cToF(c) { return c * 9 / 5 + 32; }

function fmtTemp(celsius) {
  const v = state.unit === "C" ? celsius : cToF(celsius);
  return Math.round(v);
}

function fmtTime(unixSeconds, tzOffsetSeconds) {
  // tzOffsetSeconds shifts UTC to the location's local time
  const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function fmtHour(unixSeconds, tzOffsetSeconds) {
  const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}${ampm}`;
}

function fmtDayLabel(unixSeconds, tzOffsetSeconds, index) {
  if (index === 0) return "Today";
  const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function fmtDateSub(unixSeconds, tzOffsetSeconds) {
  const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function showLoading(show) {
  dom.loading.classList.toggle("hidden", !show);
  if (show) dom.main.classList.add("hidden");
}

function showError(msg) {
  dom.errorMessage.textContent = msg;
  dom.errorToast.classList.remove("hidden");
}
function hideError() { dom.errorToast.classList.add("hidden"); }

// ---------------------------------------------------------
// 4. ICONS — small inline SVGs, mapped from OpenWeather codes
// ---------------------------------------------------------
const ICONS = {
  sun: `<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="11" fill="#f2b84b"/><g stroke="#f2b84b" stroke-width="3" stroke-linecap="round"><line x1="24" y1="2" x2="24" y2="9"/><line x1="24" y1="39" x2="24" y2="46"/><line x1="2" y1="24" x2="9" y2="24"/><line x1="39" y1="24" x2="46" y2="24"/><line x1="8" y1="8" x2="13" y2="13"/><line x1="35" y1="35" x2="40" y2="40"/><line x1="40" y1="8" x2="35" y2="13"/><line x1="13" y1="35" x2="8" y2="40"/></g></svg>`,
  moon: `<svg viewBox="0 0 48 48" fill="none"><path d="M34 26.5A14 14 0 1 1 21.5 13a11 11 0 0 0 12.5 13.5Z" fill="#9fb4e0"/></svg>`,
  cloud: `<svg viewBox="0 0 48 48" fill="none"><path d="M14 34a8 8 0 0 1-1-15.9 10 10 0 0 1 19.3-3.1A8.5 8.5 0 0 1 35 34H14Z" fill="#b9c4d8"/></svg>`,
  cloudSun: `<svg viewBox="0 0 48 48" fill="none"><circle cx="18" cy="16" r="8" fill="#f2b84b"/><path d="M18 30a8 8 0 0 1-1-15.9c.6-.06 1.2-.06 1.8 0A10 10 0 0 1 38 17a8.5 8.5 0 0 1-1.5 13H18Z" fill="#b9c4d8"/></svg>`,
  cloudMoon: `<svg viewBox="0 0 48 48" fill="none"><path d="M26 20.5A8.6 8.6 0 0 1 19 9a8 8 0 1 0 8.5 13.4 8.5 8.5 0 0 1-1.5-1.9Z" fill="#9fb4e0"/><path d="M18 32a8 8 0 0 1-1-15.9 10 10 0 0 1 19.3-1.6A8.5 8.5 0 0 1 35 32H18Z" fill="#b9c4d8"/></svg>`,
  rain: `<svg viewBox="0 0 48 48" fill="none"><path d="M14 26a8 8 0 0 1-1-15.9 10 10 0 0 1 19.3-3.1A8.5 8.5 0 0 1 35 26H14Z" fill="#b9c4d8"/><g stroke="#5da9e9" stroke-width="2.4" stroke-linecap="round"><line x1="16" y1="32" x2="13" y2="40"/><line x1="25" y1="32" x2="22" y2="40"/><line x1="34" y1="32" x2="31" y2="40"/></g></svg>`,
  thunder: `<svg viewBox="0 0 48 48" fill="none"><path d="M14 24a8 8 0 0 1-1-15.9 10 10 0 0 1 19.3-3.1A8.5 8.5 0 0 1 35 24H14Z" fill="#8b96ab"/><path d="M26 28 19 38h6l-3 8 11-12h-6l4-6Z" fill="#f2b84b"/></svg>`,
  snow: `<svg viewBox="0 0 48 48" fill="none"><path d="M14 24a8 8 0 0 1-1-15.9 10 10 0 0 1 19.3-3.1A8.5 8.5 0 0 1 35 24H14Z" fill="#b9c4d8"/><g stroke="#dfe9f7" stroke-width="2.2" stroke-linecap="round"><line x1="17" y1="32" x2="17" y2="40"/><line x1="13.5" y1="34" x2="20.5" y2="38"/><line x1="20.5" y1="34" x2="13.5" y2="38"/><line x1="31" y1="32" x2="31" y2="40"/><line x1="27.5" y1="34" x2="34.5" y2="38"/><line x1="34.5" y1="34" x2="27.5" y2="38"/></g></svg>`,
  mist: `<svg viewBox="0 0 48 48" fill="none"><g stroke="#9fb0c9" stroke-width="2.6" stroke-linecap="round"><line x1="8" y1="17" x2="40" y2="17"/><line x1="13" y1="24" x2="40" y2="24"/><line x1="8" y1="31" x2="35" y2="31"/></g></svg>`,
};

function iconFor(code, main) {
  const isNight = code && code.endsWith("n");
  const m = (main || "").toLowerCase();
  if (m.includes("thunder")) return ICONS.thunder;
  if (m.includes("snow")) return ICONS.snow;
  if (m.includes("rain") || m.includes("drizzle")) return ICONS.rain;
  if (m.includes("mist") || m.includes("fog") || m.includes("haze") || m.includes("smoke")) return ICONS.mist;
  if (m.includes("cloud")) {
    if (code === "02d" || code === "02n") return isNight ? ICONS.cloudMoon : ICONS.cloudSun;
    return ICONS.cloud;
  }
  if (m.includes("clear")) return isNight ? ICONS.moon : ICONS.sun;
  return isNight ? ICONS.moon : ICONS.sun;
}

// Maps a condition to a simplified animation mode for the background canvas
function animationModeFor(code, main) {
  const isNight = code && code.endsWith("n");
  const m = (main || "").toLowerCase();
  if (m.includes("thunder")) return "storm";
  if (m.includes("snow")) return "snow";
  if (m.includes("rain") || m.includes("drizzle")) return "rain";
  if (m.includes("mist") || m.includes("fog") || m.includes("haze") || m.includes("smoke")) return "mist";
  if (m.includes("cloud")) return "clouds";
  if (m.includes("clear")) return isNight ? "clear-night" : "clear-day";
  return isNight ? "clear-night" : "clear-day";
}

// ---------------------------------------------------------
// 5. API CALLS
// ---------------------------------------------------------
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) throw new Error("City not found. Try a different spelling.");
    if (res.status === 401) throw new Error("Invalid API key. Check the API_KEY constant in script.js.");
    throw new Error(`Weather service error (${res.status}). Please try again.`);
  }
  return res.json();
}

async function geocodeCity(query) {
  const url = `${GEO_URL}?q=${encodeURIComponent(query)}&limit=5&appid=${API_KEY}`;
  return apiGet(url);
}

async function reverseGeocode(lat, lon) {
  const url = `${REVERSE_URL}?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
  return apiGet(url);
}

async function fetchOneCall(lat, lon) {
  const url = `${ONECALL_URL}?lat=${lat}&lon=${lon}&units=metric&exclude=minutely&appid=${API_KEY}`;
  return apiGet(url);
}

async function fetchAQI(lat, lon) {
  const url = `${AQI_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
  return apiGet(url);
}

// ---------------------------------------------------------
// 6. CORE LOAD FLOW
// ---------------------------------------------------------
async function loadByPlace(place) {
  hideError();
  showLoading(true);
  try {
    const [weather, aqi] = await Promise.all([
      fetchOneCall(place.lat, place.lon),
      fetchAQI(place.lat, place.lon).catch(() => null), // AQI failure shouldn't block the whole UI
    ]);

    state.current = weather;
    state.aqi = aqi;
    state.place = place;

    localStorage.setItem("skyline_lastPlace", JSON.stringify(place));
    pushRecent(place);

    renderAll();
    dom.main.classList.remove("hidden");
  } catch (err) {
    showError(err.message || "Something went wrong fetching the weather.");
  } finally {
    showLoading(false);
  }
}

async function loadByCityName(name) {
  hideError();
  showLoading(true);
  try {
    const results = await geocodeCity(name);
    if (!results || results.length === 0) {
      throw new Error(`No matches for "${name}". Try a different spelling.`);
    }
    const r = results[0];
    await loadByPlace({
      name: r.name,
      state: r.state || "",
      country: r.country || "",
      lat: r.lat,
      lon: r.lon,
    });
  } catch (err) {
    showError(err.message || "Something went wrong finding that city.");
    showLoading(false);
  }
}

async function loadByGeolocation() {
  if (!navigator.geolocation) {
    showError("Geolocation isn't supported by this browser.");
    return;
  }
  showLoading(true);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const results = await reverseGeocode(latitude, longitude);
        const r = results && results[0];
        await loadByPlace({
          name: r ? r.name : "Current location",
          state: r ? r.state || "" : "",
          country: r ? r.country || "" : "",
          lat: latitude,
          lon: longitude,
        });
      } catch (err) {
        showError(err.message || "Couldn't resolve your location.");
        showLoading(false);
      }
    },
    () => {
      showError("Location access was denied. Search for a city instead.");
      showLoading(false);
    }
  );
}

// ---------------------------------------------------------
// 7. RENDERING
// ---------------------------------------------------------
function renderAll() {
  const data = state.current;
  const tz = data.timezone_offset;
  const cur = data.current;
  const today = data.daily[0];

  // -- Header / location --
  dom.cityName.textContent = state.place.name;
  const metaParts = [state.place.state, state.place.country].filter(Boolean);
  dom.cityMeta.textContent = metaParts.join(", ");

  const isFav = state.favorites.some((f) => samePlace(f, state.place));
  dom.favoriteBtn.classList.toggle("saved", isFav);

  // -- Hero --
  dom.weatherIcon.innerHTML = iconFor(cur.weather[0].icon, cur.weather[0].main);
  dom.tempValue.textContent = fmtTemp(cur.temp);
  dom.conditionText.textContent = cur.weather[0].description;
  dom.feelsLike.textContent = `Feels like ${fmtTemp(cur.feels_like)}°`;

  // -- Sun arc --
  renderSunArc(cur, today, data);

  // -- Hourly --
  renderHourly(data.hourly, tz);

  // -- Detail grid --
  renderDetails(cur, data.daily[0]);

  // -- Daily --
  renderDaily(data.daily, tz);

  // -- Alerts --
  renderAlerts(data.alerts);

  // -- Background animation + page accent --
  const mode = animationModeFor(cur.weather[0].icon, cur.weather[0].main);
  setSkyMode(mode);
  updateAmbientSound(mode);

  // -- Chips --
  renderChips();

  updateUnitLabels();
}

function renderSunArc(cur, today, data) {
  const tz = data.timezone_offset;
  dom.sunriseTime.textContent = fmtTime(cur.sunrise, tz);
  dom.sunsetTime.textContent = fmtTime(cur.sunset, tz);

  const now = Math.floor(Date.now() / 1000) + (new Date().getTimezoneOffset() * 60) + tz;
  // ^ approximate "now" shifted into the place's local time, consistent with sunrise/sunset

  let t;
  let isDay = now >= cur.sunrise && now <= cur.sunset;

  if (isDay) {
    t = (now - cur.sunrise) / (cur.sunset - cur.sunrise);
  } else {
    const tomorrowSunrise = data.daily[1] ? data.daily[1].sunrise : cur.sunrise + 86400;
    const nightStart = now < cur.sunrise ? cur.sunset - 86400 : cur.sunset;
    const nightEnd = now < cur.sunrise ? cur.sunrise : tomorrowSunrise;
    t = (now - nightStart) / (nightEnd - nightStart);
  }
  t = Math.min(1, Math.max(0, t));

  // Parametrize the semicircle path: center (120,116) radius 106
  const angle = Math.PI * (1 - t); // from 180deg to 0deg
  const cx = 120 + 106 * Math.cos(angle);
  const cy = 116 - 106 * Math.sin(angle);
  dom.arcMarker.setAttribute("cx", cx.toFixed(1));
  dom.arcMarker.setAttribute("cy", cy.toFixed(1));
  dom.arcMarker.style.fill = isDay ? "var(--accent-gold)" : "var(--accent-blue)";
}

function renderHourly(hourly, tz) {
  dom.hourlyStrip.innerHTML = "";
  hourly.slice(0, 24).forEach((h) => {
    const card = document.createElement("div");
    card.className = "hour-card";
    card.innerHTML = `
      <span class="hour-time">${fmtHour(h.dt, tz)}</span>
      <div class="hour-icon">${iconFor(h.weather[0].icon, h.weather[0].main)}</div>
      <span class="hour-temp">${fmtTemp(h.temp)}°</span>
      <span class="hour-pop">${Math.round((h.pop || 0) * 100)}%</span>
    `;
    dom.hourlyStrip.appendChild(card);
  });
}

function renderDetails(cur, today) {
  dom.detailHumidity.textContent = `${cur.humidity}%`;
  dom.humidityFill.style.width = `${cur.humidity}%`;

  const windKmh = cur.wind_speed * 3.6;
  const windDisplay = state.unit === "C" ? `${Math.round(windKmh)} km/h` : `${Math.round(windKmh * 0.621)} mph`;
  dom.detailWind.textContent = windDisplay;
  dom.windArrow.style.transform = `rotate(${cur.wind_deg || 0}deg)`;

  dom.detailPressure.textContent = `${cur.pressure} hPa`;

  const visKm = (cur.visibility || 10000) / 1000;
  dom.detailVisibility.textContent = state.unit === "C" ? `${visKm.toFixed(1)} km` : `${(visKm * 0.621).toFixed(1)} mi`;

  const uv = Math.round(cur.uvi);
  dom.detailUv.textContent = uv;
  const [uvLabel, uvColor] = uvBand(uv);
  dom.uvBand.textContent = uvLabel;
  dom.uvBand.style.background = uvColor + "26";
  dom.uvBand.style.color = uvColor;

  if (state.aqi && state.aqi.list && state.aqi.list[0]) {
    const aqi = state.aqi.list[0].main.aqi;
    const [aqiLabel, aqiColor] = aqiBand(aqi);
    dom.detailAqi.textContent = aqi;
    dom.aqiBand.textContent = aqiLabel;
    dom.aqiBand.style.background = aqiColor + "26";
    dom.aqiBand.style.color = aqiColor;
  } else {
    dom.detailAqi.textContent = "—";
    dom.aqiBand.textContent = "unavailable";
    dom.aqiBand.style.background = "transparent";
    dom.aqiBand.style.color = "var(--text-3)";
  }
}

function uvBand(uv) {
  if (uv <= 2) return ["Low", "#6fcf97"];
  if (uv <= 5) return ["Moderate", "#f2b84b"];
  if (uv <= 7) return ["High", "#ef9d4d"];
  if (uv <= 10) return ["Very High", "#ef7d7d"];
  return ["Extreme", "#c25dd6"];
}

function aqiBand(aqi) {
  // OpenWeather AQI scale: 1 Good .. 5 Very Poor
  const map = {
    1: ["Good", "#6fcf97"],
    2: ["Fair", "#a8d36a"],
    3: ["Moderate", "#f2b84b"],
    4: ["Poor", "#ef9d4d"],
    5: ["Very Poor", "#ef7d7d"],
  };
  return map[aqi] || ["—", "#9aa5b8"];
}

function renderDaily(daily, tz) {
  dom.dailyList.innerHTML = "";
  const days = daily.slice(0, state.range);

  const allTemps = days.flatMap((d) => [d.temp.min, d.temp.max]);
  const globalMin = Math.min(...allTemps);
  const globalMax = Math.max(...allTemps);
  const span = globalMax - globalMin || 1;

  days.forEach((d, i) => {
    const row = document.createElement("div");
    row.className = "day-row";

    const left = ((d.temp.min - globalMin) / span) * 100;
    const width = ((d.temp.max - d.temp.min) / span) * 100;

    row.innerHTML = `
      <div class="day-name">${fmtDayLabel(d.dt, tz, i)}<span>${fmtDateSub(d.dt, tz)}</span></div>
      <div class="day-icon">${iconFor(d.weather[0].icon, d.weather[0].main)}</div>
      <div class="day-bar-track"><div class="day-bar-fill" style="left:${left}%; width:${Math.max(width, 6)}%"></div></div>
      <div class="day-temps"><span class="day-temp-high">${fmtTemp(d.temp.max)}°</span><span class="day-temp-low">${fmtTemp(d.temp.min)}°</span></div>
    `;
    dom.dailyList.appendChild(row);
  });
}

function renderAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    dom.alertBanner.classList.add("hidden");
    return;
  }
  const a = alerts[0];
  dom.alertTitle.textContent = a.event;
  dom.alertDesc.textContent = a.description ? a.description.slice(0, 220) + (a.description.length > 220 ? "…" : "") : `Issued by ${a.sender_name}`;
  dom.alertBanner.classList.remove("hidden");
}

function updateUnitLabels() {
  document.querySelectorAll(".unit-c, .unit-f").forEach((el) => el.classList.remove("active"));
  document.querySelector(state.unit === "C" ? ".unit-c" : ".unit-f").classList.add("active");
}

// ---------------------------------------------------------
// 8. FAVORITES / RECENTS (localStorage)
// ---------------------------------------------------------
function samePlace(a, b) {
  return Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05;
}

function pushRecent(place) {
  state.recents = state.recents.filter((p) => !samePlace(p, place));
  state.recents.unshift(place);
  state.recents = state.recents.slice(0, 6);
  localStorage.setItem("skyline_recents", JSON.stringify(state.recents));
}

function toggleFavorite() {
  if (!state.place) return;
  const exists = state.favorites.some((f) => samePlace(f, state.place));
  if (exists) {
    state.favorites = state.favorites.filter((f) => !samePlace(f, state.place));
  } else {
    state.favorites.unshift(state.place);
  }
  localStorage.setItem("skyline_favorites", JSON.stringify(state.favorites));
  dom.favoriteBtn.classList.toggle("saved", !exists);
  renderChips();
}

function renderChips() {
  renderChipList(dom.favoriteChips, state.favorites, true);
  renderChipList(dom.recentChips, state.recents, false);
}

function renderChipList(container, list, removable) {
  container.innerHTML = "";
  if (list.length === 0) {
    container.innerHTML = `<span class="chip-empty">None yet</span>`;
    return;
  }
  list.forEach((p) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.innerHTML = `${p.name}${removable ? `<span class="chip-remove">✕</span>` : ""}`;
    chip.addEventListener("click", (e) => {
      if (removable && e.target.classList.contains("chip-remove")) {
        state.favorites = state.favorites.filter((f) => !samePlace(f, p));
        localStorage.setItem("skyline_favorites", JSON.stringify(state.favorites));
        renderChips();
        return;
      }
      loadByPlace(p);
    });
    container.appendChild(chip);
  });
}

// ---------------------------------------------------------
// 9. CITY SEARCH + AUTO-SUGGEST
// ---------------------------------------------------------
let activeSuggestionIndex = -1;
let currentSuggestions = [];

const handleSearchInput = debounce(async (value) => {
  const q = value.trim();
  if (q.length < 2) {
    dom.suggestions.classList.add("hidden");
    return;
  }
  try {
    const results = await geocodeCity(q);
    currentSuggestions = results || [];
    activeSuggestionIndex = -1;
    renderSuggestions();
  } catch {
    dom.suggestions.classList.add("hidden");
  }
}, 350);

function renderSuggestions() {
  if (currentSuggestions.length === 0) {
    dom.suggestions.classList.add("hidden");
    return;
  }
  dom.suggestions.innerHTML = "";
  currentSuggestions.forEach((r, i) => {
    const li = document.createElement("li");
    li.className = i === activeSuggestionIndex ? "active" : "";
    const region = [r.state, r.country].filter(Boolean).join(", ");
    li.innerHTML = `<span>${r.name}</span><span class="sugg-region">${region}</span>`;
    li.addEventListener("click", () => selectSuggestion(r));
    dom.suggestions.appendChild(li);
  });
  dom.suggestions.classList.remove("hidden");
}

function selectSuggestion(r) {
  dom.cityInput.value = "";
  dom.suggestions.classList.add("hidden");
  loadByPlace({ name: r.name, state: r.state || "", country: r.country || "", lat: r.lat, lon: r.lon });
}

dom.cityInput.addEventListener("input", (e) => handleSearchInput(e.target.value));

dom.cityInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, currentSuggestions.length - 1);
    renderSuggestions();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
    renderSuggestions();
  } else if (e.key === "Enter") {
    if (activeSuggestionIndex >= 0 && currentSuggestions[activeSuggestionIndex]) {
      selectSuggestion(currentSuggestions[activeSuggestionIndex]);
    } else if (dom.cityInput.value.trim()) {
      dom.suggestions.classList.add("hidden");
      loadByCityName(dom.cityInput.value.trim());
      dom.cityInput.value = "";
    }
  } else if (e.key === "Escape") {
    dom.suggestions.classList.add("hidden");
  }
});

document.addEventListener("click", (e) => {
  if (!dom.suggestions.contains(e.target) && e.target !== dom.cityInput) {
    dom.suggestions.classList.add("hidden");
  }
});

// ---------------------------------------------------------
// 10. CONTROLS — unit, theme, favorite, range, alerts, errors
// ---------------------------------------------------------
dom.locateBtn.addEventListener("click", loadByGeolocation);

dom.unitToggle.addEventListener("click", () => {
  state.unit = state.unit === "C" ? "F" : "C";
  localStorage.setItem("skyline_unit", state.unit);
  if (state.current) renderAll();
  else updateUnitLabels();
});

dom.themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
});

function applyTheme() {
  dom.html.setAttribute("data-theme", state.theme);
  localStorage.setItem("skyline_theme", state.theme);
}

dom.favoriteBtn.addEventListener("click", toggleFavorite);

dom.range5.addEventListener("click", () => setRange(5));
dom.range7.addEventListener("click", () => setRange(7));
function setRange(n) {
  state.range = n;
  dom.range5.classList.toggle("active", n === 5);
  dom.range7.classList.toggle("active", n === 7);
  if (state.current) renderDaily(state.current.daily, state.current.timezone_offset);
}

dom.alertDismiss.addEventListener("click", () => dom.alertBanner.classList.add("hidden"));
dom.errorClose.addEventListener("click", hideError);

dom.soundToggle.addEventListener("click", () => {
  state.soundOn = !state.soundOn;
  dom.soundToggle.classList.toggle("active", state.soundOn);
  if (state.soundOn && state.current) {
    const mode = animationModeFor(state.current.current.weather[0].icon, state.current.current.weather[0].main);
    startAmbientSound(mode);
  } else {
    stopAmbientSound();
  }
});

// ===========================================================
// 11. AMBIENT SOUND — synthesized in-browser, no audio files
// ===========================================================
let audioCtx = null;
let noiseSource = null;
let noiseFilter = null;
let noiseGain = null;

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function makeNoiseBuffer(ctx) {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function startAmbientSound(mode) {
  stopAmbientSound();
  if (mode === "clear-day" || mode === "clear-night") return; // quiet sky, no loop needed

  const ctx = ensureAudioCtx();
  noiseSource = ctx.createBufferSource();
  noiseSource.buffer = makeNoiseBuffer(ctx);
  noiseSource.loop = true;

  noiseFilter = ctx.createBiquadFilter();
  noiseGain = ctx.createGain();

  if (mode === "rain" || mode === "storm") {
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1200;
    noiseFilter.Q.value = 0.6;
    noiseGain.gain.value = 0.05;
  } else if (mode === "snow") {
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 500;
    noiseGain.gain.value = 0.025;
  } else { // clouds, mist
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 350;
    noiseGain.gain.value = 0.02;
  }

  noiseSource.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
  noiseSource.start();
}

function stopAmbientSound() {
  if (noiseSource) {
    try { noiseSource.stop(); } catch { /* already stopped */ }
    noiseSource.disconnect();
    noiseSource = null;
  }
}

function updateAmbientSound(mode) {
  if (state.soundOn) startAmbientSound(mode);
}

// ===========================================================
// 12. BACKGROUND CANVAS — weather-reactive ambient animation
//     This is the page's signature element: a living sky
//     behind the glass UI that reflects current conditions.
// ===========================================================
const ctx2d = dom.canvas.getContext("2d");
let particles = [];
let skyMode = "clear-day";
let rafId = null;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  dom.canvas.width = window.innerWidth * dpr;
  dom.canvas.height = window.innerHeight * dpr;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function setSkyMode(mode) {
  skyMode = mode;
  document.body.dataset.sky = mode;
  seedParticles(mode);
  if (!state.reducedMotion) {
    if (!rafId) loopCanvas();
  } else {
    drawStaticFrame();
  }
}

function seedParticles(mode) {
  const w = window.innerWidth, h = window.innerHeight;
  particles = [];

  if (mode === "rain" || mode === "storm") {
    const count = mode === "storm" ? 160 : 110;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w, y: Math.random() * h,
        len: 12 + Math.random() * 14, speed: 7 + Math.random() * 6,
        drift: 1.5,
      });
    }
  } else if (mode === "snow") {
    for (let i = 0; i < 90; i++) {
      particles.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 1.5 + Math.random() * 2.5, speed: 0.6 + Math.random() * 1.2,
        sway: Math.random() * Math.PI * 2,
      });
    }
  } else if (mode === "clouds") {
    for (let i = 0; i < 6; i++) {
      particles.push({
        x: Math.random() * w, y: 40 + Math.random() * h * 0.5,
        r: 80 + Math.random() * 90, speed: 0.15 + Math.random() * 0.2,
      });
    }
  } else if (mode === "clear-night") {
    for (let i = 0; i < 90; i++) {
      particles.push({
        x: Math.random() * w, y: Math.random() * h * 0.7,
        r: 0.6 + Math.random() * 1.3, phase: Math.random() * Math.PI * 2,
      });
    }
  } else if (mode === "mist") {
    for (let i = 0; i < 5; i++) {
      particles.push({
        x: Math.random() * w, y: h * 0.3 + i * (h * 0.5 / 5),
        speed: 0.2 + Math.random() * 0.2, offset: Math.random() * w,
      });
    }
  }
  // clear-day: no particles, just the gradient + faint sun glow handled in draw
}

function drawStaticFrame() {
  const w = window.innerWidth, h = window.innerHeight;
  ctx2d.clearRect(0, 0, w, h);
  drawSkyBase(w, h);
}

function drawSkyBase(w, h) {
  // subtle vignette glow depending on mode, kept very quiet so the glass UI stays legible
  if (skyMode === "clear-day") {
    const g = ctx2d.createRadialGradient(w * 0.8, h * 0.05, 0, w * 0.8, h * 0.05, w * 0.6);
    g.addColorStop(0, "rgba(242,184,75,0.10)");
    g.addColorStop(1, "rgba(242,184,75,0)");
    ctx2d.fillStyle = g;
    ctx2d.fillRect(0, 0, w, h);
  }
}

function loopCanvas() {
  const w = window.innerWidth, h = window.innerHeight;
  ctx2d.clearRect(0, 0, w, h);
  drawSkyBase(w, h);

  if (skyMode === "rain" || skyMode === "storm") {
    ctx2d.strokeStyle = "rgba(150,190,230,0.45)";
    ctx2d.lineWidth = 1.4;
    particles.forEach((p) => {
      ctx2d.beginPath();
      ctx2d.moveTo(p.x, p.y);
      ctx2d.lineTo(p.x - p.drift, p.y + p.len);
      ctx2d.stroke();
      p.y += p.speed; p.x -= p.drift * 0.3;
      if (p.y > h) { p.y = -20; p.x = Math.random() * w; }
    });
  } else if (skyMode === "snow") {
    ctx2d.fillStyle = "rgba(255,255,255,0.8)";
    particles.forEach((p) => {
      p.sway += 0.02;
      p.x += Math.sin(p.sway) * 0.6;
      p.y += p.speed;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx2d.fill();
      if (p.y > h) { p.y = -10; p.x = Math.random() * w; }
    });
  } else if (skyMode === "clouds") {
    ctx2d.fillStyle = "rgba(170,185,210,0.10)";
    particles.forEach((p) => {
      ctx2d.beginPath();
      ctx2d.ellipse(p.x, p.y, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
      ctx2d.fill();
      p.x += p.speed;
      if (p.x - p.r > w) p.x = -p.r;
    });
  } else if (skyMode === "clear-night") {
    particles.forEach((p) => {
      p.phase += 0.02;
      const twinkle = 0.5 + Math.sin(p.phase) * 0.5;
      ctx2d.fillStyle = `rgba(255,255,255,${0.25 + twinkle * 0.6})`;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx2d.fill();
    });
  } else if (skyMode === "mist") {
    ctx2d.fillStyle = "rgba(180,195,215,0.05)";
    particles.forEach((p) => {
      p.offset += p.speed;
      const grad = ctx2d.createLinearGradient(0, p.y, w, p.y);
      grad.addColorStop(0, "rgba(180,195,215,0)");
      grad.addColorStop(0.5, "rgba(180,195,215,0.07)");
      grad.addColorStop(1, "rgba(180,195,215,0)");
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, p.y - 12, w, 24);
    });
  }

  // storm flashes
  if (skyMode === "storm" && Math.random() < 0.004) {
    ctx2d.fillStyle = "rgba(255,255,255,0.18)";
    ctx2d.fillRect(0, 0, w, h);
  }

  rafId = requestAnimationFrame(loopCanvas);
}

// ---------------------------------------------------------
// 13. INIT
// ---------------------------------------------------------
function init() {
  applyTheme();
  updateUnitLabels();
  renderChips();
  setSkyMode("clear-day");

  const last = JSON.parse(localStorage.getItem("skyline_lastPlace") || "null");
  if (last) {
    loadByPlace(last);
  } else if (state.favorites[0]) {
    loadByPlace(state.favorites[0]);
  } else {
    // Default to a sensible starting city; the user can search or use geolocation immediately
    loadByCityName("London");
  }
}

init();
