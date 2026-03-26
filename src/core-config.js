// ──────── CORE CONFIGURATION ────────
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// NEW: This function handles the OBS browser source sizing automatically
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Update dependent variables whenever size changes
    playheadX = canvas.width * 0.75; 
    Y_CENTERED = canvas.height / 2;
}

// ──────── USER CONFIG ────────
const SPEED_MULTIPLIER = 1.0;
let scale = 0.5;

// These will be set by the resizeCanvas function below
let playheadX; 
let Y_CENTERED;

// Initialize the size immediately
resizeCanvas();
// Update if the OBS source is dragged/resized
window.addEventListener('resize', resizeCanvas);

const COLORIZE_SLIDER_BODY = false; 
let useBeatmapCombos = true;
const TEXTURE_SCALE = 0.4;
const SPINNER_BAR_HEIGHT = 40;

const TARGET_FPS = 480;
const SHOW_DEBUG_PANEL = false;
const SHOW_JUDGMENT_BARS = false;

// ──────── KEYPRESS VISUALIZATION CONFIG ────────
const KEY_LINE_THICKNESS = 20;
const KEY_BOX_SIZE = 24;
const KEY_BOX_Y = 25;         
const KEY_BOX_SPACING = 60;   

const TITLE_FONT_SIZE = 50;

const sliderBuffer = document.createElement('canvas');
const sctx = sliderBuffer.getContext('2d');

let wsCommon;
let wsPrecise;

let hitObjects = [];
let timingPoints = [];
let beatmapComboColors = [];
let beatmapOD = 8.0;
let beatmapSliderTickRate = 1.0;
let lastChecksum = '';
let mapTitle = 'Waiting for map...';

let sliderTrackOverride = [20, 20, 20];
let sliderBorder = [255, 255, 255];
let sliderStyle = 2;

let gameStateName = 'Menu';
let lastReceiveTime = performance.now();

let lastPreciseTime = 0;
let lastPreciseRealTime = 0;
let hitErrorCount = 0;

let lastCommonLiveTime = 0;
let lastCommonRealTime = 0;
let currentSpeed = 1.0;
let lastLiveTimeChangeReal = performance.now();
let speedAccumTosu = 0;
let speedAccumReal = 0;

let isTimelineLocked = false;
let lockedBaseTime = 0;
let lockedBaseRealTime = 0;
let lockedCurrentSpeed = 1.0;

let keyStrokes = [];
let activeStrokes = { k1: null, k2: null, m1: null, m2: null };
let lastCounts = { k1: 0, k2: 0, m1: 0, m2: 0 };
let keyBoxStates = { k1: false, k2: false, m1: false, m2: false };

let hitCircleImg = null;
let hitCircleOverlayImg = null;
let defaultTintedHitCircles = [];
let beatmapTintedHitCircles = [];
let hasHitCircleTexture = false;

let sliderTickImg = null;
let defaultTintedSliderTicks = [];
let beatmapTintedSliderTicks = [];
let hasSliderTickTexture = false;

let isNewBeatmap = false;

const DEFAULT_COMBO_COLORS = [
    { r: 255, g: 192, b: 0 },
    { r: 0,   g: 202, b: 0 },
    { r: 18,  g: 124, b: 255 },
    { r: 242, g: 24,  b: 57 }
];

let lastCombo = 0;
let ourDetectedMissCount = 0;