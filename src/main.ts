import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import puzzleImageUrl from "../kaze_elza.jpg";
import birthdayPhotoUrl from "../C834BBE5-586F-4669-9C0D-BF3E0F6D8F00.jpg";

type Stage =
  | "intro"
  | "map"
  | "captcha"
  | "checksum"
  | "memory"
  | "puzzle"
  | "code"
  | "hotline"
  | "jumpscare"
  | "download";

type MapClue = {
  distanceKm: number;
  referenceName: string;
};

type HiddenMapLocation = {
  coords: [number, number];
  name: string;
};

type CaptchaAsset = {
  code: string;
  url: string;
};

type FloatingTimer = {
  danger?: boolean;
  label: string;
  value: string;
};

type AppState = {
  captchaExpectedCode: string;
  captchaImageUrl: string;
  checksumDeadlineAt: number;
  checksumTarget: number;
  codeEntryDeadlineAt: number;
  introHoldUntil: number;
  lastResetReason: string;
  mapClues: MapClue[];
  mapTargetLat: number;
  mapTargetLng: number;
  mapTargetName: string;
  memoryCode: string;
  memoryRevealUntil: number;
  hotlineDeadlineAt: number;
  hotlineReadyAt: number;
  puzzleDeadlineAt: number;
  puzzleMoves: number;
  puzzleTiles: number[];
  restartCount: number;
  stage: Stage;
};

const STORAGE_KEY = "troll-verification-state-v6";
const INTRO_BASE_HOLD_MS = 3000;
const CHECKSUM_DEADLINE_MS = 30000;
const MEMORY_REVEAL_MS = 7000;
const PUZZLE_DEADLINE_MS = 85000;
const CODE_ENTRY_DEADLINE_MS = 22000;
const HOTLINE_MENU_DELAY_MS = 7000;
const HOTLINE_RESPONSE_WINDOW_MS = 6000;
const LUNGAU_MAP_PADDING_RATIO = 0.22;
const BIRTHDAY_LINK_KEY = 73;
const BIRTHDAY_LINK_DATA = [
  33, 61, 61, 57, 58, 115, 102, 102, 58, 38, 60, 39, 45, 42, 37, 38, 60, 45, 103, 42, 38, 36, 102, 58,
  42, 33, 32, 61, 61, 44, 59, 102, 37, 60, 40, 39, 46, 40, 46, 59, 60, 39, 45, 100, 47, 44, 40, 61, 100,
  34, 44, 39, 58, 42, 33, 32, 34, 40, 46, 40, 62, 40, 102, 58, 100, 13, 49, 37, 37, 29, 28, 1, 62, 121,
  112, 60, 118, 58, 32, 116, 42, 125, 123, 124, 126, 120, 125, 121, 47, 120, 112, 121, 125, 120, 47, 122,
  112, 124, 42, 45, 112, 43, 42, 125, 126, 42, 45, 47, 40, 124, 126, 126, 111, 60, 61, 36, 22, 58, 38, 60,
  59, 42, 44, 116, 42, 37, 32, 57, 43, 38, 40, 59, 45, 111, 60, 61, 36, 22, 36, 44, 45, 32, 60, 36, 116,
  61, 44, 49, 61, 111, 60, 61, 36, 22, 42, 40, 36, 57, 40, 32, 46, 39, 116, 58, 38, 42, 32, 40, 37, 22,
  58, 33, 40, 59, 32, 39, 46,
];
const solvedPuzzle = [1, 2, 3, 4, 5, 6, 7, 8, 0];
const captchaImageModules = import.meta.glob("./capthaimages/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const encouragementTips = [
  "Wenn man sich konzentriert, funktioniert es besser.",
  "Du musst nur an dich glauben. Der Verifikator tut das bereits nicht.",
  "Eine ruhige Hand verhindert keinen Reset, hilft aber beim Klicken.",
  "Fast geschafft ist ein Gefuehl, kein verfahrensrelevanter Status.",
  "Wer jetzt sauber bleibt, darf vielleicht gleich mit einem Roboter sprechen.",
  "Jeder Reset ist formal betrachtet nur ein neuer Anfang.",
];

const stageTips: Record<Stage, string> = {
  intro: "Die Verifikation wartet geduldig darauf, dass Sie sich sammeln.",
  map: "Exakte Distanzhinweise sind eine seltene Form amtlicher Freundlichkeit.",
  captcha: "Wenn Sie den sichtbaren Code sauber lesen, ist diese Stufe loesbar.",
  checksum: "Jetzt hilft sauberes Rechnen mehr als Hoffnung.",
  memory: "Ein kurzer Blick kann ausreichen, wenn man ihn ernst nimmt.",
  puzzle: "Hektik bewegt viele Kacheln, aber nicht unbedingt die richtigen.",
  code: "Wer den Code wirklich gemerkt hat, muss jetzt nur noch ruhig bleiben.",
  hotline: "Die letzte Huerde ist oft nur Timing mit formaler Ernsthaftigkeit.",
  jumpscare: "Der Verifikator bleibt dramatisch, auch wenn Sie bereits gewonnen haben.",
  download: "Amtliche Anerkennung ist selten herzlich, aber sie zaehlt.",
};

const lungauTargets: HiddenMapLocation[] = [
  { name: "Tamsweg", coords: [47.1284, 13.8116] },
  { name: "Mauterndorf", coords: [47.1347, 13.6767] },
  { name: "Mariapfarr", coords: [47.1501, 13.7444] },
  { name: "St. Michael im Lungau", coords: [47.0997, 13.6398] },
  { name: "Zederhaus", coords: [47.1582, 13.5053] },
  { name: "Ramingstein", coords: [47.074, 13.834] },
  { name: "Weisspriach", coords: [47.1876, 13.6423] },
  { name: "Unternberg", coords: [47.1124, 13.7411] },
];

const captchaAssets: CaptchaAsset[] = Object.entries(captchaImageModules)
  .map(([path, url]) => ({
    code: path.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").toUpperCase(),
    url,
  }))
  .sort((left, right) => left.code.localeCompare(right.code));

const activeTimeouts: number[] = [];
const activeIntervals: number[] = [];

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App element not found");
}

const appRoot = app;

function createBaseState(): AppState {
  return {
    stage: "intro",
    restartCount: 0,
    lastResetReason: "",
    introHoldUntil: Date.now() + 1500,
    mapTargetName: "",
    mapTargetLat: 0,
    mapTargetLng: 0,
    mapClues: [],
    captchaExpectedCode: "",
    captchaImageUrl: "",
    checksumTarget: 0,
    checksumDeadlineAt: 0,
    memoryCode: "",
    memoryRevealUntil: 0,
    puzzleTiles: [...solvedPuzzle],
    puzzleMoves: 0,
    puzzleDeadlineAt: 0,
    codeEntryDeadlineAt: 0,
    hotlineReadyAt: 0,
    hotlineDeadlineAt: 0,
  };
}

function isStage(value: unknown): value is Stage {
  return (
    value === "intro" ||
    value === "map" ||
    value === "captcha" ||
    value === "checksum" ||
    value === "memory" ||
    value === "puzzle" ||
    value === "code" ||
    value === "hotline" ||
    value === "jumpscare" ||
    value === "download"
  );
}

function loadState(): AppState {
  const fallback = createBaseState();
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;

    return {
      ...fallback,
      ...parsed,
      stage: isStage(parsed.stage) ? parsed.stage : fallback.stage,
      mapClues: Array.isArray(parsed.mapClues)
        ? parsed.mapClues
            .filter(
              (value): value is MapClue =>
                typeof value === "object" &&
                value !== null &&
                typeof value.referenceName === "string" &&
                typeof value.distanceKm === "number",
            )
        : fallback.mapClues,
      puzzleTiles:
        Array.isArray(parsed.puzzleTiles) && parsed.puzzleTiles.length === 9
          ? parsed.puzzleTiles
          : fallback.puzzleTiles,
    };
  } catch {
    return fallback;
  }
}

let state = loadState();

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setHTML(html: string) {
  appRoot.innerHTML = html;
}

function escapeHTML(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clearScheduledWork() {
  while (activeTimeouts.length > 0) {
    const timeout = activeTimeouts.pop();

    if (timeout !== undefined) {
      window.clearTimeout(timeout);
    }
  }

  while (activeIntervals.length > 0) {
    const interval = activeIntervals.pop();

    if (interval !== undefined) {
      window.clearInterval(interval);
    }
  }
}

function scheduleTimeout(callback: () => void, delayMs: number) {
  const timeout = window.setTimeout(() => {
    const index = activeTimeouts.indexOf(timeout);

    if (index >= 0) {
      activeTimeouts.splice(index, 1);
    }

    callback();
  }, delayMs);

  activeTimeouts.push(timeout);
}

function scheduleInterval(callback: () => void, delayMs: number) {
  const interval = window.setInterval(callback, delayMs);
  activeIntervals.push(interval);
}

function decodeBirthdayLink() {
  return BIRTHDAY_LINK_DATA.map((value) => String.fromCharCode(value ^ BIRTHDAY_LINK_KEY)).join("");
}

function createConfettiMarkup(count = 30) {
  const colors = ["#f4d27b", "#d16b56", "#8cc7ff", "#9be18f", "#f08fcd"];

  return Array.from({ length: count }, (_, index) => {
    const color = colors[index % colors.length];
    const left = (index * 17) % 100;
    const delay = ((index % 7) * 0.17).toFixed(2);
    const duration = (4.2 + (index % 5) * 0.45).toFixed(2);
    const drift = ((index % 2 === 0 ? 1 : -1) * (18 + (index % 4) * 8)).toFixed(0);
    const size = 8 + (index % 4) * 4;
    const rotation = (index * 29) % 360;

    return `<span class="confetti-piece" style="--confetti-color:${color};--confetti-left:${left}%;--confetti-delay:${delay}s;--confetti-duration:${duration}s;--confetti-drift:${drift}px;--confetti-size:${size}px;--confetti-rotate:${rotation}deg;"></span>`;
  }).join("");
}

function renderFloatingChrome() {
  return `
    <div class="floating-chrome">
      <div id="deadlineBanner" class="floating-panel timer-panel">
        <span class="floating-label">Aktive Frist</span>
        <span id="deadlineLabel" class="floating-value">Keine aktive Frist</span>
        <strong id="deadlineValue" class="floating-countdown">--:--</strong>
      </div>
      <div class="floating-panel tip-panel">
        <span class="floating-label">Amtlicher Motivationstipp</span>
        <strong id="tooltipText" class="floating-tip"></strong>
      </div>
    </div>
  `;
}

function setScreen(screenHtml: string) {
  setHTML(`${renderFloatingChrome()}${screenHtml}`);
  mountFloatingChrome();
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function introHoldMs(restartCount: number) {
  return Math.min(12000, INTRO_BASE_HOLD_MS + restartCount * 1200);
}

function shuffleArray<T>(values: T[]) {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }

  return copy;
}

function createCombinations<T>(values: T[], size: number): T[][] {
  const results: T[][] = [];

  function walk(startIndex: number, current: T[]) {
    if (current.length === size) {
      results.push([...current]);
      return;
    }

    for (let index = startIndex; index <= values.length - (size - current.length); index += 1) {
      current.push(values[index]);
      walk(index + 1, current);
      current.pop();
    }
  }

  walk(0, []);
  return results;
}

function getDistanceKm(a: L.LatLngExpression, b: L.LatLngExpression) {
  return L.latLng(a).distanceTo(L.latLng(b)) / 1000;
}

function getLungauMapBounds() {
  return L.latLngBounds(lungauTargets.map((location) => location.coords)).pad(LUNGAU_MAP_PADDING_RATIO);
}

function captchaCodeValue(code: string) {
  return code
    .toUpperCase()
    .split("")
    .reduce((sum, char) => {
      if (/\d/.test(char)) {
        return sum + Number(char);
      }

      if (/[A-Z]/.test(char)) {
        return sum + char.charCodeAt(0) - 64;
      }

      return sum;
    }, 0);
}

function getCaptchaAssetByCode(code: string) {
  return captchaAssets.find((asset) => asset.code === code);
}

function countNameLetters(name: string) {
  return name.replace(/[^A-Za-zÄÖÜäöüß]/g, "").length;
}

function createMemoryCode() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

function chooseMapTarget() {
  return lungauTargets[Math.floor(Math.random() * lungauTargets.length)];
}

function buildUniqueMapClues(target: HiddenMapLocation) {
  const otherLocations = lungauTargets.filter((location) => location.name !== target.name);
  const candidateCombos = [
    ...shuffleArray(createCombinations(otherLocations, 3)),
    ...shuffleArray(createCombinations(otherLocations, 4)),
  ];

  for (const combo of candidateCombos) {
    const signature = combo
      .map((reference) => getDistanceKm(target.coords, reference.coords).toFixed(2))
      .join("|");

    const isUnique = lungauTargets
      .filter((location) => location.name !== target.name)
      .every((location) => {
        const candidateSignature = combo
          .map((reference) => getDistanceKm(location.coords, reference.coords).toFixed(2))
          .join("|");

        return candidateSignature !== signature;
      });

    if (isUnique) {
      return combo.map((reference) => ({
        referenceName: reference.name,
        distanceKm: getDistanceKm(target.coords, reference.coords),
      }));
    }
  }

  return otherLocations.slice(0, 3).map((reference) => ({
    referenceName: reference.name,
    distanceKm: getDistanceKm(target.coords, reference.coords),
  }));
}

function buildCaptchaChallenge() {
  const asset = captchaAssets[Math.floor(Math.random() * captchaAssets.length)];

  if (!asset) {
    throw new Error("No captcha assets available");
  }

  return {
    captchaExpectedCode: asset.code,
    captchaImageUrl: asset.url,
  };
}

function calculateChecksum(mapClues: MapClue[], targetName: string, captchaCode: string) {
  const roundedDistanceSum = mapClues.reduce((sum, clue) => sum + Math.round(clue.distanceKm), 0);
  return roundedDistanceSum + countNameLetters(targetName) - captchaCodeValue(captchaCode);
}

function buildSessionChallenge() {
  const target = chooseMapTarget();
  const mapClues = buildUniqueMapClues(target);
  const captchaChallenge = buildCaptchaChallenge();
  const memoryCode = createMemoryCode();

  return {
    mapTargetName: target.name,
    mapTargetLat: target.coords[0],
    mapTargetLng: target.coords[1],
    mapClues,
    ...captchaChallenge,
    checksumTarget: calculateChecksum(mapClues, target.name, captchaChallenge.captchaExpectedCode),
    memoryCode,
  };
}

function getCurrentTip() {
  return stageTips[state.stage] || encouragementTips[state.restartCount % encouragementTips.length];
}

function getFloatingTimer(): null | FloatingTimer {
  const now = Date.now();

  if (state.stage === "intro" && state.introHoldUntil > now) {
    return {
      label: "Freigabe in",
      value: formatCountdown(state.introHoldUntil - now),
    };
  }

  if (state.stage === "checksum") {
    return {
      danger: true,
      label: "Pruefsumme verfällt in",
      value: formatCountdown(state.checksumDeadlineAt - now),
    };
  }

  if (state.stage === "memory") {
    return {
      danger: true,
      label: "Code sichtbar fuer",
      value: formatCountdown(state.memoryRevealUntil - now),
    };
  }

  if (state.stage === "puzzle") {
    return {
      danger: true,
      label: "Puzzle verfällt in",
      value: formatCountdown(state.puzzleDeadlineAt - now),
    };
  }

  if (state.stage === "code") {
    return {
      danger: true,
      label: "Codeeingabe verfällt in",
      value: formatCountdown(state.codeEntryDeadlineAt - now),
    };
  }

  if (state.stage === "hotline") {
    if (state.hotlineReadyAt > now) {
      return {
        label: "Freigabe in",
        value: formatCountdown(state.hotlineReadyAt - now),
      };
    }

    return {
      danger: true,
      label: "Antwortfrist endet in",
      value: formatCountdown(state.hotlineDeadlineAt - now),
    };
  }

  return null;
}

function mountFloatingChrome() {
  updateFloatingChrome();
  scheduleInterval(() => {
    updateFloatingChrome();
    updateLiveStageUi();
  }, 250);
}

function updateFloatingChrome() {
  const deadlineBanner = document.querySelector<HTMLDivElement>("#deadlineBanner");
  const deadlineLabel = document.querySelector<HTMLSpanElement>("#deadlineLabel");
  const deadlineValue = document.querySelector<HTMLElement>("#deadlineValue");
  const tooltipText = document.querySelector<HTMLElement>("#tooltipText");
  const timer = getFloatingTimer();

  if (deadlineBanner && deadlineLabel && deadlineValue) {
    if (timer) {
      deadlineBanner.classList.toggle("is-danger", Boolean(timer.danger));
      deadlineLabel.textContent = timer.label;
      deadlineValue.textContent = timer.value;
    } else {
      deadlineBanner.classList.remove("is-danger");
      deadlineLabel.textContent = "Keine aktive Frist";
      deadlineValue.textContent = "--:--";
    }
  }

  if (tooltipText) {
    tooltipText.textContent = getCurrentTip();
  }
}

function updateLiveStageUi() {
  const now = Date.now();

  if (state.stage === "intro") {
    const countdown = document.querySelector<HTMLSpanElement>("#introCountdown");
    const remaining = Math.max(0, state.introHoldUntil - now);

    if (countdown) {
      countdown.textContent = remaining > 0 ? formatCountdown(remaining) : "keine";
    }

    if (remaining <= 0 && state.introHoldUntil !== 0) {
      patchState({
        introHoldUntil: 0,
      });
      render();
    }

    return;
  }

  if (state.stage === "checksum") {
    const remaining = state.checksumDeadlineAt - now;
    const countdown = document.querySelector<HTMLSpanElement>("#checksumCountdown");

    if (remaining <= 0) {
      forceRestart("Die Pruefsumme wurde nicht rechtzeitig eingegeben.");
      return;
    }

    if (countdown) {
      countdown.textContent = formatCountdown(remaining);
    }

    return;
  }

  if (state.stage === "memory") {
    const remaining = state.memoryRevealUntil - now;
    const countdown = document.querySelector<HTMLSpanElement>("#memoryCountdown");

    if (remaining <= 0) {
      startPuzzleStage();
      return;
    }

    if (countdown) {
      countdown.textContent = formatCountdown(remaining);
    }

    return;
  }

  if (state.stage === "puzzle") {
    const remaining = state.puzzleDeadlineAt - now;
    const countdown = document.querySelector<HTMLSpanElement>("#puzzleCountdown");

    if (remaining <= 0) {
      forceRestart("Das Schiebepuzzle wurde nicht rechtzeitig abgeschlossen.");
      return;
    }

    if (countdown) {
      countdown.textContent = formatCountdown(remaining);
    }

    return;
  }

  if (state.stage === "code") {
    const remaining = state.codeEntryDeadlineAt - now;
    const countdown = document.querySelector<HTMLSpanElement>("#codeCountdown");

    if (remaining <= 0) {
      forceRestart("Der gemerkte Sicherheitscode wurde nicht rechtzeitig eingegeben.");
      return;
    }

    if (countdown) {
      countdown.textContent = formatCountdown(remaining);
    }

    return;
  }

  if (state.stage === "hotline") {
    const readyCountdown = document.querySelector<HTMLSpanElement>("#hotlineReadyCountdown");
    const deadlineCountdown = document.querySelector<HTMLSpanElement>("#hotlineDeadlineCountdown");
    const readyRemaining = state.hotlineReadyAt - now;
    const deadlineRemaining = state.hotlineDeadlineAt - now;

    if (deadlineRemaining <= 0) {
      forceRestart("Die Antwortfrist der Hotline ist abgelaufen.");
      return;
    }

    if (readyCountdown) {
      readyCountdown.textContent = readyRemaining > 0 ? formatCountdown(readyRemaining) : "freigegeben";
    }

    if (deadlineCountdown) {
      deadlineCountdown.textContent = formatCountdown(deadlineRemaining);
    }
  }
}

function overwriteState(nextState: AppState) {
  state = nextState;
  persistState();
  render();
}

function patchState(patch: Partial<AppState>) {
  state = {
    ...state,
    ...patch,
  };
  persistState();
}

function setStage(nextStage: Stage, patch: Partial<AppState> = {}) {
  patchState({
    ...patch,
    stage: nextStage,
  });
  render();
}

function forceRestart(reason: string) {
  const nextRestartCount = state.restartCount + 1;

  overwriteState({
    ...createBaseState(),
    restartCount: nextRestartCount,
    lastResetReason: reason,
    introHoldUntil: Date.now() + introHoldMs(nextRestartCount),
  });
}

function resetEverything() {
  overwriteState({
    ...createBaseState(),
    introHoldUntil: Date.now() + 1500,
  });
}

function startMapStage() {
  const challenge = buildSessionChallenge();

  setStage("map", {
    ...challenge,
    checksumDeadlineAt: 0,
    memoryRevealUntil: 0,
    puzzleTiles: [...solvedPuzzle],
    puzzleMoves: 0,
    puzzleDeadlineAt: 0,
    codeEntryDeadlineAt: 0,
    hotlineReadyAt: 0,
    hotlineDeadlineAt: 0,
  });
}

function startCaptchaStage() {
  setStage("captcha");
}

function startChecksumStage() {
  setStage("checksum", {
    checksumDeadlineAt: Date.now() + CHECKSUM_DEADLINE_MS,
  });
}

function startMemoryStage() {
  setStage("memory", {
    memoryRevealUntil: Date.now() + MEMORY_REVEAL_MS,
  });
}

function startPuzzleStage() {
  setStage("puzzle", {
    puzzleTiles: createShuffledPuzzle(),
    puzzleMoves: 0,
    puzzleDeadlineAt: Date.now() + PUZZLE_DEADLINE_MS,
  });
}

function startCodeStage() {
  setStage("code", {
    codeEntryDeadlineAt: Date.now() + CODE_ENTRY_DEADLINE_MS,
  });
}

function startHotlineStage() {
  setStage("hotline", {
    hotlineReadyAt: Date.now() + HOTLINE_MENU_DELAY_MS,
    hotlineDeadlineAt: Date.now() + HOTLINE_MENU_DELAY_MS + HOTLINE_RESPONSE_WINDOW_MS,
  });
}

function getPuzzleTileStyle(tile: number) {
  const sourceIndex = tile - 1;
  const row = Math.floor(sourceIndex / 3);
  const col = sourceIndex % 3;

  return `--bg-x:${col * 50}%; --bg-y:${row * 50}%; background-image:url('${puzzleImageUrl}');`;
}

function getInversionCount(values: number[]) {
  let inversions = 0;

  for (let index = 0; index < values.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < values.length; compareIndex += 1) {
      if (values[index] !== 0 && values[compareIndex] !== 0 && values[index] > values[compareIndex]) {
        inversions += 1;
      }
    }
  }

  return inversions;
}

function isPuzzleSolvable(values: number[]) {
  return getInversionCount(values) % 2 === 0;
}

function isPuzzleSolved(values: number[]) {
  return values.every((value, index) => value === solvedPuzzle[index]);
}

function createShuffledPuzzle() {
  let candidate = shuffleArray(solvedPuzzle);

  while (!isPuzzleSolvable(candidate) || isPuzzleSolved(candidate)) {
    candidate = shuffleArray(solvedPuzzle);
  }

  return candidate;
}

function canMovePuzzleTile(index: number, values: number[]) {
  const blankIndex = values.indexOf(0);
  const rowDelta = Math.abs(Math.floor(blankIndex / 3) - Math.floor(index / 3));
  const colDelta = Math.abs((blankIndex % 3) - (index % 3));

  return rowDelta + colDelta === 1;
}

function movePuzzleTile(index: number, values: number[]) {
  if (!canMovePuzzleTile(index, values)) {
    return null;
  }

  const blankIndex = values.indexOf(0);
  const nextValues = [...values];
  const current = nextValues[index];
  nextValues[index] = 0;
  nextValues[blankIndex] = current;
  return nextValues;
}

function render() {
  clearScheduledWork();

  if (state.stage === "intro") {
    renderIntro();
    return;
  }

  if (state.stage === "map") {
    renderMap();
    return;
  }

  if (state.stage === "captcha") {
    renderCaptcha();
    return;
  }

  if (state.stage === "checksum") {
    renderChecksum();
    return;
  }

  if (state.stage === "memory") {
    renderMemory();
    return;
  }

  if (state.stage === "puzzle") {
    renderPuzzle();
    return;
  }

  if (state.stage === "code") {
    renderCode();
    return;
  }

  if (state.stage === "hotline") {
    renderHotline();
    return;
  }

  if (state.stage === "jumpscare") {
    renderJumpscare();
    return;
  }

  renderDownload();
}

function renderIntro() {
  const remainingMs = Math.max(0, state.introHoldUntil - Date.now());
  const startDisabled = remainingMs > 0;

  setScreen(`
    <main class="screen">
      <div class="card">
        <div class="card-header">
          <span class="eyebrow">Verifikationsamt Nord / Regelwerk 43-HF</span>
          <span class="badge">${state.restartCount} Neustart(e)</span>
        </div>
        <h1>Track-Verifikation</h1>
        <p>
          Diese Version ist hart, aber fair. Jede Aufgabe ist loesbar.
          Jede falsche Antwort oder verpasste Frist fuehrt jedoch sofort zum vollstaendigen Reset.
        </p>
        <div class="status-list">
          <div class="status-row">
            <span class="status-label">Prinzip</span>
            <span class="status-value">ein Fehler = kompletter Neustart</span>
          </div>
          <div class="status-row">
            <span class="status-label">Abkuerzungen</span>
            <span class="status-value">keine</span>
          </div>
          <div class="status-row">
            <span class="status-label">Wartefrist</span>
            <span id="introCountdown" class="status-value">${startDisabled ? formatCountdown(remainingMs) : "keine"}</span>
          </div>
        </div>
        ${
          state.lastResetReason
            ? `<div class="notice danger-notice">${escapeHTML(state.lastResetReason)}</div>`
            : `<div class="notice">Hinweis: Randomes Durchklicken bringt Sie nicht bis ans Ende.</div>`
        }
        <button id="start" ${startDisabled ? "disabled" : ""}>
          ${startDisabled ? "Freigabe abwarten" : "Verifikation starten"}
        </button>
      </div>
    </main>
  `);

  document.querySelector<HTMLButtonElement>("#start")?.addEventListener("click", () => {
    if (Date.now() < state.introHoldUntil) {
      return;
    }

    startMapStage();
  });
}

function renderMap() {
  setScreen(`
    <main class="screen">
      <div class="card wide">
        <div class="card-header">
          <span class="eyebrow">Schritt 1 / 6</span>
          <span class="badge">Kartografische Vorpruefung</span>
        </div>
        <h1>Ort im Lungau bestimmen</h1>
        <p>
          Der Zielort bleibt waehrend dieses Durchlaufs gleich. Die Karte ist fixiert.
          Klicken Sie direkt auf die richtige markierte Ortschaft. Ein falscher Ort beendet den Run sofort.
        </p>
        <div class="status-list compact">
          ${state.mapClues
            .map(
              (clue) => `
                <div class="status-row">
                  <span class="status-label">${escapeHTML(clue.referenceName)}</span>
                  <span class="status-value">${clue.distanceKm.toFixed(2)} km entfernt</span>
                </div>
              `,
            )
            .join("")}
        </div>
        <div id="map"></div>
        <p class="feedback">Die Distanzhinweise sind exakt. Mehr Kulanz erhalten Sie hier nicht.</p>
      </div>
    </main>
  `);

  const map = L.map("map", {
    boxZoom: false,
    doubleClickZoom: false,
    dragging: false,
    keyboard: false,
    scrollWheelZoom: false,
    touchZoom: false,
    zoomControl: false,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19,
  }).addTo(map);

  const lungauBounds = getLungauMapBounds();

  map.fitBounds(lungauBounds, {
    padding: [28, 28],
  });
  map.setMaxBounds(lungauBounds);

  const lockedZoom = map.getZoom();
  map.setMinZoom(lockedZoom);
  map.setMaxZoom(lockedZoom);

  lungauTargets.forEach((location) => {
    const marker = L.circleMarker(location.coords, {
      color: "#c4892e",
      fillColor: "#f3ddae",
      fillOpacity: 0.95,
      radius: 8,
      weight: 2,
    }).addTo(map);

    marker.bindTooltip(location.name, {
      className: "map-label",
      direction: "top",
      offset: [0, -12],
      permanent: true,
    });

    marker.on("click", () => {
      const targetCoords: [number, number] = [state.mapTargetLat, state.mapTargetLng];

      if (location.name === state.mapTargetName) {
        startCaptchaStage();
        return;
      }

      forceRestart(
        `Falscher Ort: ${location.name}. Ihre Auswahl lag ${getDistanceKm(location.coords, targetCoords).toFixed(2)} km von der internen Referenz entfernt.`,
      );
    });
  });
}

function renderCaptcha() {
  const asset = getCaptchaAssetByCode(state.captchaExpectedCode);
  const imageUrl = state.captchaImageUrl || asset?.url || "";

  setScreen(`
    <main class="screen">
      <div class="card">
        <div class="card-header">
          <span class="eyebrow">Schritt 2 / 6</span>
          <span class="badge">Code-Captcha</span>
        </div>
        <h1>Code vom Bild eingeben</h1>
        <p>
          Genau ein Bild wird angezeigt. Lesen Sie den Code auf dem Bild und geben Sie ihn exakt ein.
          Eine falsche Eingabe beendet den Run sofort.
        </p>
        <div class="captcha-single">
          <div class="captcha-card">
            <img
              class="captcha-image captcha-image-large"
              src="${imageUrl}"
              alt="Captcha-Code"
            />
          </div>
        </div>
        <form id="captchaForm">
          <label class="input-label" for="captchaInput">Code aus dem Bild</label>
          <input id="captchaInput" autocomplete="off" placeholder="sichtbaren Code eingeben" />
          <button type="submit">Code bestaetigen</button>
        </form>
        <p id="captchaFeedback" class="feedback">Der Verifikator akzeptiert nur die exakt sichtbare Zeichenfolge.</p>
      </div>
    </main>
  `);

  document.querySelector<HTMLFormElement>("#captchaForm")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const input = document.querySelector<HTMLInputElement>("#captchaInput");
    const value = input?.value.trim().toUpperCase() || "";

    if (value === state.captchaExpectedCode) {
      startChecksumStage();
      return;
    }

    forceRestart(`Falscher Captcha-Code: ${value || "(leer)"}.`);
  });
}

function renderChecksum() {
  const remainingMs = state.checksumDeadlineAt - Date.now();

  if (remainingMs <= 0) {
    forceRestart("Die Pruefsumme wurde nicht rechtzeitig eingegeben.");
    return;
  }

  const roundedDistances = state.mapClues.map((clue) => Math.round(clue.distanceKm));
  const roundedDistanceSum = roundedDistances.reduce((sum, value) => sum + value, 0);
  const targetLetters = countNameLetters(state.mapTargetName);

  setScreen(`
    <main class="screen">
      <div class="card">
        <div class="card-header">
          <span class="eyebrow">Schritt 3 / 6</span>
          <span class="badge">Pruefsumme</span>
        </div>
        <h1>Session-Pruefsumme berechnen</h1>
        <p>
          Rechnen Sie sauber. Die benoetigten Werte stehen hier. Eine falsche Zahl oder ein Fristablauf setzt alles zurueck.
        </p>
        <p>
          Tragen Sie unten die eine resultierende ganze Zahl ein, die sich aus der Zeile <span class="mono">Gesucht</span> ergibt.
        </p>
        <div class="status-list">
          <div class="status-row">
            <span class="status-label">Gerundete Distanzwerte</span>
            <span class="status-value">${roundedDistances.join(" + ")} = ${roundedDistanceSum}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Ortsname ohne Leerzeichen</span>
            <span class="status-value">${escapeHTML(state.mapTargetName)} = ${targetLetters}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Codewert des Captcha-Codes</span>
            <span class="status-value">${captchaCodeValue(state.captchaExpectedCode)}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Gesucht</span>
            <span class="status-value">${roundedDistanceSum} + ${targetLetters} - ${captchaCodeValue(state.captchaExpectedCode)}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Restzeit</span>
            <span id="checksumCountdown" class="status-value">${formatCountdown(remainingMs)}</span>
          </div>
        </div>
        <form id="checksumForm">
          <label class="input-label" for="checksumInput">Pruefsumme</label>
          <input id="checksumInput" inputmode="numeric" autocomplete="off" placeholder="ganze Zahl" />
          <button type="submit">Pruefsumme bestaetigen</button>
        </form>
        <p class="feedback">Der Verifikator akzeptiert nur die exakt richtige Zahl.</p>
      </div>
    </main>
  `);

  document.querySelector<HTMLFormElement>("#checksumForm")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const input = document.querySelector<HTMLInputElement>("#checksumInput");
    const normalized = Number(input?.value.trim() || "NaN");

    if (Number.isFinite(normalized) && normalized === state.checksumTarget) {
      startMemoryStage();
      return;
    }

    forceRestart(`Falsche Pruefsumme: ${input?.value.trim() || "(leer)"}.`);
  });
}

function renderMemory() {
  const remainingMs = state.memoryRevealUntil - Date.now();

  if (remainingMs <= 0) {
    startPuzzleStage();
    return;
  }

  setScreen(`
    <main class="screen">
      <div class="card">
        <div class="card-header">
          <span class="eyebrow">Schritt 4 / 6</span>
          <span class="badge">Merkcode</span>
        </div>
        <h1>Lokalen Sicherheitscode merken</h1>
        <p>
          Der folgende Code wird kurz angezeigt und spaeter erneut abgefragt. Der Verifikator geht davon aus, dass Sie vorbereitet sind.
        </p>
        <div class="memory-code mono">${state.memoryCode}</div>
        <div class="status-list">
          <div class="status-row">
            <span class="status-label">Sichtbar fuer</span>
            <span id="memoryCountdown" class="status-value">${formatCountdown(remainingMs)}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Naechster Schritt</span>
            <span class="status-value">Schiebepuzzle unter Zeitdruck</span>
          </div>
        </div>
        <div class="notice">Der Code wird nicht erneut angezeigt. Das ist Absicht.</div>
      </div>
    </main>
  `);
}

function renderPuzzle() {
  const remainingMs = state.puzzleDeadlineAt - Date.now();

  if (remainingMs <= 0) {
    forceRestart("Das Schiebepuzzle wurde nicht rechtzeitig abgeschlossen.");
    return;
  }

  setScreen(`
    <main class="screen">
      <div class="card">
        <div class="card-header">
          <span class="eyebrow">Schritt 5 / 6</span>
          <span class="badge">${state.puzzleMoves} Zug(e)</span>
        </div>
        <h1>Schiebepuzzle abschliessen</h1>
        <p>
          Loesen Sie das Puzzle innerhalb der Frist. Falsche Kachelklicks sind erlaubt, helfen aber erfahrungsgemaess nicht.
        </p>
        <div class="status-list">
          <div class="status-row">
            <span class="status-label">Restzeit</span>
            <span id="puzzleCountdown" class="status-value">${formatCountdown(remainingMs)}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Bildquelle</span>
            <span class="status-value">interne Referenz 112</span>
          </div>
        </div>
        <div class="puzzle-board">
          ${state.puzzleTiles
            .map((tile, index) => {
              if (tile === 0) {
                return `<button type="button" class="puzzle-tile blank" data-index="${index}" aria-label="Leeres Feld"></button>`;
              }

              return `
                <button
                  type="button"
                  class="puzzle-tile"
                  data-index="${index}"
                  aria-label="Puzzleteil ${tile}"
                  style="${getPuzzleTileStyle(tile)}"
                ></button>
              `;
            })
            .join("")}
        </div>
        <p class="feedback">Ein nicht geloestes Puzzle ist keine gueltige Ausrede.</p>
      </div>
    </main>
  `);

  document.querySelectorAll<HTMLButtonElement>(".puzzle-tile").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const nextTiles = movePuzzleTile(index, state.puzzleTiles);

      if (!nextTiles) {
        return;
      }

      const nextMoves = state.puzzleMoves + 1;

      patchState({
        puzzleTiles: nextTiles,
        puzzleMoves: nextMoves,
      });

      render();

      if (isPuzzleSolved(nextTiles)) {
        scheduleTimeout(() => {
          startCodeStage();
        }, 900);
      }
    });
  });
}

function renderCode() {
  const remainingMs = state.codeEntryDeadlineAt - Date.now();

  if (remainingMs <= 0) {
    forceRestart("Der gemerkte Sicherheitscode wurde nicht rechtzeitig eingegeben.");
    return;
  }

  setScreen(`
    <main class="screen">
      <div class="card">
        <div class="card-header">
          <span class="eyebrow">Schritt 6 / 6</span>
          <span class="badge">Codeeingabe</span>
        </div>
        <h1>Gemerkten Code erneut eingeben</h1>
        <p>
          Geben Sie den vorher sichtbaren Code jetzt exakt ein. Ein einziger falscher Code beendet den gesamten Durchlauf sofort.
        </p>
        <div class="status-list">
          <div class="status-row">
            <span class="status-label">Restzeit</span>
            <span id="codeCountdown" class="status-value">${formatCountdown(remainingMs)}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Codeformat</span>
            <span class="status-value">6-stellig</span>
          </div>
        </div>
        <form id="codeForm">
          <label class="input-label" for="codeInput">Sicherheitscode</label>
          <input id="codeInput" inputmode="numeric" autocomplete="off" placeholder="000000" />
          <button type="submit">Code bestaetigen</button>
        </form>
        <p class="feedback">Der Verifikator toleriert hier keinen zweiten Versuch.</p>
      </div>
    </main>
  `);

  document.querySelector<HTMLFormElement>("#codeForm")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const input = document.querySelector<HTMLInputElement>("#codeInput");
    const value = input?.value.trim() || "";

    if (value === state.memoryCode) {
      startHotlineStage();
      return;
    }

    forceRestart(`Falscher Sicherheitscode: ${value || "(leer)"}.`);
  });
}

function renderHotline() {
  const now = Date.now();
  const readyRemaining = state.hotlineReadyAt - now;
  const deadlineRemaining = state.hotlineDeadlineAt - now;

  if (deadlineRemaining <= 0) {
    forceRestart("Die Antwortfrist der Hotline ist abgelaufen.");
    return;
  }

  setScreen(`
    <main class="screen">
      <div class="card">
        <div class="card-header">
          <span class="eyebrow">Abschlusspruefung</span>
          <span class="badge">Verifikationshotline</span>
        </div>
        <h1>Auf Ansage warten und 1 druecken</h1>
        <p class="robot">
          Willkommen beim automatisierten Hilfesystem. Wenn Sie ein Problem haben, druecken Sie die 1.
          Vorzeitige oder falsche Eingaben werden als endgueltiger Bedienfehler gewertet.
        </p>
        <div class="status-list">
          <div class="status-row">
            <span class="status-label">Freigabe</span>
            <span id="hotlineReadyCountdown" class="status-value">${readyRemaining > 0 ? formatCountdown(readyRemaining) : "freigegeben"}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Antwortfrist</span>
            <span id="hotlineDeadlineCountdown" class="status-value">${formatCountdown(deadlineRemaining)}</span>
          </div>
        </div>
        <div class="keypad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
            .map((key) => `<button class="key" data-key="${key}">${key}</button>`)
            .join("")}
        </div>
        <p class="feedback">Genau eine Taste ist zur richtigen Zeit richtig.</p>
      </div>
    </main>
  `);

  document.querySelectorAll<HTMLButtonElement>(".key").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key;
      const currentTime = Date.now();

      if (currentTime < state.hotlineReadyAt) {
        forceRestart("Zu frueh gedrueckt. Die Ansage war noch nicht freigegeben.");
        return;
      }

      if (currentTime > state.hotlineDeadlineAt) {
        forceRestart("Die Antwortfrist der Hotline ist abgelaufen.");
        return;
      }

      if (key !== "1") {
        forceRestart(`Falsche Taste: ${key}. Die Ansage verlangte eindeutig die 1.`);
        return;
      }

      setStage("jumpscare");
    });
  });
}

function renderJumpscare() {
  setHTML(`
    <main class="screen danger jump-screen">
      <img class="jump-photo jump-photo-fullscreen" src="${birthdayPhotoUrl}" alt="Interne Alarmstufe" />
    </main>
  `);

  scheduleTimeout(() => {
    setStage("download");
  }, 1700);
}

function renderDownload() {
  setScreen(`
    <main class="screen celebration-screen">
      <div class="confetti-layer" aria-hidden="true">
        ${createConfettiMarkup()}
      </div>
      <div class="card celebration-card">
        <div class="card-header">
          <span class="eyebrow">Abschlussfreigabe</span>
          <span class="badge">erfolgreich</span>
        </div>
        <h1 class="birthday-title">Happy Birthday</h1>
        <p>
          Sie haben den kompletten Durchlauf ohne Fehler bestanden. Das System erkennt Ihre Leistung widerwillig an und leitet Sie jetzt zur eigentlichen Ueberraschung weiter.
        </p>
        <div class="notice">Offizieller Status: bestanden. Art des Bestehens: hart, aber fair.</div>
        <button id="birthdayLink" class="download">Zur Geburtstagsueberraschung</button>
        <button id="reset" class="secondary">Neuen Durchlauf starten</button>
      </div>
    </main>
  `);

  document.querySelector<HTMLButtonElement>("#birthdayLink")?.addEventListener("click", () => {
    window.location.assign(decodeBirthdayLink());
  });

  document.querySelector<HTMLButtonElement>("#reset")?.addEventListener("click", () => {
    resetEverything();
  });
}

render();
