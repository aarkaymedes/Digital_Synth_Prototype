// --- Configuration ---
const GRID_COLS = 16;
const GRID_ROWS = 13; // C to C (one octave)
const CELL_SIZE = 40;
const HEADER_WIDTH = 60; // Space for note labels
const CANVAS_WIDTH = HEADER_WIDTH + (GRID_COLS * CELL_SIZE);
const CANVAS_HEIGHT = GRID_ROWS * CELL_SIZE;

// Note names for labels (Top to Bottom: High C to Low C)
const NOTE_LABELS = ['C (Hi)', 'B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C (Lo)'];
// MIDI note numbers corresponding to rows (Top to Bottom)
// 72 is C5, 60 is C4
const NOTE_MIDI = [72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60];

// --- State ---
let grid = []; // 2D array [col][row] boolean
let isPlaying = false;
let currentStep = 0;
let nextStepTime = 0;
let stepInterval = 0; // calculated from tempo

// Arpeggiator State
let isArpActive = false;
let arpIndex = 0;
// A simple Minor 7th pattern intervals: Root, min3, 5th, min7, Octave
const ARP_PATTERN = [0, 3, 7, 10, 12, 10, 7, 3]; 

// Synth components
let osc;
let ampEnv;
let filter;
let isAudioStarted = false;

// DOM Elements
let btnToggle, btnClear, btnRandom, btnArp; 
let sldWave, sldPort, sldTrans, sldTempo;

function setup() {
  // Create Canvas
  let cnv = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  
  try {
    cnv.parent('canvas-container');
  } catch (e) {
    console.log("Container not found, appending to body");
  }
  
  // Initialize Grid (Cols x Rows)
  for (let c = 0; c < GRID_COLS; c++) {
    let col = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      col.push(false);
    }
    grid.push(col);
  }

  // Initialize DOM references
  btnToggle = select('#btn-toggle');
  btnClear = select('#btn-clear');
  btnRandom = select('#btn-random');
  btnArp = select('#btn-arp'); 
  sldWave = select('#slider-wave');
  sldPort = select('#slider-portamento');
  sldTrans = select('#slider-transpose');
  sldTempo = select('#slider-tempo');

  // Attach Listeners
  if(btnToggle) btnToggle.mousePressed(togglePlay);
  if(btnClear) btnClear.mousePressed(clearGrid);
  if(btnRandom) btnRandom.mousePressed(randomizeGrid);
  if(btnArp) btnArp.mousePressed(toggleArp); 
  
  userStartAudio().then(() => {
    // Audio context ready
  });
  
  setupSynth();
}

function setupSynth() {
  osc = new p5.Oscillator('sawtooth');
  
  filter = new p5.LowPass();
  filter.freq(800);
  filter.res(5); 
  
  ampEnv = new p5.Envelope();
  ampEnv.setADSR(0.01, 0.1, 0.1, 0.1); 
  ampEnv.setRange(0.5, 0);

  osc.disconnect();
  osc.connect(filter);
  
  osc.amp(ampEnv);
  osc.start();
  osc.amp(0); 
}

function draw() {
  background('#0070dd'); 

  drawGrid();
  
  // Playhead Logic
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
  
  // 1. Draw Labels background
  fill(255);
  rect(0, 0, HEADER_WIDTH, height);

  // 2. Draw Labels and Grid lines
  textAlign(CENTER, CENTER);
  textSize(10);
  
  for (let r = 0; r < GRID_ROWS; r++) {
    let y = r * CELL_SIZE;
    
    // Draw Label
    fill(0);
    text(NOTE_LABELS[r], HEADER_WIDTH / 2, y + CELL_SIZE/2);
    
    // Draw Row Lines
    stroke(0, 50);
    line(HEADER_WIDTH, y, width, y);
  }

  // 3. Draw Columns and Notes
  for (let c = 0; c < GRID_COLS; c++) {
    let x = HEADER_WIDTH + (c * CELL_SIZE);
    
    // Highlight active column
    if (isPlaying && c === currentStep) {
      // Different highlight color if Arp is active
      if(isArpActive) fill(255, 165, 0, 80); // Orange tint for Arp
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
      
      // Draw grid notes
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

  if (isArpActive) {
    // --- ARPEGGIATOR MODE ---
    // Play a generated pattern based on the transpose root
    
    // Get base root note (C4 = 60)
    let rootMidi = 60; 
    let transpose = sldTrans ? int(sldTrans.value()) : 0;
    
    // Calculate interval from pattern
    let interval = ARP_PATTERN[arpIndex % ARP_PATTERN.length];
    
    let noteMidi = rootMidi + transpose + interval;
    let freq = midiToFreq(noteMidi);
    
    // Trigger Synth
    triggerSynth(freq);
    
    arpIndex++;
    
  } else {
    // --- NORMAL SEQUENCER MODE ---
    let activeRow = -1;
    for (let r = 0; r < GRID_ROWS; r++) {
      if (grid[currentStep][r]) {
        activeRow = r;
        break;
      }
    }

    if (activeRow !== -1) {
      let baseMidi = NOTE_MIDI[activeRow];
      let transpose = sldTrans ? int(sldTrans.value()) : 0;
      let finalMidi = baseMidi + transpose;
      let freq = midiToFreq(finalMidi);
      triggerSynth(freq);
    }
  }

  // Advance step
  currentStep = (currentStep + 1) % GRID_COLS;
}

function triggerSynth(freq) {
    // Update Waveform
    let waveVal = sldWave ? sldWave.value() : 0;
    let waveType = waveVal == 0 ? 'sawtooth' : 'square';
    osc.setType(waveType);

    // Portamento
    let portTime = sldPort ? parseFloat(sldPort.value()) : 0.05;
    osc.freq(freq, portTime);

    // Trigger Envelope
    ampEnv.play();
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
        // Preview Note
        if (!isPlaying && isAudioStarted && !isArpActive) {
           let baseMidi = NOTE_MIDI[r];
           let transpose = sldTrans ? int(sldTrans.value()) : 0;
           let freq = midiToFreq(baseMidi + transpose);
           triggerSynth(freq);
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
    if(btnToggle) {
        btnToggle.html("Stop");
        btnToggle.addClass('active');
    }
  } else {
    if(btnToggle) {
        btnToggle.html("Start");
        btnToggle.removeClass('active');
    }
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
    for (let r = 0; r < GRID_ROWS; r++) {
      grid[c][r] = false;
    }
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