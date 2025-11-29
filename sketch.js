// --- Configuration ---
const GRID_COLS = 16;
const GRID_ROWS = 12; 
const CELL_SIZE = 40;
const HEADER_WIDTH = 60; 
const CANVAS_WIDTH = HEADER_WIDTH + (GRID_COLS * CELL_SIZE);
const CANVAS_HEIGHT = GRID_ROWS * CELL_SIZE;

// Note names
const NOTE_LABELS = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C (Lo)'];
// MIDI note numbers (Sub Bass Range)
const NOTE_MIDI = [35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24];

// --- State ---
let grid = []; 
let isPlaying = false;
let currentStep = 0;
let nextStepTime = 0;

// Arpeggiator State
let isArpActive = false;
let arpIndex = 0;
const ARP_PATTERN = [0, 3, 7, 10, 12, 10, 7, 3]; 

// Synth components
let osc, ampEnv, filter, filterEnv; 
let isAudioStarted = false;

// DOM Elements
let btnToggle, btnClear, btnRandom, btnArp; 
let sldWave, sldPort, sldTrans, sldTempo;
let sldCutoff, sldDecay, sldRes;

function setup() {
  let cnv = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  try { cnv.parent('canvas-container'); } catch (e) { console.log("Container not found"); }
  
  // Initialize Grid
  for (let c = 0; c < GRID_COLS; c++) {
    let col = [];
    for (let r = 0; r < GRID_ROWS; r++) col.push(false);
    grid.push(col);
  }

  // DOM references
  btnToggle = select('#btn-toggle');
  btnClear = select('#btn-clear');
  btnRandom = select('#btn-random');
  btnArp = select('#btn-arp'); 
  
  sldWave = select('#slider-wave');
  sldCutoff = select('#slider-cutoff');
  sldDecay = select('#slider-decay');
  sldRes = select('#slider-resonance');
  sldTempo = select('#slider-tempo');

  // Listeners
  if(btnToggle) btnToggle.mousePressed(togglePlay);
  if(btnClear) btnClear.mousePressed(clearGrid);
  if(btnRandom) btnRandom.mousePressed(randomizeGrid);
  if(btnArp) btnArp.mousePressed(toggleArp); 
  
  userStartAudio().then(() => {});
  setupSynth();
}

function setupSynth() {
  osc = new p5.Oscillator('sawtooth');
  
  // TB-303 Filter (Low Pass)
  filter = new p5.LowPass();
  filter.res(5); 
  
  // Volume Envelope 
  ampEnv = new p5.Envelope();
  ampEnv.setADSR(0.005, 0.1, 0.0, 0.1); 
  ampEnv.setRange(0.8, 0); 

  // Filter Envelope 
  filterEnv = new p5.Envelope();
  filterEnv.setADSR(0.005, 0.2, 0.0, 0.1); 
  filterEnv.setRange(1000, 60); 
  
  filter.freq(filterEnv);

  osc.disconnect();
  osc.connect(filter);
  
  osc.amp(ampEnv);
  osc.start();
  osc.amp(0); 
}

function draw() {
  background('#0070dd'); 
  drawGrid();
  
  if (isPlaying) {
    let now = millis();
    if (now >= nextStepTime) {
      playStep();
      let bpm = sldTempo ? sldTempo.value() : 120;
      let stepDur = (60 / bpm) * 1000 / 4;
      nextStepTime = now + stepDur;
    }
  }
}

function drawGrid() {
  noStroke();
  fill(255);
  rect(0, 0, HEADER_WIDTH, height);

  textAlign(CENTER, CENTER);
  textSize(10);
  
  for (let r = 0; r < GRID_ROWS; r++) {
    let y = r * CELL_SIZE;
    fill(0);
    text(NOTE_LABELS[r], HEADER_WIDTH / 2, y + CELL_SIZE/2);
    stroke(0, 50);
    line(HEADER_WIDTH, y, width, y);
  }

  for (let c = 0; c < GRID_COLS; c++) {
    let x = HEADER_WIDTH + (c * CELL_SIZE);
    
    if (isPlaying && c === currentStep) {
      if(isArpActive) fill(255, 165, 0, 80); 
      else fill(255, 255, 255, 50);
      noStroke();
      rect(x, 0, CELL_SIZE, height);
    }

    for (let r = 0; r < GRID_ROWS; r++) {
      let y = r * CELL_SIZE;
      let cx = x + CELL_SIZE/2;
      let cy = y + CELL_SIZE/2;
      noStroke();
      fill(0);
      if (grid[c][r]) {
        rectMode(CENTER);
        rect(cx, cy, CELL_SIZE * 0.7, CELL_SIZE * 0.7);
        rectMode(CORNER);
      } else {
        ellipse(cx, cy, 4, 4);
      }
    }
  }
}

function playStep() {
  if (!isAudioStarted) return;

  let activeRow = -1;
  for (let r = 0; r < GRID_ROWS; r++) {
    if (grid[currentStep][r]) {
      activeRow = r;
      break;
    }
  }

  if (activeRow !== -1) {
    let baseMidi = NOTE_MIDI[activeRow];
    
    if (isArpActive) {
      let interval = ARP_PATTERN[arpIndex % ARP_PATTERN.length];
      let noteMidi = baseMidi + interval;
      triggerSynth(midiToFreq(noteMidi));
      arpIndex++; 
    } else {
      triggerSynth(midiToFreq(baseMidi));
    }
  } else {
    if (isArpActive) arpIndex++;
  }

  currentStep = (currentStep + 1) % GRID_COLS;
}

function triggerSynth(freq) {
    let waveVal = sldWave ? sldWave.value() : 0;
    osc.setType(waveVal == 0 ? 'sawtooth' : 'square');
    
    let portTime = 0.05; 
    osc.freq(freq, portTime);
    
    // --- KEY CHANGES HERE ---
    
    // 1. Get Normalized Resonance (0.0 to 1.0)
    let rawRes = sldRes ? parseFloat(sldRes.value()) : 10;
    let normRes = rawRes / 25.0; // Slider max is 25

    // Map Resonance to Q (1 to 20)
    filter.res(map(rawRes, 0, 25, 1, 20));

    // 2. Volume Thinning (Aggressive)
    // At Low Res: Full Volume (0.8)
    // At High Res: Very Low Volume (0.2) -> Kills the "thick bass"
    let targetVol = map(normRes, 0, 1, 0.8, 0.2);
    ampEnv.setRange(targetVol, 0);

    // 3. Filter Envelope Scaling (Modulation Depth)
    // At Low Res: Multiplier is small (0.2) -> Envelope barely moves -> NO SQUELCH
    // At High Res: Multiplier is large (1.0) -> Envelope moves a lot -> MAX SQUELCH
    let envDepth = map(normRes, 0, 1, 0.2, 1.0);
    
    // Get Cutoff slider
    let cutoffSliderVal = sldCutoff ? parseFloat(sldCutoff.value()) : 1000;
    let baseFreq = 60; // Sub bass floor

    // Calculate dynamic peak frequency based on Resonance
    let sweepTop = baseFreq + ((cutoffSliderVal - baseFreq) * envDepth);

    // Set the filter sweep
    filterEnv.setRange(sweepTop, baseFreq);

    // 4. Decay
    let decayVal = sldDecay ? parseFloat(sldDecay.value()) : 0.2;
    ampEnv.setADSR(0.005, decayVal * 0.6, 0.0, 0.1); 
    filterEnv.setADSR(0.005, decayVal, 0.0, 0.1);

    ampEnv.play();
    filterEnv.play();
}

function mousePressed() {
  if (mouseX > HEADER_WIDTH && mouseX < width && mouseY > 0 && mouseY < height) {
    let c = floor((mouseX - HEADER_WIDTH) / CELL_SIZE);
    let r = floor(mouseY / CELL_SIZE);
    
    if (c >= 0 && c < GRID_COLS && r >= 0 && r < GRID_ROWS) {
      let wasActive = grid[c][r];
      for(let i=0; i<GRID_ROWS; i++) grid[c][i] = false;

      if (!wasActive) {
        grid[c][r] = true;
        if (!isPlaying && isAudioStarted && !isArpActive) {
           let baseMidi = NOTE_MIDI[r];
           triggerSynth(midiToFreq(baseMidi));
        }
      }
    }
  }
}

function togglePlay() {
  if (getAudioContext().state !== 'running') getAudioContext().resume();
  isAudioStarted = true;
  isPlaying = !isPlaying;
  
  if (isPlaying) {
    currentStep = 0;
    arpIndex = 0;
    nextStepTime = millis();
    if(btnToggle) { btnToggle.html("Stop"); btnToggle.addClass('active'); }
  } else {
    if(btnToggle) { btnToggle.html("Start"); btnToggle.removeClass('active'); }
    osc.amp(0, 0.1);
  }
}

function toggleArp() {
    isArpActive = !isArpActive;
    if(btnArp) {
        if(isArpActive) btnArp.addClass('active-arp');
        else btnArp.removeClass('active-arp');
    }
}

function clearGrid() {
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) grid[c][r] = false;
  }
}

function randomizeGrid() {
  clearGrid();
  for (let c = 0; c < GRID_COLS; c++) {
    if (random() > 0.3) {
      let r = floor(random(GRID_ROWS));
      grid[c][r] = true;
    }
  }
}