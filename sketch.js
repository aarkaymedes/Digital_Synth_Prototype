// --- Configuration ---
const GRID_COLS = 16;
const GRID_ROWS = 12; // Adjusted rows to remove High C
const CELL_SIZE = 40;
const HEADER_WIDTH = 60; // Space for note labels
const CANVAS_WIDTH = HEADER_WIDTH + (GRID_COLS * CELL_SIZE);
const CANVAS_HEIGHT = GRID_ROWS * CELL_SIZE;

// Note names
const NOTE_LABELS = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C (Lo)'];

// MIDI note numbers - SHIFTED DOWN 3 OCTAVES FOR DEEP SUB BASS (24-35)
const NOTE_MIDI = [35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24];

// --- State ---
let grid = []; 
let isPlaying = false;
let currentStep = 0;
let nextStepTime = 0;

// Arpeggiator State
let isArpActive = false;
let arpIndex = 0;
// Pattern: Root, +3 semitones, +7 (5th), +10 (7th), +12 (Octave)...
const ARP_PATTERN = [0, 3, 7, 10, 12, 10, 7, 3]; 

// Synth components
let osc, ampEnv, filter, filterEnv, dist; // Added dist
let isAudioStarted = false;

// DOM Elements
let btnToggle, btnClear, btnRandom, btnArp; 
let sldWave, sldPort, sldTrans, sldTempo;

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
  sldPort = select('#slider-portamento');
  sldTrans = select('#slider-transpose');
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
  
  // TB-303 "Liquid" Filter Settings
  filter = new p5.LowPass();
  filter.res(18); // High resonance for that "chirpy" liquid sound
  
  // Distortion (Subtle saturation)
  dist = new p5.Distortion(0.05, 'none'); 

  // Volume Envelope - Tight and punchy
  ampEnv = new p5.Envelope();
  ampEnv.setADSR(0.001, 0.1, 0.0, 0.1); 
  ampEnv.setRange(0.7, 0); 

  // Filter Envelope - The "Zap"
  filterEnv = new p5.Envelope();
  filterEnv.setADSR(0.001, 0.15, 0.0, 0.1); // Faster decay = more squelch
  // Sweep range: Opens wider (1500Hz) to bite, then clamps down to sub (60Hz)
  filterEnv.setRange(1500, 60); 
  
  filter.freq(filterEnv);

  // Routing: Osc -> Filter -> Distortion -> Master
  osc.disconnect();
  osc.connect(filter);
  filter.disconnect();
  filter.connect(dist);
  
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
      // Orange highlight if Arp is active, otherwise white
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

  // 1. Check if there is an active note at this step
  let activeRow = -1;
  for (let r = 0; r < GRID_ROWS; r++) {
    if (grid[currentStep][r]) {
      activeRow = r;
      break;
    }
  }

  // 2. Play Audio Logic
  if (activeRow !== -1) {
    // We found a note on the grid!
    let baseMidi = NOTE_MIDI[activeRow];
    let transpose = sldTrans ? int(sldTrans.value()) : 0;

    if (isArpActive) {
      // --- ARPEGGIATOR MODE ---
      // Use the grid note as the root + add the arpeggio interval
      let interval = ARP_PATTERN[arpIndex % ARP_PATTERN.length];
      let noteMidi = baseMidi + transpose + interval;
      triggerSynth(midiToFreq(noteMidi));
      arpIndex++; 
    } else {
      // --- NORMAL MODE ---
      // Just play the note
      triggerSynth(midiToFreq(baseMidi + transpose));
    }
  } else {
    // No note on grid -> Play nothing (Silence)
    // If you want the Arp pattern to "keep counting" even during silence, keep this:
    if (isArpActive) arpIndex++;
  }

  currentStep = (currentStep + 1) % GRID_COLS;
}

function triggerSynth(freq) {
    let waveVal = sldWave ? sldWave.value() : 0;
    osc.setType(waveVal == 0 ? 'sawtooth' : 'square');
    let portTime = sldPort ? parseFloat(sldPort.value()) : 0.05;
    osc.freq(freq, portTime);
    
    // Trigger both envelopes
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
        // Preview note only if not playing
        if (!isPlaying && isAudioStarted && !isArpActive) {
           let baseMidi = NOTE_MIDI[r];
           let transpose = sldTrans ? int(sldTrans.value()) : 0;
           triggerSynth(midiToFreq(baseMidi + transpose));
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