// --- AUDIO SYSTEM VARIABLES ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContext();
const bgMusic = new Audio('https://cdn.pixabay.com/audio/2022/05/17/audio_37289f6654.mp3'); 
bgMusic.loop = true;
bgMusic.volume = 0.2;

// --- GAME VARIABLES ---
let playerName = "";
let isPaused = false;
let isMuted = false;
let isDragging = false; 

let localLeaderboard = [
    { name: "SniperWolf", score: 1200 },
    { name: "BouncerX", score: 950 },
    { name: "ProShot", score: 820 },
    { name: "LuckyLuke", score: 700 },
    { name: "NoobMaster", score: 550 }
];

let gameState = { points: 0, ballsRemaining: 10, isGameRunning: false };

const GRAVITY = -0.005;
const RESTITUTION = 0.6;
const BALL_RADIUS = 0.16;

let scene, camera, renderer, aimBall, groundPlane, stars, trajectoryLine;
let activeBalls = []; 
let targetCups = [];
let particles = [];
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let dragStart = new THREE.Vector3();
let dragCurrent = new THREE.Vector3();
let shotVelocity = new THREE.Vector3();

function init() {
  const container = document.getElementById("game-container");
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 8, 11);
  camera.lookAt(0, 0, -2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true; 
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  
  // Main white light (centered reflection)
  const light = new THREE.PointLight(0xffffff, 1, 100);
  light.position.set(0, 15, 5); 
  light.castShadow = true;
  scene.add(light);

  // --- UPDATED: Yellow/Orange Fill Light is now CENTERED ---
  const fillLight = new THREE.PointLight(0xf97316, 0.8, 100);
  fillLight.position.set(0, 5, 5); // Changed X from -5 to 0
  scene.add(fillLight);

  createWorld();
  createTrajectoryLine(); 
  setupEvents();
  
  window.addEventListener('resize', onWindowResize, false);
  
  animate();
}

function onWindowResize() {
    const container = document.getElementById("game-container");
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function createWorld() {
  // --- UPDATED: REFLECTIVE TABLE MATERIAL ---
  groundPlane = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.2, 25), 
    new THREE.MeshStandardMaterial({ 
        color: 0x0f172a, 
        // Increased roughness to 0.25 (was 0.1). 
        // Higher roughness spreads the light out, making the reflection BIGGER.
        roughness: 0.25,  
        metalness: 0.4   
    })
  );
  groundPlane.position.y = -0.1;
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);

  const starGeo = new THREE.BufferGeometry();
  const starVerts = [];
  for (let i = 0; i < 2000; i++) starVerts.push((Math.random()-0.5)*120, (Math.random()-0.5)*120, (Math.random()-0.5)*120);
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 }));
  scene.add(stars);

  // Cups
  const cupPoints = [];
  cupPoints.push(new THREE.Vector2(0, 0.05));
  cupPoints.push(new THREE.Vector2(0.25, 0.05));
  cupPoints.push(new THREE.Vector2(0.35, 0.7));
  cupPoints.push(new THREE.Vector2(0.38, 0.72)); 
  cupPoints.push(new THREE.Vector2(0.40, 0.7)); 
  cupPoints.push(new THREE.Vector2(0.40, 0.65));
  cupPoints.push(new THREE.Vector2(0.28, 0));
  cupPoints.push(new THREE.Vector2(0, 0));

  const cupGeo = new THREE.LatheGeometry(cupPoints, 128); 
  cupGeo.computeVertexNormals();

  const rows = [5, 4, 3, 2, 1];
  rows.forEach((count, rowIndex) => {
    const z = 2 - rowIndex * 1.4;
    const startX = -((count - 1) * 1.4) / 2;
    for (let i = 0; i < count; i++) {
      const isGold = rowIndex === 4;
      const isRed = rowIndex > 1; 
      
      const color = isGold ? 0xfacc15 : (isRed ? 0xef4444 : 0x22c55e);
      
      const mat = new THREE.MeshPhysicalMaterial({ 
          color: color, 
          roughness: 0.2,
          metalness: 0.1,
          clearcoat: 0.5,
          clearcoatRoughness: 0.1,
          side: THREE.DoubleSide
      });

      const cup = new THREE.Mesh(cupGeo, mat);
      cup.position.set(startX + i * 1.4, 0, z);
      cup.castShadow = true;
      cup.receiveShadow = true;
      
      if (isGold) cup.name = "gold";
      else if (isRed) cup.name = "red";
      else cup.name = "normal";
      
      scene.add(cup);
      targetCups.push(cup);
    }
  });
}

function createTrajectoryLine() {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineDashedMaterial({
        color: 0xffffff,
        linewidth: 1,
        scale: 1,
        dashSize: 0.1,
        gapSize: 0.1,
        // --- ADD THESE TWO LINES ---
        transparent: true,  // This allows the line to be see-through
        opacity: 0.3,       // Set this between 0.1 (faint) and 1.0 (solid). 0.3 is a good ghost effect.
        // ---------------------------
    });
    const points = new Float32Array(40 * 3); 
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    trajectoryLine = new THREE.Line(geometry, material);
    trajectoryLine.visible = false; 
    scene.add(trajectoryLine);
}

function updateTrajectory(velocity) {
    if (!aimBall) return;
    const points = [];
    const tempPos = aimBall.position.clone();
    const tempVel = velocity.clone();
    
    // Simulate physics
    for(let i=0; i<40; i++) {
        points.push(tempPos.x, tempPos.y, tempPos.z);
        tempVel.y += GRAVITY;
        tempPos.add(tempVel);
        if(tempPos.y < 0) break;
    }
    
    const posAttr = trajectoryLine.geometry.attributes.position;
    posAttr.count = points.length / 3;
    for(let i=0; i<points.length; i++) {
        posAttr.array[i] = points[i];
    }
    posAttr.needsUpdate = true;
    trajectoryLine.computeLineDistances();
    trajectoryLine.visible = true;
}

function animate() {
  requestAnimationFrame(animate);

  if (isPaused) {
    renderer.render(scene, camera);
    return;
  }

  if (stars) stars.rotation.y += 0.0002;

  // Particle Logic
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.position.add(p.velocity);
    p.life -= 0.02;
    p.scale.setScalar(p.life);
    if (p.life <= 0) { scene.remove(p); particles.splice(i, 1); }
  }

  // Ball Physics
  for (let i = activeBalls.length - 1; i >= 0; i--) {
    const b = activeBalls[i];
    b.velocity.y += GRAVITY;
    b.position.add(b.velocity);
    
    if (b.position.y <= BALL_RADIUS) {
      if (Math.abs(b.velocity.y) > 0.05) playSfx('bounce');
      b.position.y = BALL_RADIUS;
      b.velocity.y *= -RESTITUTION;
      b.velocity.x *= 0.96;
      b.velocity.z *= 0.96;
    }

    let removed = false;
    for (let cup of targetCups) {
      const dist = Math.sqrt(Math.pow(b.position.x - cup.position.x, 2) + Math.pow(b.position.z - cup.position.z, 2));
      
      if (dist < 0.32 && b.position.y < 0.7 && b.position.y > 0.3) {
        playSfx('score');
        
        let pointsAwarded = 30; 
        if (cup.name === "gold") pointsAwarded = 100;
        else if (cup.name === "red") pointsAwarded = 50;

        gameState.points += pointsAwarded;
        document.getElementById("points-display").textContent = gameState.points;
        createExplosion(cup.position, cup.material.color);
        createFloatingScore(cup.position, pointsAwarded); 

        scene.remove(b);
        activeBalls.splice(i, 1);
        removed = true;
        break;
      }
    }
    
    if (!removed && (b.position.z < -15 || b.position.y < -5 || b.velocity.length() < 0.002)) {
      if (!b.userData.failPlayed) {
          playSfx('fail');
          b.userData.failPlayed = true; 
      }
      scene.remove(b);
      activeBalls.splice(i, 1);
    }
  }

  if (gameState.ballsRemaining === 0 && activeBalls.length === 0 && gameState.isGameRunning) {
    gameState.isGameRunning = false;
    setTimeout(showEndScreen, 800);
  }
  renderer.render(scene, camera);
}

function createFloatingScore(pos3D, score) {
    const el = document.createElement('div');
    el.className = 'floating-score';
    el.textContent = `+${score}`;
    
    if (score >= 100) el.style.color = '#facc15'; 
    else if (score === 50) el.style.color = '#ef4444'; 
    else el.style.color = '#22c55e'; 

    const vec = pos3D.clone();
    vec.y += 0.8; 
    vec.project(camera);

    const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(vec.y * 0.5) + 0.5) * window.innerHeight;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800); 
}

function setupEvents() {
  document.getElementById("start-game-btn").onclick = () => {
    if (ctx.state === 'suspended' && !isMuted) ctx.resume();
    if (!isMuted) bgMusic.play().catch(()=>{});

    const input = document.getElementById("player-name-input");
    if (!playerName) {
      if (!input.value.trim()) return alert("Enter a nickname!");
      playerName = input.value.trim();
      document.getElementById("display-name").textContent = playerName;
    }
    document.getElementById("message-screen").classList.add("hidden");
    document.getElementById("tutorial-screen").classList.remove("hidden");
  };
  
  document.getElementById("confirm-start-btn").onclick = () => {
    document.getElementById("tutorial-screen").classList.add("hidden");
    resetGameplayState();
    gameState.isGameRunning = true;
    spawnAimBall();
  };

  document.getElementById("exit-game-btn").onclick = exitToMainMenu;
  document.getElementById("leaderboard-btn").onclick = showLeaderboard;
  document.getElementById("close-modal-btn").onclick = () => document.getElementById("modal-container").classList.add("hidden");

  document.getElementById("pause-btn").onclick = togglePause;
  document.getElementById("resume-btn").onclick = togglePause;
  document.getElementById("restart-btn").onclick = () => { togglePause(); restartGame(); };
  document.getElementById("quit-to-menu-btn").onclick = () => { togglePause(); exitToMainMenu(); };

  document.getElementById("audio-btn").onclick = () => {
      isMuted = !isMuted;
      const btn = document.getElementById("audio-btn");
      if (isMuted) {
          btn.innerHTML = "🔇";
          bgMusic.pause();
          ctx.suspend();
      } else {
          btn.innerHTML = "🔊";
          if(gameState.isGameRunning && !isPaused) bgMusic.play().catch(()=>{});
          ctx.resume();
      }
  };

  // --- MOUSE EVENTS FOR DRAG AND SHOOT ---
  
  window.addEventListener("mousedown", (e) => {
    if (e.target.closest('button')) return;
    if (!gameState.isGameRunning || gameState.ballsRemaining <= 0 || isPaused) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(groundPlane);

    if (hits.length > 0) {
        isDragging = true;
        dragStart.copy(hits[0].point);
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!gameState.isGameRunning || isPaused) return;
    
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    if (isDragging) {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(groundPlane);
        
        if (hits.length > 0) {
            dragCurrent.copy(hits[0].point);
            
            // --- UPDATED ARC LOGIC ---
            let forceVector = new THREE.Vector3().subVectors(dragStart, dragCurrent);
            
            // Increased power multiplier (was 0.06)
            forceVector.multiplyScalar(0.09); 
            
            // Significantly increased Y-component for higher arc (was 0.8)
            forceVector.y = forceVector.length() * 1.5; 
            
            // Cap the power so it doesn't fly into space
            if(forceVector.length() > 0.60) forceVector.setLength(0.60);

            shotVelocity.copy(forceVector);
            updateTrajectory(shotVelocity);
        }
    }
  });
  
  window.addEventListener("mouseup", (e) => {
    if (isDragging) {
        isDragging = false;
        trajectoryLine.visible = false; 
        
        if (shotVelocity.length() < 0.02) return;

        playSfx('shoot');
        const b = new THREE.Mesh(
            new THREE.SphereGeometry(BALL_RADIUS, 32, 32), 
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 })
        );
        
        b.position.copy(aimBall.position);
        b.velocity = shotVelocity.clone();
        b.castShadow = true;
        scene.add(b);
        activeBalls.push(b);
        
        gameState.ballsRemaining--;
        document.getElementById("balls-display").textContent = gameState.ballsRemaining;
        
        if (gameState.ballsRemaining === 0 && aimBall) { scene.remove(aimBall); aimBall = null; }
    }
  });
}

function togglePause() {
    if (!gameState.isGameRunning) return;
    isPaused = !isPaused;
    const pauseScreen = document.getElementById("pause-screen");
    isPaused ? pauseScreen.classList.remove("hidden") : pauseScreen.classList.add("hidden");
}

function restartGame() {
    resetGameplayState();
    gameState.isGameRunning = true;
    spawnAimBall();
    if(!isMuted) bgMusic.play().catch(()=>{});
}

// THIS FUNCTION CONTAINS THE FIX
function exitToMainMenu() {
  playerName = "";
  gameState.isGameRunning = false;
  isPaused = false;
  
  // 1. Hide in-game overlays
  document.getElementById("pause-screen").classList.add("hidden");
  document.getElementById("tutorial-screen").classList.add("hidden");

  // 2. SHOW the Main Start Screen (This was the missing line)
  document.getElementById("message-screen").classList.remove("hidden");

  // 3. Reset text/inputs
  document.getElementById("display-name").textContent = "Guest Player";
  document.getElementById("player-name-input").value = "";
  document.getElementById("message-text").innerHTML = "Ready to test your aim?";
  document.getElementById("start-game-btn").textContent = "START GAME";
  document.getElementById("name-entry-container").classList.remove("hidden");
  document.getElementById("exit-game-btn").classList.add("hidden");
  
  // 4. Stop music and reset vars
  bgMusic.pause();
  bgMusic.currentTime = 0;
  resetGameplayState();
}

function resetGameplayState() {
  gameState.points = 0;
  gameState.ballsRemaining = 10;
  document.getElementById("points-display").textContent = "0";
  document.getElementById("balls-display").textContent = "10";
  document.getElementById("rank-indicator").textContent = "";
  activeBalls.forEach(b => scene.remove(b));
  activeBalls = [];
  if(aimBall) { scene.remove(aimBall); aimBall = null; }
}

function showEndScreen() {
  playSfx('gameover');
  const rank = updateRank();
  if (gameState.points > 500) {
      localLeaderboard.push({ name: playerName || "YOU", score: gameState.points });
      localLeaderboard.sort((a, b) => b.score - a.score);
      localLeaderboard = localLeaderboard.slice(0, 5); 
  }
  document.getElementById("message-text").innerHTML = `
    <div class="text-7xl font-black text-white mb-2">${gameState.points}</div>
    <div class="text-yellow-400 font-black tracking-widest text-xl mb-4">RANK #${rank}</div>
    <div class="text-white opacity-80">Game Over! Play again or Exit?</div>
  `;
  document.getElementById("name-entry-container").classList.add("hidden");
  document.getElementById("start-game-btn").textContent = "CONTINUE";
  document.getElementById("exit-game-btn").classList.remove("hidden");
  document.getElementById("message-screen").classList.remove("hidden");
}

function updateRank() {
  const myScore = gameState.points;
  const ELITE_THRESHOLD = 500;
  if (myScore <= ELITE_THRESHOLD) return Math.floor(Math.random() * (100 - 6 + 1)) + 6;
  let allPlayers = [...localLeaderboard, { name: playerName || "YOU", score: myScore }];
  allPlayers.sort((a, b) => b.score - a.score);
  return allPlayers.findIndex(p => p.score === myScore) + 1;
}

function spawnAimBall() {
  if (aimBall) scene.remove(aimBall);
  aimBall = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 32), 
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.1 })
  );
  aimBall.position.set(0, BALL_RADIUS + 0.1, 6);
  scene.add(aimBall);
}

function createExplosion(pos, color) {
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), new THREE.MeshBasicMaterial({ color }));
    p.position.copy(pos);
    p.position.y += 0.4;
    p.velocity = new THREE.Vector3((Math.random()-0.5)*0.2, Math.random()*0.3, (Math.random()-0.5)*0.2);
    p.life = 1.0;
    scene.add(p);
    particles.push(p);
  }
}

function showLeaderboard() {
  const topFive = [...localLeaderboard].sort((a,b) => b.score - a.score).slice(0,5);
  let html = "";
  topFive.forEach((e, i) => { 
      const isPlayer = e.score === gameState.points && gameState.points > 0;
      const colorClass = isPlayer ? "text-yellow-400" : "text-white";
      html += `
        <div class="flex justify-between p-3 border-b border-white/10 ${colorClass}">
            <span>#${i+1} ${e.name}</span>
            <span class="font-bold">${e.score}</span>
        </div>`; 
  });
  document.getElementById("modal-content").innerHTML = html;
  document.getElementById("modal-container").classList.remove("hidden");
}

function playTone(freq, type, duration, vol = 0.1, slideTo = null) {
    if (ctx.state === 'suspended' || isMuted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

function playSfx(name) {
    if (ctx.state === 'suspended' || isMuted) return;
    switch(name) {
        case 'shoot': playTone(400, 'sine', 0.15, 0.3, 800); break;
        case 'bounce': playTone(150, 'sine', 0.1, 0.3, 50); break;
        case 'score': 
            playTone(1200, 'sine', 0.4, 0.2); 
            setTimeout(() => playTone(1800, 'triangle', 0.4, 0.1), 50);
            break;
        case 'fail': playTone(400, 'sawtooth', 0.4, 0.1, 100); break;
        case 'gameover':
            playTone(523.25, 'sine', 0.2, 0.2);
            setTimeout(() => playTone(659.25, 'sine', 0.2, 0.2), 100);
            setTimeout(() => playTone(783.99, 'sine', 0.4, 0.2), 200);
            break;
    }
}

// Start Game
init();