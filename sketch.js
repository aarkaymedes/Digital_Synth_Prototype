// --- Global Constants and Design Setup ---
const DESIGN_W = 1920;
const DESIGN_H = 1080;

// --- SEQUENCER STATE (MODIFIED FOR 2D GRID) ---
const STEP_COUNT = 16;
const PITCH_ROWS = 13; // C3 (48) to C4 (60)
const BASE_MIDI = 48; // C3
let sequence = []; // 2D Array: sequence[step][pitch] = boolean
let currentStep = 0;
let isPlaying = false;
const BPM = 120;
const STEP_INTERVAL_MS = 60000 / BPM / 4; 

// Synth Components
let monoOsc; 
let currentWaveform = 'sawtooth'; 

// Slider States (Normalized 0.0 to 1.0)
let portamentoSliderPos = 0.0;
let transposeSliderPos = 0.5; 
let waveformSliderPos = 0.0;  

// Transpose Range: -12 to +12 semitones
const TRANSPOSE_RANGE = 12;
const PORTAMENTO_MAX_MS = 200;

// UI Layout Constants
const BG_COLOR = [40, 40, 55]; 
const ACCENT_COLOR = [255, 120, 0]; 
const STEP_ON_COLOR = [0, 180, 255];
const STEP_OFF_COLOR = [70, 70, 90];
const STEP_ACTIVE_COLOR = [255, 255, 100];
const CONTROL_COLOR = [90, 90, 110];

// Grid Layout
const GRID_START_Y = 250;
const GRID_START_X = 100;
const CELL_SIZE_W = 100; // Step width
const CELL_SIZE_H = 40;  // Pitch height
const LABEL_W = 100;     // Pitch label width

// Slider Layout
const SLIDER_Y = 850; // Moved down to make room for the grid
const SLIDER_W = 400;
const SLIDER_H = 20;
const SLIDER_KNOB_R = 25;
const SLIDER_GAP = 50;

// Transport Button Layout
const BUTTON_Y = 100;
const BUTTON_W = 180;
const BUTTON_H = 80;
const BUTTON_GAP = 20;
const BUTTON_START_X = 1400;

// Touch/Interaction State
let sliderGrabbedID = -1; 
let grabbedTouchID = -2; // Start with a unique ID


// --- PRELOAD/SETUP/INIT FUNCTIONS ---
function preload() {}

function setup() {
    createCanvas(windowWidth, windowHeight); 
    noStroke();
    userStartAudio(); 
    
    // Initialize Monosynth
    monoOsc = new p5.Oscillator(currentWaveform); 
    monoOsc.amp(0);
    monoOsc.start();
    
    // Initialize 2D sequence array to all false (rests)
    initializeSequence();
    
    // Start the sequencer loop checker
    startSequencerLoop();
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function initializeSequence() {
    // sequence[step][pitch_index] = boolean
    sequence = Array(STEP_COUNT).fill(0).map(() => Array(PITCH_ROWS).fill(false));
}

function clearSequence() {
    initializeSequence();
}

function randomizeSequence() {
    for(let step = 0; step < STEP_COUNT; step++) {
        for(let pitch = 0; pitch < PITCH_ROWS; pitch++) {
            // 10% chance of a note being active at this cell
            sequence[step][pitch] = (random() < 0.1); 
        }
    }
}


// --- SEQUENCER AND AUDIO LOGIC ---

function playStep(step) {
    let activeNotes = [];
    
    // 1. Identify all active notes at this step
    for (let pitchIndex = 0; pitchIndex < PITCH_ROWS; pitchIndex++) {
        if (sequence[step][pitchIndex]) {
            // Note: pitchIndex 0 is the highest pitch (C4)
            activeNotes.push(BASE_MIDI + PITCH_ROWS - 1 - pitchIndex);
        }
    }

    // 2. Transpose, Portamento, and Waveform Update
    let transposeShift = floor(map(transposeSliderPos, 0, 1, -TRANSPOSE_RANGE, TRANSPOSE_RANGE));
    let portamentoTime = map(portamentoSliderPos, 0, 1, 0, PORTAMENTO_MAX_MS) / 1000;
    
    // Safety check: Stop the previous note cleanly
    monoOsc.amp(0, 0.01);

    if (activeNotes.length > 0) {
        // For a monosynth, play the highest active note
        let noteMidi = activeNotes[activeNotes.length - 1] + transposeShift;
        let freq = midiToFreq(noteMidi);
        
        // Glide frequency
        monoOsc.freq(freq, portamentoTime); 
        
        // Re-engage the volume
        monoOsc.amp(0.6, 0.05);
    } else {
        // Rest
        monoOsc.amp(0, 0.1);
    }
}

function startSequencerLoop() {
    if (seqLoop) clearInterval(seqLoop);

    seqLoop = setInterval(function() {
        if (isPlaying) {
            playStep(currentStep);
            currentStep = (currentStep + 1) % STEP_COUNT;
            redraw(); 
        }
    }, STEP_INTERVAL_MS);
}


// --- DRAWING FUNCTIONS ---

function draw() {
    background(BG_COLOR); 
    
    const scaleFactor = Math.min(windowWidth / DESIGN_W, windowHeight / DESIGN_H);
    
    push(); 
    translate((windowWidth - DESIGN_W * scaleFactor) / 2, (windowHeight - DESIGN_H * scaleFactor) / 2);
    scale(scaleFactor);
    
    drawHeader();
    drawTransportButtons();
    drawSequencerGrid(); // New Grid Drawing
    drawSliders();
    
    pop(); 
}

function drawHeader() {
    fill(255);
    textSize(60);
    textAlign(LEFT, TOP);
    text("DS-02", 50, 40);
    textSize(30);
    fill(ACCENT_COLOR); 
    text("MONOSYNTH SEQUENCER", 50, 100);

    // Status Display
    fill(255);
    textSize(30);
    let transpose = floor(map(transposeSliderPos, 0, 1, -TRANSPOSE_RANGE, TRANSPOSE_RANGE));
    let waveformName = waveformSliderPos < 0.5 ? 'SAWTOOTH' : 'SQUARE';
    text(`BPM: ${BPM} | Transpose: ${transpose} | Wave: ${waveformName}`, 50, 180);
}

function drawTransportButtons() {
    let x = BUTTON_START_X;

    // Start/Stop Button
    let playColor = isPlaying ? [255, 0, 0] : [0, 200, 0];
    drawButton(x, BUTTON_Y, BUTTON_W, BUTTON_H, playColor, isPlaying ? "STOP" : "START");
    x += BUTTON_W + BUTTON_GAP;

    // Clear Button
    drawButton(x, BUTTON_Y, BUTTON_W, BUTTON_H, CONTROL_COLOR, "CLEAR");
    x += BUTTON_W + BUTTON_GAP;

    // Random Button
    drawButton(x, BUTTON_Y, BUTTON_W, BUTTON_H, CONTROL_COLOR, "RANDOM");
}

function drawSequencerGrid() {
    let gridX = GRID_START_X + LABEL_W;
    let gridY = GRID_START_Y;
    
    // Draw Pitch Labels (Vertical Axis)
    fill(200);
    textSize(20);
    textAlign(RIGHT, CENTER);
    for (let pitch = 0; pitch < PITCH_ROWS; pitch++) {
        let midi = BASE_MIDI + PITCH_ROWS - 1 - pitch;
        let noteLabel = midiToNote(midi);
        text(noteLabel, GRID_START_X + LABEL_W - 5, gridY + pitch * CELL_SIZE_H + CELL_SIZE_H / 2);
    }
    
    // Draw Steps (Horizontal Axis)
    for (let step = 0; step < STEP_COUNT; step++) {
        // Highlight active step column
        if (isPlaying && step === currentStep) {
            fill(STEP_ACTIVE_COLOR);
            rect(gridX + step * CELL_SIZE_W, gridY, CELL_SIZE_W, PITCH_ROWS * CELL_SIZE_H);
        }

        for (let pitch = 0; pitch < PITCH_ROWS; pitch++) {
            let cellX = gridX + step * CELL_SIZE_W;
            let cellY = gridY + pitch * CELL_SIZE_H;
            
            // Draw Cell Background
            fill(STEP_OFF_COLOR);
            rect(cellX, cellY, CELL_SIZE_W, CELL_SIZE_H);

            // Draw Active Note
            if (sequence[step][pitch]) {
                fill(STEP_ON_COLOR);
                rect(cellX + 5, cellY + 5, CELL_SIZE_W - 10, CELL_SIZE_H - 10, 5); // Inner square
            }
        }
        
        // Step number label at bottom
        fill(255);
        textSize(18);
        textAlign(CENTER, TOP);
        text(step + 1, gridX + step * CELL_SIZE_W + CELL_SIZE_W / 2, gridY + PITCH_ROWS * CELL_SIZE_H + 5);
    }
}

function drawSliders() {
    let x = PAD_START_X;
    
    // Portamento Slider
    drawSliderControl(x, SLIDER_Y, "PORTAMENTO", portamentoSliderPos, 0, 1, 0, 200, 0);
    x += SLIDER_W + SLIDER_GAP;
    
    // Transpose Slider
    drawSliderControl(x, SLIDER_Y, "TRANSPOSE", transposeSliderPos, 0, 1, -TRANSPOSE_RANGE, TRANSPOSE_RANGE, 1);
    x += SLIDER_W + SLIDER_GAP;
    
    // Waveform Slider
    drawSliderControl(x, SLIDER_Y, "WAVEFORM", waveformSliderPos, 0, 1, 0, 1, 2);
}

// Helper function to draw a single slider control
function drawSliderControl(x, y, label, pos, minVal, maxVal, displayMin, displayMax, id) {
    let knobX = x + map(pos, 0, 1, 0, SLIDER_W);

    // Label
    fill(255);
    textSize(30);
    textAlign(LEFT, CENTER);
    text(label, x, y - 50);

    // Value Display
    let displayValue;
    if (label === "WAVEFORM") {
        displayValue = pos < 0.5 ? "SAW" : "SQUARE";
    } else if (label === "TRANSPOSE") {
        displayValue = floor(map(pos, 0, 1, displayMin, displayMax));
    } else {
        displayValue = round(map(pos, 0, 1, displayMin, displayMax));
    }
    fill(ACCENT_COLOR);
    textSize(24);
    textAlign(RIGHT, CENTER);
    text(displayValue, x + SLIDER_W, y - 50);

    // Track
    fill(CONTROL_COLOR);
    rect(x, y, SLIDER_W, SLIDER_H, 10);

    // Knob
    fill(ACCENT_COLOR);
    ellipse(knobX, y + SLIDER_H / 2, SLIDER_KNOB_R * 2);
}

function drawButton(x, y, w, h, color, label) {
    fill(color);
    rect(x, y, w, h, 10);
    fill(255);
    textSize(30);
    textAlign(CENTER, CENTER);
    text(label, x + w / 2, y + h / 2);
}


// --- INTERACTION LOGIC ---

function mapTouchToDesign(x, y) {
    const scaleFactor = Math.min(windowWidth / DESIGN_W, windowHeight / DESIGN_H);
    const inverseScale = 1 / scaleFactor;
    const xOffset = (windowWidth - DESIGN_W * scaleFactor) / 2;
    const yOffset = (windowHeight - DESIGN_H * scaleFactor) / 2;
    
    return { x: (x - xOffset) * inverseScale, y: (y - yOffset) * inverseScale };
}

function isOverButton(x, y, btnX, btnY, btnW, btnH) {
    return x > btnX && x < btnX + btnW && y > btnY && y < btnY + btnH;
}

function updateSliderValue(id, x) {
    let bounds = getSliderBounds(id);
    let newX = constrain(x, bounds.x, bounds.x + bounds.w);
    let newPos = map(newX, bounds.x, bounds.x + bounds.w, 0, 1);

    if (id === 0) {
        portamentoSliderPos = newPos;
    } else if (id === 1) {
        transposeSliderPos = newPos;
    } else if (id === 2) {
        waveformSliderPos = newPos;
        let newWaveform = waveformSliderPos < 0.5 ? 'sawtooth' : 'square';
        if (newWaveform !== monoOsc.getType()) {
            monoOsc.setType(newWaveform);
        }
    }
}


function touchStarted() {
    // FIX 1: Ensure audio context starts on first touch
    userStartAudio(); 

    let inputSource = touches.length > 0 ? touches : [{x: mouseX, y: mouseY, id: -1}];
    
    for (let input of inputSource) {
        let design = mapTouchToDesign(input.x, input.y);
        let tx = design.x;
        let ty = design.y;
        let id = input.id;

        // 1. Check Sequencer Grid Interaction
        let gridX = GRID_START_X + LABEL_W;
        let gridY = GRID_START_Y;
        
        if (tx > gridX && tx < gridX + STEP_COUNT * CELL_SIZE_W && ty > gridY && ty < gridY + PITCH_ROWS * CELL_SIZE_H) {
            let step = floor((tx - gridX) / CELL_SIZE_W);
            let pitch = floor((ty - gridY) / CELL_SIZE_H);
            
            // Toggle the state of the cell
            sequence[step][pitch] = !sequence[step][pitch];
            redraw();
            return false;
        }

        // 2. Check Sliders for Grabbing
        for (let i = 0; i < 3; i++) {
            let bounds = getSliderBounds(i);
            let knobX = bounds.x + map(i === 0 ? portamentoSliderPos : (i === 1 ? transposeSliderPos : waveformSliderPos), 0, 1, 0, SLIDER_W);

            if (dist(tx, ty, knobX, bounds.y + bounds.h / 2) < SLIDER_KNOB_R) {
                sliderGrabbedID = i;
                grabbedTouchID = id; // FIX 2: Store the specific ID that grabbed the slider
                return false; 
            }
        }

        // 3. Check Transport Buttons
        let x = BUTTON_START_X;
        
        // Start/Stop Button
        if (isOverButton(tx, ty, x, BUTTON_Y, BUTTON_W, BUTTON_H)) {
            isPlaying = !isPlaying;
            if (isPlaying) {
                currentStep = (currentStep + 1) % STEP_COUNT;
                playStep(currentStep); 
            } else {
                monoOsc.amp(0, 0.2); 
            }
            redraw();
            return false;
        }
        x += BUTTON_W + BUTTON_GAP;

        // Clear Button
        if (isOverButton(tx, ty, x, BUTTON_Y, BUTTON_W, BUTTON_H)) {
            clearSequence();
            isPlaying = false;
            currentStep = 0;
            monoOsc.amp(0, 0.2);
            redraw();
            return false;
        }
        x += BUTTON_W + BUTTON_GAP;

        // Random Button
        if (isOverButton(tx, ty, x, BUTTON_Y, BUTTON_W, BUTTON_H)) {
            randomizeSequence();
            redraw();
            return false;
        }
    }
}

function touchMoved() {
    // FIX 2: Correctly map the touch position to the design space and handle slider drag
    if (sliderGrabbedID !== -1) {
        let inputX, inputY;

        if (grabbedTouchID !== -1) {
            // Find the active touch based on the stored ID
            let activeTouch = touches.find(t => t.id === grabbedTouchID);
            if (!activeTouch) return; // Touch released unexpectedly
            inputX = activeTouch.x;
            inputY = activeTouch.y;
        } else {
            // Mouse input
            inputX = mouseX;
            inputY = mouseY;
        }

        let design = mapTouchToDesign(inputX, inputY);
        
        // Sliders are horizontal, so we use the X coordinate for input
        handleSliderInput(design.x, design.y, sliderGrabbedID);
        redraw();
        return false;
    }
}

function touchEnded() {
    // Check if the input that ended was the one controlling the slider
    if (sliderGrabbedID !== -1) {
        let isGrabbedInputReleased = true;
        
        // If there are still touches, check if the grabbed ID is among them
        if (touches.length > 0) {
            isGrabbedInputReleased = false;
            for (let t of touches) {
                if (t.id === grabbedTouchID) {
                    isGrabbedInputReleased = false;
                    break;
                }
            }
        }

        if (isGrabbedInputReleased) {
            sliderGrabbedID = -1;
            grabbedTouchID = -2;
            return false;
        }
    }
    // No specific pad tracking needed on touchEnd since pads are toggles now
}

function doubleClicked() {
    return false; // Disable double-click entirely
}

// Utility to convert MIDI to Note (for display)
function midiToNote(midi) {
    const noteNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
    let octave = floor(midi / 12) - 1;
    let note = noteNames[midi % 12];
    return `${note}${octave}`;
}