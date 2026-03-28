const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const pc = document.getElementById('particles');
const pctx = pc.getContext('2d');

canvas.width = 700; canvas.height = 420;
pc.width = window.innerWidth; pc.height = window.innerHeight;

const W = canvas.width, H = canvas.height;
const WALL = 20, GOAL_H = 140, GOAL_D = 28;
const FLOOR = H - WALL, CEIL = WALL;
const GOAL_TOP = H/2 - GOAL_H/2, GOAL_BOT = H/2 + GOAL_H/2;

let matchTime = 60, scoreBlue = 0, scoreOrange = 0, gameRunning = false, msgTimer = 0;
let particles = [], boostPads = [];

// ── Boost pads ──────────────────────────────────────────
function initBoostPads() {
  boostPads = [
    { x: W/2, y: H/2, r: 14, active: true, timer: 0 },
    { x: 160, y: FLOOR - 10, r: 10, active: true, timer: 0 },
    { x: W-160, y: FLOOR - 10, r: 10, active: true, timer: 0 },
    { x: W/2, y: FLOOR - 10, r: 10, active: true, timer: 0 },
    { x: 160, y: CEIL + 80, r: 10, active: true, timer: 0 },
    { x: W-160, y: CEIL + 80, r: 10, active: true, timer: 0 },
  ];
}

// ── State ────────────────────────────────────────────────
let ball, blue, orange;

function makePlayer(x, col, isBlue) {
  return { x, y: FLOOR - 18, w: 44, h: 28, vx: 0, vy: 0,
    color: col, isBlue, onGround: false, boost: 100,
    jumps: 0, trail: [], boosting: false };
}

function resetEntities() {
  ball = { x: W/2, y: H/2 - 40, r: 16, vx: (Math.random()>0.5?1:-1)*3, vy:-2, spin: 0 };
  blue   = makePlayer(120, '#00aaff', true);
  orange = makePlayer(W-120, '#ff6600', false);
  initBoostPads();
}

// ── Particles ────────────────────────────────────────────
function spawnParticles(x, y, col, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
      life: 1, col, size: 3 + Math.random()*4 });
  }
}

function spawnBoostTrail(p) {
  const angle = Math.atan2(p.vy, p.vx) + Math.PI;
  const s = 2 + Math.random() * 2;
  particles.push({
    x: p.x + Math.cos(angle)*p.w*0.4,
    y: p.y + Math.sin(angle)*p.h*0.4,
    vx: Math.cos(angle)*s + (Math.random()-0.5)*2,
    vy: Math.sin(angle)*s + (Math.random()-0.5)*2,
    life: 0.7, col: p.isBlue ? '#00aaff' : '#ff6600', size: 5 + Math.random()*3
  });
}

function updateParticles() {
  pctx.clearRect(0, 0, pc.width, pc.height);
  // offset for canvas position
  const rect = canvas.getBoundingClientRect();
  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.15;
    p.life -= 0.025;
    p.vx *= 0.97; p.vy *= 0.97;
    if (p.life <= 0) return false;
    pctx.globalAlpha = p.life;
    pctx.fillStyle = p.col;
    pctx.beginPath();
    pctx.arc(rect.left + p.x, rect.top + p.y, p.size * p.life, 0, Math.PI*2);
    pctx.fill();
    return true;
  });
  pctx.globalAlpha = 1;
}

// ── Player physics ───────────────────────────────────────
function updatePlayer(p, left, right, jump, boost) {
  const ACCEL = 0.7, MAX_SPD = 7, FRICTION = 0.82, BOOST_PWR = 1.4, BOOST_DRAIN = 0.8;
  const GRAVITY = 0.55, JUMP_PWR = 13;

  let boosting = false;
  if (keys[boost] && p.boost > 0) {
    const bx = keys[left] ? -1 : keys[right] ? 1 : (p.isBlue ? 1 : -1);
    p.vx += bx * BOOST_PWR;
    p.vy -= 0.4;
    p.boost = Math.max(0, p.boost - BOOST_DRAIN);
    boosting = true;
    spawnBoostTrail(p);
  }
  p.boosting = boosting;

  if (keys[left])  p.vx -= ACCEL;
  if (keys[right]) p.vx += ACCEL;
  if (!keys[left] && !keys[right]) p.vx *= FRICTION;

  p.vy += GRAVITY;
  p.x += p.vx; p.y += p.vy;
  p.vx = Math.max(-MAX_SPD*2, Math.min(MAX_SPD*2, p.vx));

  // Floor
  p.onGround = false;
  if (p.y + p.h/2 >= FLOOR) {
    p.y = FLOOR - p.h/2; p.vy = 0;
    p.vx *= 0.88; p.onGround = true; p.jumps = 0;
    p.boost = Math.min(100, p.boost + 0.3);
  }
  // Ceiling
  if (p.y - p.h/2 <= CEIL) { p.y = CEIL + p.h/2; p.vy = Math.abs(p.vy)*0.5; }
  // Walls
  if (p.x - p.w/2 < WALL) { p.x = WALL + p.w/2; p.vx = Math.abs(p.vx)*0.5; }
  if (p.x + p.w/2 > W - WALL) { p.x = W - WALL - p.w/2; p.vx = -Math.abs(p.vx)*0.5; }

  // Jump
  if (keysJustPressed[jump] && p.jumps < 2) {
    p.vy = -JUMP_PWR * (p.jumps === 0 ? 1 : 0.75);
    p.jumps++;
    spawnParticles(p.x, p.y + p.h/2, p.color, 8, 4);
  }

  // Boost pads
  boostPads.forEach(pad => {
    if (!pad.active) return;
    const dx = p.x - pad.x, dy = p.y - pad.y;
    if (Math.sqrt(dx*dx+dy*dy) < pad.r + 16) {
      p.boost = Math.min(100, p.boost + (pad.r > 12 ? 40 : 20));
      pad.active = false; pad.timer = 300;
      spawnParticles(pad.x, pad.y, '#ffdd00', 12, 5);
    }
  });
}

function collideBallPlayer(p) {
  const dx = ball.x - p.x, dy = ball.y - p.y;
  const nx = dx / (p.w/2), ny = dy / (p.h/2);
  if (Math.abs(nx) <= 1.2 && Math.abs(ny) <= 1.2) {
    const len = Math.sqrt(dx*dx+dy*dy) || 1;
    const ndx = dx/len, ndy = dy/len;
    const overlap = ball.r - Math.sqrt(dx*dx+dy*dy) + 20;
    if (overlap > 0) {
      ball.x += ndx * overlap * 0.5;
      ball.y += ndy * overlap * 0.5;
      const relVx = ball.vx - p.vx, relVy = ball.vy - p.vy;
      const dot = relVx*ndx + relVy*ndy;
      if (dot < 0) {
        const restitution = 1.2;
        ball.vx -= (1+restitution) * dot * ndx;
        ball.vy -= (1+restitution) * dot * ndy;
        ball.vx += p.vx * 0.4;
        ball.vy += p.vy * 0.4;
        ball.spin += (p.vx * 0.1);
        spawnParticles(ball.x, ball.y, p.color, 6, 3);
      }
    }
  }
}

// ── Ball physics ─────────────────────────────────────────
function updateBall() {
  ball.x += ball.vx; ball.y += ball.vy;
  ball.vy += 0.35;
  ball.vx *= 0.995;
  ball.spin *= 0.97;

  // Ceiling
  if (ball.y - ball.r < CEIL) { ball.y = CEIL + ball.r; ball.vy = Math.abs(ball.vy)*0.6; ball.vx *= 0.95; }
  // Floor
  if (ball.y + ball.r > FLOOR) { ball.y = FLOOR - ball.r; ball.vy *= -0.6; ball.vx *= 0.92; ball.spin *= 0.7; }

  // Side walls — only outside goal opening
  if (ball.x - ball.r < WALL) {
    if (ball.y < GOAL_TOP || ball.y > GOAL_BOT) {
      ball.x = WALL + ball.r; ball.vx = Math.abs(ball.vx)*0.7;
    }
  }
  if (ball.x + ball.r > W - WALL) {
    if (ball.y < GOAL_TOP || ball.y > GOAL_BOT) {
      ball.x = W - WALL - ball.r; ball.vx = -Math.abs(ball.vx)*0.7;
    }
  }

  // Goal detection
  if (ball.x + ball.r < 0) { goal('orange'); return; }
  if (ball.x - ball.r > W) { goal('blue'); return; }

  // Speed cap
  const spd = Math.sqrt(ball.vx**2+ball.vy**2);
  if (spd > 22) { ball.vx = ball.vx/spd*22; ball.vy = ball.vy/spd*22; }
}

function goal(scorer) {
  if (scorer === 'blue') {
    scoreBlue++;
    document.getElementById('score-blue').textContent = scoreBlue;
    showMsg('🔵 BLUE SCORES!', '#00aaff');
    spawnParticles(W-GOAL_D, H/2, '#00aaff', 40, 8);
  } else {
    scoreOrange++;
    document.getElementById('score-orange').textContent = scoreOrange;
    showMsg('🟠 ORANGE SCORES!', '#ff6600');
    spawnParticles(GOAL_D, H/2, '#ff6600', 40, 8);
  }
  setTimeout(() => { resetEntities(); }, 1200);
}

// ── Input ────────────────────────────────────────────────
const keys = {}, keysJustPressed = {};
window.addEventListener('keydown', e => {
  if (!keys[e.key]) keysJustPressed[e.key] = true;
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

// ── Drawing ──────────────────────────────────────────────
function drawField() {
  // Background
  ctx.fillStyle = '#0d1f0d';
  ctx.fillRect(0, 0, W, H);

  // Grass stripes
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i%2===0 ? '#0d1f0d' : '#0f220f';
    ctx.fillRect(WALL, CEIL + i*(FLOOR-CEIL)/7, W-WALL*2, (FLOOR-CEIL)/7);
  }

  // Field lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W/2,CEIL); ctx.lineTo(W/2,FLOOR); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H/2, 70, 0, Math.PI*2); ctx.stroke();

  // Walls
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, WALL, H);
  ctx.fillRect(W-WALL, 0, WALL, H);
  ctx.fillRect(0, 0, W, CEIL);
  ctx.fillRect(0, FLOOR, W, H-FLOOR);

  // Goals
  ctx.fillStyle = 'rgba(0,170,255,0.15)';
  ctx.fillRect(0, GOAL_TOP, GOAL_D, GOAL_H);
  ctx.strokeStyle = '#00aaff';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, GOAL_TOP, GOAL_D, GOAL_H);

  ctx.fillStyle = 'rgba(255,102,0,0.15)';
  ctx.fillRect(W-GOAL_D, GOAL_TOP, GOAL_D, GOAL_H);
  ctx.strokeStyle = '#ff6600';
  ctx.strokeRect(W-GOAL_D, GOAL_TOP, GOAL_D, GOAL_H);

  // Boost pads
  boostPads.forEach(pad => {
    pad.timer = Math.max(0, pad.timer - 1);
    if (pad.timer <= 0 && !pad.active) pad.active = true;
    const pulse = Math.sin(Date.now()/300) * 0.3 + 0.7;
    ctx.globalAlpha = pad.active ? pulse : 0.2;
    ctx.fillStyle = '#ffdd00';
    ctx.beginPath(); ctx.arc(pad.x, pad.y, pad.r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, FLOOR - p.y, p.w*0.5, 6, 0, 0, Math.PI*2);
  ctx.fill();

  // Body
  const grad = ctx.createLinearGradient(-p.w/2, -p.h/2, p.w/2, p.h/2);
  grad.addColorStop(0, p.color);
  grad.addColorStop(1, p.isBlue ? '#0044aa' : '#aa3300');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(-p.w/2, -p.h/2, p.w, p.h, 8);
  ctx.fill();

  // Boost flame
  if (p.boosting) {
    ctx.fillStyle = p.isBlue ? '#88ddff' : '#ffaa44';
    const dir = p.isBlue ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(-dir*p.w/2, -6);
    ctx.lineTo(-dir*(p.w/2+12+Math.random()*8), 0);
    ctx.lineTo(-dir*p.w/2, 6);
    ctx.fill();
  }

  // Windshield
  ctx.fillStyle = 'rgba(200,230,255,0.25)';
  ctx.beginPath();
  ctx.roundRect(-p.w/4, -p.h/2+4, p.w/2, p.h/2-2, 4);
  ctx.fill();

  // Outline
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-p.w/2, -p.h/2, p.w, p.h, 8);
  ctx.stroke();

  // Wheels
  [-p.w/2+8, p.w/2-8].forEach(wx => {
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(wx, p.h/2-2, 7, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke();
  });

  ctx.restore();
}

function drawBall() {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.spin * 0.05);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, FLOOR - ball.y, ball.r*0.8, 5, 0, 0, Math.PI*2);
  ctx.fill();

  // Ball
  const grad = ctx.createRadialGradient(-ball.r*0.3, -ball.r*0.3, 1, 0, 0, ball.r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.5, '#dddddd');
  grad.addColorStop(1, '#999999');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(0, 0, ball.r, 0, Math.PI*2); ctx.fill();

  // Panel lines
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(i*Math.PI*2/5)*ball.r*0.3, Math.sin(i*Math.PI*2/5)*ball.r*0.3);
    ctx.lineTo(Math.cos(i*Math.PI*2/5)*ball.r, Math.sin(i*Math.PI*2/5)*ball.r);
    ctx.stroke();
  }

  ctx.restore();
}

// ── HUD ──────────────────────────────────────────────────
let msgCol = 'white';
function showMsg(text, col) {
  document.getElementById('hud-msg').textContent = text;
  document.getElementById('hud-msg').style.color = col || 'white';
  msgTimer = 150;
}

let timerInterval;
function startTimer() {
  let t = matchTime;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!gameRunning) return;
    t--;
    const m = Math.floor(t/60), s = t%60;
    document.getElementById('hud-timer').textContent = m+':'+(s<10?'0':'')+s;
    if (t <= 0) { clearInterval(timerInterval); endGame(); }
  }, 1000);
}

function endGame() {
  gameRunning = false;
  showScreen('screen-end');
  const et = document.getElementById('end-title');
  const es = document.getElementById('end-score');
  es.textContent = scoreBlue + ' — ' + scoreOrange;
  if (scoreBlue > scoreOrange) {
    et.textContent = '🔵 BLUE WINS!'; et.style.color = '#00aaff';
  } else if (scoreOrange > scoreBlue) {
    et.textContent = '🟠 ORANGE WINS!'; et.style.color = '#ff6600';
  } else {
    et.textContent = "IT'S A DRAW!"; et.style.color = 'white';
  }
}

// ── Screens ──────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

document.getElementById('btn-start').onclick = () => {
  scoreBlue = 0; scoreOrange = 0;
  document.getElementById('score-blue').textContent = '0';
  document.getElementById('score-orange').textContent = '0';
  resetEntities();
  showScreen('screen-game');
  gameRunning = true;
  startTimer();
};

document.getElementById('btn-rematch').onclick = () => {
  scoreBlue = 0; scoreOrange = 0;
  document.getElementById('score-blue').textContent = '0';
  document.getElementById('score-orange').textContent = '0';
  resetEntities();
  showScreen('screen-game');
  gameRunning = true;
  startTimer();
};

document.getElementById('btn-menu').onclick = () => {
  gameRunning = false;
  clearInterval(timerInterval);
  showScreen('screen-menu');
};

document.querySelectorAll('.time-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    matchTime = parseInt(btn.dataset.t);
  };
});

// ── Main loop ────────────────────────────────────────────
function loop() {
  Object.keys(keysJustPressed).forEach(k => delete keysJustPressed[k]);

  if (gameRunning) {
    updatePlayer(blue,   'a', 'd', 'w', 's');
    updatePlayer(orange, 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown');
    collideBallPlayer(blue);
    collideBallPlayer(orange);
    updateBall();

    if (msgTimer > 0) { msgTimer--; if (msgTimer===0) document.getElementById('hud-msg').textContent=''; }

    document.getElementById('boost-blue').style.width   = blue.boost + '%';
    document.getElementById('boost-orange').style.width = orange.boost + '%';

    drawField();
    drawPlayer(blue);
    drawPlayer(orange);
    drawBall();
  }

  updateParticles();
  requestAnimationFrame(loop);
}

resetEntities();
loop();
