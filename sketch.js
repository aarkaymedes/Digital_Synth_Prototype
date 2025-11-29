// --- Global Constants and Design Setup ---
const DESIGN_W = 1920;
const DESIGN_H = 1080;

// Sequencer State
let sequence = []; // Stores MIDI note values for 16 steps (null = rest)
const STEP_COUNT = 16;
let currentStep = 0;
let isPlaying = false;
const BPM = 120;
const STEP_INTERVAL_MS = 60000 / BPM / 4; // 16th note interval

// Synth Components
let monoOsc; // Single oscillator for monophonic voice
let currentWaveform = 'sawtooth'; // Default waveform

// Slider States (Normalized 0.0 to 1.0)
let portamentoSliderPos = 0.0;
let transposeSliderPos = 0.5; // Starts at 0 shift
let waveformSliderPos = 0.0;  // 0.0=Sawtooth, 1.0=Square

// Transpose Range: -12 to +12 semitones
const TRANSPOSE_RANGE = 12;

// Portamento Range: 0 ms to 200 ms
const PORTAMENTO_MAX_MS = 200;

// UI Layout Constants
const BG_COLOR = [40, 40, 55]; // Darker background
const ACCENT_COLOR = [255, 120, 0]; // Orange/Red for active elements
const STEP_ON_COLOR = [0, 180, 255];
const STEP_OFF_COLOR = [70, 70, 90];
const STEP_ACTIVE_COLOR = [255, 255, 100];
const CONTROL_COLOR = [90, 90, 110];

// Step Pad Layout
const PAD_START_Y = 300;
const PAD_START_X = 100;
const PAD_SIZE = 100;
const PAD_GAP = 20;

// Slider Layout
const SLIDER_Y = 700;
const SLIDER_W = 400;
const SLIDER_H = 20;
const SLIDER_KNOB_R = 25;
const SLIDER_GAP = 150;

// Transport Button Layout
const BUTTON_Y = 100;
const BUTTON_W = 180;
const BUTTON_H = 80;
const BUTTON_GAP = 20;
const BUTTON_START_X = 1400;

// Touch/Interaction State
let sliderGrabbedID = -1; // -1: none, 0: portamento, 1: transpose, 2: waveform

// --- Sequencer Timer ---
let seqLoop = null; 

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
    
    // Initialize sequence to all rests
    clearSequence();
    
    // Start the sequencer loop checker
    startSequencerLoop();
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function clearSequence() {
    sequence = Array(STEP_COUNT).fill(null);
}

function randomizeSequence() {
    for(let i = 0; i < STEP_COUNT; i++) {
        // Randomly choose between C3 (48) and C5 (72)
        if (random() < 0.7) { // 70% chance of note
            sequence[i] = floor(random(48, 73)); 
        } else {
            sequence[i] = null; // Rest
        }
    }
}


// --- SEQUENCER AND AUDIO LOGIC ---

// Handles the current step playback
function playStep(step) {
    let note = sequence[step];
    
    // Apply Transpose
    let transposeShift = floor(map(transposeSliderPos, 0, 1, -TRANSPOSE_RANGE, TRANSPOSE_RANGE));
    
    // Calculate Portamento Time (in seconds)
    let portamentoTime = map(portamentoSliderPos, 0, 1, 0, PORTAMENTO_MAX_MS) / 1000;
    
    // Stop the previous note cleanly
    monoOsc.amp(0, 0.01);

    if (note !== null) {
        let finalMidi = note + transposeShift;
        let freq = midiToFreq(finalMidi);
        
        // Glide frequency based on Portamento setting
        monoOsc.freq(freq, portamentoTime); 
        
        // Re-engage the volume
        monoOsc.amp(0.6, 0.05);
    } else {
        // Stop note for a rest
        monoOsc.amp(0, 0.1);
    }
}

// Sequencer transport timer
function startSequencerLoop() {
    if (seqLoop) clearInterval(seqLoop);

    seqLoop = setInterval(function() {
        if (isPlaying) {
            playStep(currentStep);
            currentStep = (currentStep + 1) % STEP_COUNT;
            redraw(); // Force UI update every step
        }
    }, STEP_INTERVAL_MS);
}


// --- DRAWING FUNCTIONS ---

function draw() {
    background(BG_COLOR); 
    
    // FIX: Calculate and apply the scaling transformation for responsiveness
    const scaleFactor = Math.min(windowWidth / DESIGN_W, windowHeight / DESIGN_H);
    
    push(); 
    translate((windowWidth - DESIGN_W * scaleFactor) / 2, (windowHeight - DESIGN_H * scaleFactor) / 2);
    scale(scaleFactor);
    
    drawHeader();
    drawTransportButtons();
    drawSequencerPads();
    drawSliders();
    
    pop(); 

    // Handle dragging outside the draw loop
    if (mouseIsPressed && sliderGrabbedID !== -1) {
        handleSliderDrag(touches.length > 0 ? touches[0].y : mouseY);
    }
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
    drawButton(x, BUTTON_Y, BUTTON_W, BUTTON_H, playColor, isPlaying ? "STOP" : "START", 'transport_start');
    x += BUTTON_W + BUTTON_GAP;

    // Clear Button
    drawButton(x, BUTTON_Y, BUTTON_W, BUTTON_H, CONTROL_COLOR, "CLEAR", 'transport_clear');
    x += BUTTON_W + BUTTON_GAP;

    // Random Button
    drawButton(x, BUTTON_Y, BUTTON_W, BUTTON_H, CONTROL_COLOR, "RANDOM", 'transport_random');
}

function drawSequencerPads() {
    let x = PAD_START_X;
    let y = PAD_START_Y;
    
    // Draw 16 steps in 2 rows of 8
    for (let i = 0; i < STEP_COUNT; i++) {
        let padX = x + (i % 8) * (PAD_SIZE + PAD_GAP);
        let padY = y + floor(i / 8) * (PAD_SIZE + PAD_GAP);
        
        let color = STEP_OFF_COLOR;
        if (sequence[i] !== null) {
            color = STEP_ON_COLOR;
        }
        
        // Highlight active step
        if (isPlaying && i === currentStep) {
            color = STEP_ACTIVE_COLOR;
        }

        // Highlight step on mouse down for immediate feedback
        if (mouseIsPressed && !isPlaying && isOverPad(mouseX, mouseY, padX, padY, PAD_SIZE)) {
             color = ACCENT_COLOR;
        }

        fill(color);
        rect(padX, padY, PAD_SIZE, PAD_SIZE, 10);
        
        // Step number label
        fill(0);
        if (i === currentStep && isPlaying) fill(40);
        else fill(255);

        textSize(20);
        textAlign(CENTER, TOP);
        text(i + 1, padX + PAD_SIZE / 2, padY + 10);

        // Note value display
        textSize(24);
        let noteValue = sequence[i] === null ? 'OFF' : midiToNote(sequence[i]);
        text(noteValue, padX + PAD_SIZE / 2, padY + PAD_SIZE / 2 + 10);
    }
}

function drawSliders() {
    // Portamento Slider
    drawSliderControl(PAD_START_X, SLIDER_Y, "PORTAMENTO", portamentoSliderPos, 0, PORTAMENTO_MAX_MS, 0, 100, 0);
    
    // Transpose Slider
    drawSliderControl(PAD_START_X + SLIDER_W + SLIDER_GAP, SLIDER_Y, "TRANSPOSE", transposeSliderPos, -TRANSPOSE_RANGE, TRANSPOSE_RANGE, -12, 12, 1);
    
    // Waveform Slider
    drawSliderControl(PAD_START_X + 2 * (SLIDER_W + SLIDER_GAP), SLIDER_Y, "WAVEFORM", waveformSliderPos, 0, 1, 0, 1, 2);
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

function drawButton(x, y, w, h, color, label, id) {
    fill(color);
    rect(x, y, w, h, 10);
    fill(255);
    textSize(30);
    textAlign(CENTER, CENTER);
    text(label, x + w / 2, y + h / 2);
}


// --- INTERACTION LOGIC ---

// Helper to map touch coordinates back to design space
function mapTouchToDesign(x, y) {
    const scaleFactor = Math.min(windowWidth / DESIGN_W, windowHeight / DESIGN_H);
    const inverseScale = 1 / scaleFactor;
    const xOffset = (windowWidth - DESIGN_W * scaleFactor) / 2;
    const yOffset = (windowHeight - DESIGN_H * scaleFactor) / 2;
    
    return {
        x: (x - xOffset) * inverseScale,
        y: (y - yOffset) * inverseScale
    };
}

function isOverPad(x, y, padX, padY, size) {
    // Helper for sequencer pad click detection
    return x > padX && x < padX + size && y > padY && y < padY + size;
}

function getSliderBounds(id) {
    let x = PAD_START_X;
    let w = SLIDER_W;
    let gap = SLIDER_W + SLIDER_GAP;
    if (id === 1) x += gap;
    if (id === 2) x += 2 * gap;
    return { x: x, y: SLIDER_Y, w: w, h: SLIDER_H };
}

function handleSliderInput(x, y, id) {
    // If dragging, update the position
    let bounds = getSliderBounds(id);
    
    // Constrain X position to slider bounds
    let newX = constrain(x, bounds.x, bounds.x + bounds.w);
    let newPos = map(newX, bounds.x, bounds.x + bounds.w, 0, 1);

    if (id === 0) {
        portamentoSliderPos = newPos;
    } else if (id === 1) {
        transposeSliderPos = newPos;
    } else if (id === 2) {
        waveformSliderPos = newPos;
        // Update the actual oscillator waveform when slider is moved
        let newWaveform = waveformSliderPos < 0.5 ? 'sawtooth' : 'square';
        if (newWaveform !== monoOsc.getType()) {
            monoOsc.setType(newWaveform);
        }
    }
}


function touchStarted() {
    let inputSource = touches.length > 0 ? touches : [{x: mouseX, y: mouseY, id: -1}];
    
    for (let input of inputSource) {
        let design = mapTouchToDesign(input.x, input.y);
        let tx = design.x;
        let ty = design.y;
        
        // 1. Check Sequencer Pads
        let padX = PAD_START_X;
        let padY = PAD_START_Y;
        
        for (let i = 0; i < STEP_COUNT; i++) {
            let pX = padX + (i % 8) * (PAD_SIZE + PAD_GAP);
            let pY = padY + floor(i / 8) * (PAD_SIZE + PAD_GAP);

            if (isOverPad(tx, ty, pX, pY, PAD_SIZE)) {
                // Sequencer Note Input Logic: Toggle note or rest
                if (sequence[i] === null) {
                    // Turn ON: Assign a default note (C4=60)
                    sequence[i] = 60; 
                } else {
                    // Turn OFF: Rest
                    sequence[i] = null;
                }
                redraw();
                return false;
            }
        }
        
        // 2. Check Sliders for Grabbing
        for (let i = 0; i < 3; i++) {
            let bounds = getSliderBounds(i);
            let knobX = bounds.x + map(i === 0 ? portamentoSliderPos : (i === 1 ? transposeSliderPos : waveformSliderPos), 0, 1, 0, SLIDER_W);

            if (dist(tx, ty, knobX, bounds.y + bounds.h / 2) < SLIDER_KNOB_R) {
                sliderGrabbedID = i;
                return false; 
            }
        }

        // 3. Check Transport Buttons
        let x = BUTTON_START_X;
        
        // Start/Stop Button
        if (isOverPad(tx, ty, x, BUTTON_Y, BUTTON_W)) {
            isPlaying = !isPlaying;
            if (isPlaying) {
                // If starting, ensure currentStep is visually updated immediately
                currentStep = (currentStep + 1) % STEP_COUNT;
                playStep(currentStep); 
            } else {
                monoOsc.amp(0, 0.2); // Fade out synth on stop
            }
            redraw();
            return false;
        }
        x += BUTTON_W + BUTTON_GAP;

        // Clear Button
        if (isOverPad(tx, ty, x, BUTTON_Y, BUTTON_W)) {
            clearSequence();
            isPlaying = false;
            currentStep = 0;
            monoOsc.amp(0, 0.2);
            redraw();
            return false;
        }
        x += BUTTON_W + BUTTON_GAP;

        // Random Button
        if (isOverPad(tx, ty, x, BUTTON_Y, BUTTON_W)) {
            randomizeSequence();
            redraw();
            return false;
        }
    }
}

function touchMoved() {
    if (sliderGrabbedID !== -1) {
        let touchId = touches.length > 0 ? touches.findIndex(t => t.id === input.id) : -1;
        let inputX, inputY;

        if (touchId !== -1) {
            inputX = touches[touchId].x;
            inputY = touches[touchId].y;
        } else if (grabbedTouchID === -1) {
            inputX = mouseX;
            inputY = mouseY;
        } else {
            return;
        }

        let design = mapTouchToDesign(inputX, inputY);
        handleSliderInput(design.x, design.y, sliderGrabbedID);
        redraw();
        return false;
    }
}

function touchEnded() {
    if (sliderGrabbedID !== -1) {
        sliderGrabbedID = -1;
        return false;
    }
}

function doubleClicked() {
    // Custom double-click exclusion logic is too complex with the new layout/scaling.
    // We rely on the single tap for fullscreen in the header area.
    return false;
}

// Custom Note to MIDI mapping (TB-303 style display)
function midiToNote(midi) {
    const noteNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
    let octave = floor(midi / 12) - 1;
    let note = noteNames[midi % 12];
    return `${note}${octave}`;
}