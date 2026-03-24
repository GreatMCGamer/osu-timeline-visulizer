// ──────── CORE CONFIGURATION ────────
// This section holds all constants, user settings, DOM elements, and global state variables.

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// ──────── USER CONFIG ────────
const SPEED_MULTIPLIER = 1.0;
let scale = 0.6;
let playheadX = 2669;

const COLORIZE_SLIDER_BODY = false; 
let useBeatmapCombos = true;
const TEXTURE_SCALE = 0.4;
const SPINNER_BAR_HEIGHT = 40;

const TARGET_FPS = 480;
const SHOW_DEBUG_PANEL = false;

// ──────── KEYPRESS VISUALIZATION CONFIG ────────
const KEY_LINE_THICKNESS = 20;
const KEY_BOX_SIZE = 24;
const KEY_BOX_Y = 25;         // Y position of the first lane (k1/m1)
const KEY_BOX_SPACING = 30;   // Vertical space between lane 1 and lane 2

const KEY_BOX_Y_CENTERED = canvas.height / 2;

const TITLE_FONT_SIZE = 50;

// Align all elements with KEY_BOX_Y_CENTERED
const CIRCLE_Y = KEY_BOX_Y_CENTERED;
const SLIDER_Y = KEY_BOX_Y_CENTERED;
const SPINNER_Y = KEY_BOX_Y_CENTERED;
const PLAYHEAD_Y_START = KEY_BOX_Y_CENTERED - 45;
const PLAYHEAD_Y_END = KEY_BOX_Y_CENTERED + 45;
const TITLE_Y = KEY_BOX_Y_CENTERED - 20;

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

const DEFAULT_COMBO_COLORS = [
    { r: 255, g: 192, b: 0 },
    { r: 0,   g: 202, b: 0 },
    { r: 18,  g: 124, b: 255 },
    { r: 242, g: 24,  b: 57 }
];

let lastCombo = 0;
let ourDetectedMissCount = 0;