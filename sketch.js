// --- Global Variables ---
let canvasSizeW = 1920;
let canvasSizeH = 1080;
let chordPads = [];
let nashvilleNumbers = ["i", "ii", "iii", "iv", "v", "vi", "vii°"]; 
let chordTypes = ["Major", "Minor", "7th", "Sus4", "Add9"];
let currentChordTypeIndex = 0; 

// --- KEY SELECTION VARIABLES ---
let currentKeyIndex = 0;
const ALL_KEYS = ["C", "D", "E", "F", "G", "A", "B"]; 
const KEY_MIDI_OFFSETS = {
    "C": 0, "D": 2, "E": 4, "F": 5, 
    "G": 7, "A": 9, "B": 11
};

// --- FEATURE/SOUND VARIABLES ---
let chordOscillators = []; 
const MAX_VOICES = 4;
const SYNTH_WAVEFORM = 'sawtooth';

// --- SLIDER VARIABLES ---
let sliderPos = 0.5; 
let sliderGrabbed = false;
let grabbedTouchID = -1; 

// --- DRUM/ARPEGGIATOR LOGIC (UPDATED) ---
let kick, snare;         
let drumMachineActive = false; 
let drumLoop = null;     
let repeatModeActive = false; // Now controls Arpeggiator state
let pressedPad = null;        

const BPM = 120;         
const REPEAT_INTERVAL_MS = 60000 / BPM; 
const INTERVAL_MS = REPEAT_INTERVAL_MS / 2; 

// Arpeggiator Setup
let arpStep = 0; 
let arpLoop = null; 
const ARPEGGIATOR_PATTERNS = { "UP": 0, "DOWN": 1 };
let currentArpPattern = ARPEGGIATOR_PATTERNS.UP;
const ARP_INTERVAL_MS = 60000 / BPM / 4; // Use 16th note for speed

// Defines the intervals and offsets (Unchanged)
const CHORD_INTERVALS = {
    "Major":    [0, 4, 7], "Minor":    [0, 3, 7], "7th":      [0, 4, 7, 10],  
    "Sus4":     [0, 5, 7], "Add9":     [0, 4, 7, 14]   
};
const NASHVILLE_OFFSETS = {
    "i":    0, "ii":   2, "iii":  4, "iv":   5, "v":    7, "vi":   9, "vii°": 11 
};

// UI Layout Constants
const BG_COLOR = [245, 245, 245]; 
const PAD_BG_COLOR = [255];
const FEATURE_COLORS = {
    KEY: [0, 109, 187],      
    DRUM: [100, 100, 100],   
    REPEAT: [255, 178, 0]    
};

// --- LAYOUT CONSTANTS (PRECISE PNG MATCH) ---
const CHORD_PAD_W = 280;
const CHORD_PAD_H = 180;
const PAD_GAP_X = 20;
const PAD_GAP_Y = 20;
const PAD_START_X = 500;
const PAD_START_Y_ROW1 = 550;
const PAD_START_Y_ROW2 = PAD_START_Y_ROW1 + CHORD_PAD_H + PAD_GAP_Y;
const SLIDER_X = 170;
const SLIDER_Y_MIN = 350;
const SLIDER_Y_MAX = 850;
const SLIDER_RADIUS = 70; 
const FEATURE_PAD_W = 180;
const FEATURE_PAD_H = 120;
const FEATURE_PAD_Y = 100;
const FEATURE_PAD_GAP = 30;
const FEATURE_PAD_START_X = 1350;
const FULLSCREEN_TAP_ZONE_W = 400;
const FULLSCREEN_TAP_ZONE_H = 150;


// --- PRELOAD/SETUP/INIT FUNCTIONS ---
function preload() {}

function setup() {
    createCanvas(windowWidth, windowHeight); 
    noStroke();
    
    userStartAudio(); 
    
    for (let i = 0; i < MAX_VOICES; i++) {
        let osc = new p5.Oscillator(SYNTH_WAVEFORM); 
        osc.amp(0);
        osc.start();
        chordOscillators.push(osc);
    }
    
    kick = new p5.Oscillator('square'); kick.freq(50); kick.amp(0); kick.start();
    snare = new p5.Noise('white'); snare.amp(0); snare.start();

    initializeChordPads();
    // We don't start the repeat checker loop now, it's called by the Arp toggle
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function initializeChordPads() {
    const ROW2_START_X = PAD_START_X - 150; 

    for (let i = 0; i < 3; i++) {
        chordPads.push({ x: PAD_START_X + i * (CHORD_PAD_W + PAD_GAP_X), y: PAD_START_Y_ROW1, w: CHORD_PAD_W, h: CHORD_PAD_H, number: nashvilleNumbers[i], isPressed: false });
    }
    for (let i = 3; i < 7; i++) {
        chordPads.push({ x: ROW2_START_X + (i - 3) * (CHORD_PAD_W + PAD_GAP_X), y: PAD_START_Y_ROW2, w: CHORD_PAD_W, h: CHORD_PAD_H, number: nashvilleNumbers[i], isPressed: false });
    }
}


// --- CORE LOGIC FUNCTIONS ---

function playChord(nashvilleNumber, chordTypeName) {
    let selectedKey = ALL_KEYS[currentKeyIndex];
    let globalKeyOffset = KEY_MIDI_OFFSETS[selectedKey];
    let scaleOffset = NASHVILLE_OFFSETS[nashvilleNumber];
    let rootMidi = 60 + globalKeyOffset + scaleOffset; 

    let intervals = (nashvilleNumber === "vii°") ? [0, 3, 6] : CHORD_INTERVALS[chordTypeName];
    if (!intervals || intervals.length > MAX_VOICES) return;

    for (let i = 0; i < intervals.length; i++) {
        let noteMidi = rootMidi + intervals[i];
        chordOscillators[i].freq(midiToFreq(noteMidi));
        chordOscillators[i].amp(0.4, 0.05); 
    }
    for (let i = intervals.length; i < MAX_VOICES; i++) { chordOscillators[i].amp(0); }
}

function stopAllChords(isRhythmicStop = false) {
    let releaseTime = isRhythmicStop ? 0.01 : 0.2; 
    for (let osc of chordOscillators) { osc.amp(0, releaseTime); }
    if (!pressedPad) { for (let pad of chordPads) { pad.isPressed = false; } }
}

function startDrumSequencer() {
    let beatCount = 0;
    if (drumLoop) clearInterval(drumLoop);
    drumLoop = setInterval(() => {
        if (beatCount % 2 === 0) { playDrumHit('kick'); } else { playDrumHit('snare'); }
        beatCount = (beatCount + 1) % 4;
    }, INTERVAL_MS * 2);
}

function stopDrumSequencer() {
    if (drumLoop) { clearInterval(drumLoop); drumLoop = null; }
}

function playDrumHit(type) {
    if (type === 'kick') { kick.amp(0.8, 0.01); kick.amp(0, 0.3); } 
    else if (type === 'snare') { snare.amp(0.5, 0.01); snare.amp(0, 0.2); }
}

// --- ARPEGGIATOR LOGIC (CORRECTED) ---

// Helper to get the MIDI notes for a selected chord (Unchanged)
function getChordNotes(nashvilleNumber, chordTypeName) {
    let selectedKey = ALL_KEYS[currentKeyIndex];
    let globalKeyOffset = KEY_MIDI_OFFSETS[selectedKey];
    let scaleOffset = NASHVILLE_OFFSETS[nashvilleNumber];
    let rootMidi = 60 + globalKeyOffset + scaleOffset; 
    let midiNotes = [];

    let intervals = (nashvilleNumber === "vii°") ? [0, 3, 6] : CHORD_INTERVALS[chordTypeName];
    if (!intervals) return [];

    for (let i = 0; i < intervals.length; i++) {
        midiNotes.push(rootMidi + intervals[i]);
    }
    return midiNotes;
}

// Helper to Play a Single Arp Note (Refined Envelope)
function playArpNote(noteMidi) {
    // Stop all oscillators sharply before starting the new note
    for (let i = 0; i < MAX_VOICES; i++) {
        chordOscillators[i].amp(0, 0.005); // Very quick stop
    }
    
    // Play only the first oscillator (voice) for the single note
    let osc = chordOscillators[0]; 
    osc.freq(midiToFreq(noteMidi));
    
    // Use an envelope for a distinct, non-overlapping arpeggio note
    const attackTime = 0.005;
    const holdTime = (ARP_INTERVAL_MS / 1000) * 0.5; // Sustain for half the interval
    const releaseTime = 0.05;

    osc.amp(0.8, attackTime); // Attack
    osc.amp(0.8, holdTime + attackTime); // Hold
    osc.amp(0, holdTime + attackTime + releaseTime); // Release
}

function startArpeggiator() {
    if (arpLoop) clearInterval(arpLoop);

    // Stop rhythmic checker if running (to prevent conflict)
    // The base logic for startRepeatCheckerLoop is removed, so this is just for safety:
    // if (repeatModeLoop) clearInterval(repeatModeLoop); 
    
    arpStep = 0; // Reset to the first note

    arpLoop = setInterval(() => {
        if (!pressedPad) {
            stopAllChords(true); 
            return;
        }

        const selectedType = chordTypes[currentChordTypeIndex];
        const selectedChord = getChordNotes(pressedPad.number, selectedType);

        if (selectedChord.length === 0) return;

        let noteIndex;
        if (currentArpPattern === ARPEGGIATOR_PATTERNS.UP) {
            noteIndex = arpStep % selectedChord.length;
        } else if (currentArpPattern === ARPEGGIATOR_PATTERNS.DOWN) {
            noteIndex = selectedChord.length - 1 - (arpStep % selectedChord.length);
        }

        // --- CORE FIX: Calling single-note function for arpeggiation ---
        playArpNote(selectedChord[noteIndex]); 

        arpStep++;
        redraw();
    }, ARP_INTERVAL_MS);
}

function stopArpeggiator() {
    if (arpLoop) clearInterval(arpLoop);
    arpLoop = null;
    stopAllChords(false);
}


// --- DRAWING FUNCTIONS ---

function draw() {
    background(BG_COLOR); 
    
    // FIX 2: Calculate and apply the scaling transformation for responsiveness
    const scaleFactor = Math.min(windowWidth / DESIGN_W, windowHeight / DESIGN_H);
    
    push(); 
    
    // Apply scaling and centering
    translate(
        (windowWidth - DESIGN_W * scaleFactor) / 2,
        (windowHeight - DESIGN_H * scaleFactor) / 2
    );
    scale(scaleFactor);
    
    // All drawing happens here at the original design resolution (1920x1080)
    drawHeader();
    drawChordPads(); 
    drawFeaturePads();
    drawSlider();
    
    pop(); 

    // The logic to handle dragging is now entirely in touchMoved()
}

function drawHeader() {
    fill(40);
    textSize(60);
    textAlign(LEFT, TOP);
    text("DS-01", 50, 40);
    textSize(30);
    fill(230, 80, 80); 
    text("DIGITAL SYNTHESIZER", 50, 100);

    // Current Status Display (Info)
    fill(40);
    textSize(30);
    let key = ALL_KEYS[currentKeyIndex];
    let type = chordTypes[currentChordTypeIndex];
    text(`Key: ${key} | Quality: ${type} | BPM: ${BPM}`, 50, 200);
    
    // Arpeggiator/Repeat Mode Status Display
    fill(repeatModeActive ? [255, 100, 100] : [100]); 
    textSize(22);
    textAlign(LEFT, BOTTOM);
    text(`Mode: ${repeatModeActive ? 'ARPEGGIATOR' : 'HOLD'}`, 50, DESIGN_H - 40);
}

function drawChordPads() {
    for (let pad of chordPads) {
        // Shadow 
        fill(10, 10, 10, 20);
        rect(pad.x + 5, pad.y + 5, pad.w, pad.h, 15);
        
        // Pad body
        fill(pad.isPressed ? [230, 230, 230] : PAD_BG_COLOR); 
        rect(pad.x, pad.y, pad.w, pad.h, 15);

        // Pad Text 
        fill(40);
        textSize(72);
        textAlign(CENTER, CENTER);
        text(pad.number, pad.x + pad.w / 2, pad.y + pad.h / 2); 
    }
}

function drawFeaturePads() {
    let padX = FEATURE_PAD_START_X;
    
    // 1. Key Selection Pad (Blue)
    let keyColor = FEATURE_COLORS.KEY;
    fill(keyColor[0], keyColor[1], keyColor[2], 255);
    rect(padX, FEATURE_PAD_Y, FEATURE_PAD_W, FEATURE_PAD_H, 10);

    // 2. Drum Machine Pad (Grey)
    let drumColor = drumMachineActive ? FEATURE_COLORS.DRUM : [70, 70, 70]; 
    fill(drumColor[0], drumColor[1], drumColor[2], 255);
    rect(padX + FEATURE_PAD_W + FEATURE_PAD_GAP, FEATURE_PAD_Y, FEATURE_PAD_W, FEATURE_PAD_H, 10);
    
    // 3. Repeat Mode Pad (Yellow) - Now ARPEGGIATOR
    let repeatColor = FEATURE_COLORS.REPEAT; 
    fill(repeatColor[0], repeatColor[1], repeatColor[2], repeatModeActive ? 255 : 200); 
    rect(padX + 2 * (FEATURE_PAD_W + FEATURE_PAD_GAP), FEATURE_PAD_Y, FEATURE_PAD_W, FEATURE_PAD_H, 10);
}

function drawSlider() {
    let knobY = map(sliderPos, 0, 1, SLIDER_Y_MAX, SLIDER_Y_MIN);

    // Track Line
    fill(40); 
    rect(SLIDER_X - 5, SLIDER_Y_MIN - 10, 10, SLIDER_Y_MAX - SLIDER_Y_MIN + 20, 5);

    // Knob (Orange Circle)
    fill(255, 100, 0); 
    ellipse(SLIDER_X, knobY, SLIDER_RADIUS * 2);
}


// --- INTERACTION LOGIC (MULTI-TOUCH) ---

function updateChordType() {
    let numTypes = chordTypes.length;
    let newIndex = floor(map(sliderPos, 0, 1, numTypes - 1, 0));
    let previousIndex = currentChordTypeIndex;

    currentChordTypeIndex = constrain(newIndex, 0, numTypes - 1);
    
    // FIX 1: Only re-trigger sound if the discrete chord type actually changed.
    if (pressedPad && currentChordTypeIndex !== previousIndex) {
        if (repeatModeActive) {
            // Restart Arpeggiator immediately with new chord notes
            startArpeggiator();
        } else {
            // Retrigger chord with new quality
            stopAllChords(true); 
            playChord(pressedPad.number, chordTypes[currentChordTypeIndex]);
        }
    }
}

function handleSliderDrag(y) {
    let newY = constrain(y, SLIDER_Y_MIN, SLIDER_Y_MAX);
    sliderPos = map(newY, SLIDER_Y_MAX, SLIDER_Y_MIN, 0, 1);
    updateChordType();
}

function getGrabbedY(id) {
    if (id === -1) return mouseY; 
    
    for (let t of touches) {
        if (t.id === id) {
            return t.y;
        }
    }
    return -1; 
}

function touchStarted() {
    let isTouch = touches.length > 0;
    let inputSource = isTouch ? touches : [{x: mouseX, y: mouseY, id: -1}];
    
    // Calculate scale factors for touch mapping
    const scaleFactor = Math.min(windowWidth / DESIGN_W, windowHeight / DESIGN_H);
    const inverseScale = 1 / scaleFactor;
    const xOffset = (windowWidth - DESIGN_W * scaleFactor) / 2;
    const yOffset = (windowHeight - DESIGN_H * scaleFactor) / 2;

    for (let i = 0; i < inputSource.length; i++) {
        let input = inputSource[i];
        
        // Map touch coordinates to design space coordinates
        let tx = (input.x - xOffset) * inverseScale;
        let ty = (input.y - yOffset) * inverseScale;
        let id = input.id;
        
        // --- 1. Check for SLIDER GRAB ---
        let knobY = map(sliderPos, 0, 1, SLIDER_Y_MAX, SLIDER_Y_MIN);
        let d = dist(tx, ty, SLIDER_X, knobY);
        
        if (d < SLIDER_RADIUS && !sliderGrabbed) {
            sliderGrabbed = true;
            grabbedTouchID = id; 
            return false; 
        }
        
        // --- 2. Check for FEATURE PADS ---
        let padX = FEATURE_PAD_START_X;
        
        // Key Selection Pad (Blue)
        if (tx > padX && tx < padX + FEATURE_PAD_W && ty > FEATURE_PAD_Y && ty < FEATURE_PAD_Y + FEATURE_PAD_H) {
            currentKeyIndex = (currentKeyIndex + 1) % ALL_KEYS.length;
            stopAllChords(true);
            pressedPad = null;
            redraw();
            return false;
        }
        
        // Drum Machine Pad (Grey)
        let drumX = padX + FEATURE_PAD_W + PAD_GAP_X;
        if (tx > drumX && tx < drumX + FEATURE_PAD_W && ty > FEATURE_PAD_Y && ty < FEATURE_PAD_Y + FEATURE_PAD_H) {
            drumMachineActive = !drumMachineActive;
            if (drumMachineActive) { startDrumSequencer(); } else { stopDrumSequencer(); }
            redraw();
            return false;
        }

        // Repeat/Arpeggiator Mode Pad (Yellow)
        let repeatX = padX + 2 * (FEATURE_PAD_W + PAD_GAP_X);
        if (tx > repeatX && tx < repeatX + FEATURE_PAD_W && ty > FEATURE_PAD_Y && ty < FEATURE_PAD_Y + FEATURE_PAD_H) {
            repeatModeActive = !repeatModeActive;
            
            if (repeatModeActive) {
                // If turning ON, start the Arpeggiator immediately if a pad is pressed
                if (pressedPad) startArpeggiator();
            } else {
                // If turning OFF, stop the Arpeggiator
                stopArpeggiator();
            }
            
            stopAllChords(true);
            pressedPad = null;
            for (let pad of chordPads) { pad.isPressed = false; }
            redraw();
            return false;
        }

        // --- 3. Check for CHORD PADS ---
        for (let pad of chordPads) {
            if (tx > pad.x && tx < pad.x + pad.w && ty > pad.y && ty < pad.y + pad.h) {
                
                let selectedType = chordTypes[currentChordTypeIndex];
                
                if (repeatModeActive) {
                    // ARPEGGIATOR MODE: Start/switch the arpeggiator on this pad
                    pressedPad = pad;
                    pad.isPressed = true;
                    startArpeggiator(); 
                } else {
                    // HOLD MODE: Play full chord
                    stopAllChords(false);
                    playChord(pad.number, selectedType); 
                    pad.isPressed = true;
                    pressedPad = pad; 
                }
                redraw();
                return false;
            }
        }
        
        // 4. Check for FULLSCREEN TAP ZONE
        if (tx > 0 && tx < FULLSCREEN_TAP_ZONE_W && ty > 0 && ty < FULLSCREEN_TAP_ZONE_H) {
            if (!isOverAnyControl(tx, ty)) {
                let fs = fullscreen();
                fullscreen(!fs);
                return false;
            }
        }
    }
    
    redraw();
    return false;
}

function touchMoved() {
    if (sliderGrabbed) {
        let ty = getGrabbedY(grabbedTouchID); 
        
        if (ty !== -1) {
             // Map the window coordinate back to the design coordinate space for dragging
             const scaleFactor = Math.min(windowWidth / DESIGN_W, windowHeight / DESIGN_H);
             const inverseScale = 1 / scaleFactor;
             const yOffset = (windowHeight - DESIGN_H * scaleFactor) / 2;
             
             let designY = (ty - yOffset) * inverseScale;
             
             handleSliderDrag(designY);
             return false; 
        }
    }
}

function touchEnded() {
    if (sliderGrabbed) {
        let isGrabbedInputReleased = true;
        
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
            sliderGrabbed = false;
            grabbedTouchID = -1;
        }
    }
    
    // Stop sound if a pad was pressed
    if (pressedPad) {
        if (repeatModeActive) {
            stopArpeggiator(); // Stop the repeating timer
        }
        stopAllChords(false); 
        pressedPad.isPressed = false;
        pressedPad = null;
    }
    redraw();
    return false;
}

function doubleClicked() {
    let clickX = mouseX;
    let clickY = mouseY;
    
    const scaleFactor = Math.min(windowWidth / DESIGN_W, windowHeight / DESIGN_H);
    const inverseScale = 1 / scaleFactor;
    const xOffset = (windowWidth - DESIGN_W * scaleFactor) / 2;
    const yOffset = (windowHeight - DESIGN_H * scaleFactor) / 2;
    
    let designX = (clickX - xOffset) * inverseScale;
    let designY = (clickY - yOffset) * inverseScale;
    
    if (!isOverAnyControl(designX, designY)) {
        let fs = fullscreen();
        fullscreen(!fs);
    }
    return false; 
}

function drawFeatureButton(label, x, y, w, h, isActive, activeColor) {
    fill(activeColor);
    rect(x, y, w, h, 10);
    fill(255);
    textSize(28);
    textAlign(CENTER, CENTER);
    text(label, x + w / 2, y + h / 2);
}