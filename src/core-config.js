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
let scale = 0.5;

// These will be set by the resizeCanvas function below
let playheadX; 
let Y_CENTERED;

// Initialize the size immediately
resizeCanvas();
// Update if the OBS source is dragged/resized
window.addEventListener('resize', resizeCanvas);

// 0 = default (hardcoded osu! colors)
// 1 = beatmap colors (from .osu file)
// 2 = skin colors (from skin.ini via tosu)
// We default to 1 so existing behavior stays the same until you change it.
let ComboColorSource = 2;

const COLORIZE_SLIDER_BODY = false;
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
const MIN_KEY_PRESS_DURATION_MS = 65; // Minimum time duration in ms guaranteed to render
const MIN_KEY_PRESS_LENGTH_PX = 24;   // Minimum visual line length in pixels regardless of click brevity   

const TITLE_FONT_SIZE = 50;

// ──────── TOSU CONNECTION CONFIG ────────
const urlParams = new URLSearchParams(window.location.search);
const storedHost = (typeof localStorage !== 'undefined') ? localStorage.getItem('osu_tosu_host') : null;

const tosuConfig = {
    host: urlParams.get('host') || storedHost || '127.0.0.1:24050',
    isSecure: urlParams.get('secure') === 'true' || urlParams.get('wss') === 'true',
    isHttps: window.location.protocol === 'https:',
    hideStatus: urlParams.get('hideStatus') === '1' || urlParams.get('hideStatus') === 'true',
    get wsBase() {
        return (this.isSecure ? 'wss://' : 'ws://') + this.host;
    },
    get httpBase() {
        return (this.isSecure ? 'https://' : 'http://') + this.host;
    }
};

let isTosuConnected = false;
let tosuConnectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let connectionRetryCount = 0;
let hasLoggedHttpsWarning = false;

let wsCommon = null;
let wsPrecise = null;

let hitObjects = [];
let timingPoints = [];
let beatmapComboColors = [];
let beatmapOD = 8.0;
let hitWindow50 = 119.5;
let hitWindow100 = 75.5;
let hitWindow300 = 31.5;
let beatmapSliderTickRate = 1.0;
let lastChecksum = '';
let mapTitle = 'Waiting for map...';
let titleLines = [];

let sliderTrackOverride = [20, 20, 20];
let sliderBorder = [255, 255, 255];
let sliderStyle = 2;

let gameStateName = 'Menu';
let lastReceiveTime = performance.now();

let hitErrorCount = 0;

let lastCommonLiveTime = 0;
let lastCommonRealTime = 0;
let currentSpeed = 1.0;

let keyStrokes = [];
let activeStrokes = { k1: null, k2: null, m1: null, m2: null };
let lastCounts = { k1: 0, k2: 0, m1: 0, m2: 0 };
let keyBoxStates = { k1: false, k2: false, m1: false, m2: false };

let hitCircleImg = null;
let hitCircleOverlayImg = null;
let hasHitCircleTexture = false;
let hasHitCircleOverlayImg = false;
let hitCircleCombinedImg = null;
let isLoadingTextures = false;

let hasSliderTickTexture = false;
let hasSliderBodyTexture = false;
let sliderBodyImg = null;
let sliderTickImg = null;
let lastSkinFolder = '';

let skinComboColors = [];
let comboColors = [];
let tintedHitCircles = [];
let tintedSliderTicks = [];
let tintedSliderBodies = [];

const sliderBuffer = document.createElement('canvas');
const sctx = sliderBuffer.getContext('2d');

let judgmentDiameterPx = 0;

let isNewBeatmap = false;
let isNewSkin = false;

const DEFAULT_COMBO_COLORS = [
    { r: 255, g: 192, b: 0 },
    { r: 0,   g: 202, b: 0 },
    { r: 18,  g: 124, b: 255 },
    { r: 242, g: 24,  b: 57 }
];

let lastCombo = 0;
let ourDetectedMissCount = 0;