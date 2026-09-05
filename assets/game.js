const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');

// Détection du mode
const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768;
if (isMobile) {
  document.getElementById('desktop-controls').style.display = 'none';
  document.getElementById('mobile-controls').style.display = 'inline';
} else {
  document.getElementById('desktop-controls').style.display = 'inline';
  document.getElementById('mobile-controls').style.display = 'none';
}

const W = canvas.width;
const H = canvas.height;
const keys = {};

let paused = false;
let score = 0;
let best = parseInt(localStorage.getItem('platfBest') || '0');
bestEl.textContent = best;

const player = {
  x: 50, y: 0, w: 30, h: 40,
  vx: 0, vy: 0,
  speed: 4.5,
  jumpForce: -13,
  gravity: 0.6,
  onGround: false,
  facing: 1
};

let currentLevel = 1;
let lives = 10;
let maxLives = 10;
let invincible = false;
let finished = false;
let level = null;
let camX = 0;
let checkpoint = null;

// === CONTROLES MOBILES ===
let mobileKeys = { left: false, right: false, jump: false };

function setupMobileControls() {
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnJump = document.getElementById('btn-jump');

  function setupButton(btn, keyOn, keyOff) {
    const start = (e) => {
      e.preventDefault();
      btn.classList.add('active');
      mobileKeys[keyOn] = true;
      if (keyOff) mobileKeys[keyOff] = false;
    };
    const end = (e) => {
      e.preventDefault();
      btn.classList.remove('active');
      mobileKeys[keyOn] = false;
    };
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', end, { passive: false });
    btn.addEventListener('touchcancel', end, { passive: false });
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
    btn.addEventListener('mouseleave', end);
  }

  setupButton(btnLeft, 'left', 'right');
  setupButton(btnRight, 'right', 'left');
  
  btnJump.addEventListener('touchstart', (e) => {
    e.preventDefault();
    btnJump.classList.add('active');
    mobileKeys.jump = true;
  }, { passive: false });
  btnJump.addEventListener('touchend', (e) => {
    e.preventDefault();
    btnJump.classList.remove('active');
    mobileKeys.jump = false;
  }, { passive: false });
  btnJump.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    btnJump.classList.remove('active');
    mobileKeys.jump = false;
  }, { passive: false });
  btnJump.addEventListener('mousedown', () => {
    btnJump.classList.add('active');
    mobileKeys.jump = true;
  });
  btnJump.addEventListener('mouseup', () => {
    btnJump.classList.remove('active');
    mobileKeys.jump = false;
  });
  btnJump.addEventListener('mouseleave', () => {
    btnJump.classList.remove('active');
    mobileKeys.jump = false;
  });
}

// Ne configurer les contrôles mobiles que si nécessaire
if (isMobile) {
  setupMobileControls();
}

// === FONCTIONS DU JEU ===

function setCheckpoint() {
  checkpoint = {
    x: player.x,
    y: player.y,
    level: currentLevel
  };
}

function respawnAtCheckpoint() {
  if (checkpoint && checkpoint.level === currentLevel) {
    player.x = checkpoint.x;
    player.y = checkpoint.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    camX = Math.max(0, Math.min(player.x - W / 2 + player.w / 2, level.width - W));
    showMessage('Retour au checkpoint', false);
  } else {
    respawn();
  }
}

function makeLevel(n) {
  const p = {
    count: 12 + n * 2,
    baseW: 150 - n * 6,
    up: 55 + n * 3,
    gap: 130 + n * 8
  };

  const platforms = [];
  let x = 0, y = H - 40;
  platforms.push({ x: 0, y: H - 40, w: 180, h: 40 });
  for (let i = 1; i < p.count; i++) {
    x += p.gap + Math.random() * 60;
    y = Math.max(H - 320, y - (p.up + Math.random() * 10));
    if (i % 3 === 0) y += 80;
    platforms.push({ x: x, y: y, w: p.baseW + Math.random() * 60, h: 30 });
  }

  const last = platforms[platforms.length - 1];
  const finish = { x: last.x + last.w, y: last.y - 90, w: 56, h: 90 };

  const coins = [];
  platforms.slice(1, -1).forEach(a => {
    const b = platforms[platforms.indexOf(a) + 1];
    const cx = a.x + a.w / 2;
    const cy = (a.y < b.y ? a.y : b.y) - 30;
    if (!coins.some(c => Math.abs(c.x - cx) < 40 && Math.abs(c.y - cy) < 30))
      coins.push({ x: cx - 10, y: cy, w: 20, h: 20, taken: false, magnetY: a.y });
  });

  const traps = [];
  if (n >= 2) {
    const spikeSurfaces = platforms.filter((a, i) => i > 0 && i % 2 === 0 && n >= 2);
    for (let i = 0; i < Math.min(spikeSurfaces.length, 2 + n); i++) {
      const plat = spikeSurfaces[i];
      if (plat) traps.push({ x: plat.x + plat.w / 2 - 25, y: plat.y - 14, w: 50, h: 14 });
    }
  }

  const enemies = [];
  const patrolPlats = platforms.slice(1);
  for (let i = 0; i < Math.min(2 + n, patrolPlats.length); i++) {
    const plat = patrolPlats[Math.floor((i * 3 + 1) % patrolPlats.length)];
    enemies.push({
      x: plat.x + plat.w / 2, y: plat.y - 26,
      w: 26, h: 26,
      dir: i % 2 === 0 ? 1 : -1,
      speed: 1 + n * 0.2 + (i % 3) * 0.2,
      minX: plat.x + 2, maxX: plat.x + plat.w - 26
    });
  }

  return { platforms, traps, enemies, coins, finish, spawn: { x: 50, y: H - 40 - player.h }, width: finish.x + 100 };
}

function loadLevel(n) {
  currentLevel = n;
  level = makeLevel(n);
  levelEl.textContent = currentLevel;
  lives = maxLives;
  updateLives();
  checkpoint = null;
  respawn();
  finished = false;
  invincible = true;
  setTimeout(() => invincible = false, 1000);
}

function respawn() {
  if (!level) return;
  player.x = level.spawn.x;
  player.y = level.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  if (level.coins) level.coins.forEach(c => c.taken = false);
  camX = 0;
  updateLives();
}

function updateLives() {
  let hearts = '';
  for (let i = 0; i < maxLives; i++) {
    hearts += i < lives ? '❤️' : '🖤';
  }
  livesEl.innerHTML = hearts;
}

function looseLife() {
  if (invincible) return;
  lives--;
  updateLives();
  if (lives <= 0) {
    gameOver();
  } else {
    invincible = true;
    setTimeout(() => invincible = false, 1500);
    if (checkpoint && checkpoint.level === currentLevel) {
      respawnAtCheckpoint();
    } else {
      respawn();
    }
  }
}

function gameOver() {
  paused = true;
  showMessage('💀 Game Over ! Score : ' + score, true);
  setTimeout(() => {
    lives = maxLives;
    score = 0;
    scoreEl.textContent = 0;
    checkpoint = null;
    loadLevel(1);
    paused = false;
  }, 2000);
}

function showMessage(txt, big) {
  const existing = document.querySelector('[data-msg]');
  if (existing) existing.remove();
  
  const msg = document.createElement('div');
  msg.dataset.msg = '1';
  msg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#ffd700;font-size:'+ (big?40:28) +'px;background:rgba(0,0,0,.85);padding:20px 40px;border-radius:10px;z-index:10;text-align:center;pointer-events:none;';
  msg.textContent = txt;
  document.body.appendChild(msg);
  msg.dataset.auto = '1';
  setTimeout(() => { if (msg.dataset.auto) msg.remove(); }, big ? 2000 : 1600);
  return msg;
}

function rectsCollide(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function addScore(v) {
  score += v;
  scoreEl.textContent = score;
  if (score > best) { best = score; localStorage.setItem('platfBest', best); bestEl.textContent = best; }
}

function update() {
  if (paused || !level) return;

  // === GESTION DES TOUCHES (clavier + mobile) ===
  let left = keys['ArrowLeft'] || keys['a'] || mobileKeys.left;
  let right = keys['ArrowRight'] || keys['d'] || mobileKeys.right;
  let jump = keys[' '] || keys['ArrowUp'] || keys['w'] || mobileKeys.jump;

  player.vx = 0;
  if (left) player.vx = -player.speed;
  if (right) player.vx = player.speed;
  if (player.vx !== 0) player.facing = player.vx > 0 ? 1 : -1;

  if (jump && player.onGround) {
    player.vy = player.jumpForce;
    player.onGround = false;
  }

  player.vy += player.gravity;
  player.x += player.vx;
  player.y += player.vy;

  player.onGround = false;
  for (const p of level.platforms) {
    if (rectsCollide(player, p)) {
      if (player.vy > 0 && player.y + player.h - p.y < 15) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
        if (p.x > 100) {
          setCheckpoint();
        }
      } else if (player.vy < 0 && p.y + p.h - player.y < 15) {
        player.y = p.y + p.h;
        player.vy = 0;
      } else if (player.x + player.w - p.x < 15) {
        player.x = p.x - player.w;
      } else if (p.x + p.w - player.x < 15) {
        player.x = p.x + p.w;
      }
    }
  }

  if (player.y > H) looseLife();

  for (const e of level.enemies) {
    e.x += e.dir * e.speed;
    if (e.x < e.minX) { e.x = e.minX; e.dir = 1; }
    if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.dir = -1; }
    if (rectsCollide(player, e)) looseLife();
  }

  for (const t of level.traps) {
    if (rectsCollide(player, t)) looseLife();
  }

  for (const c of level.coins) {
    if (!c.taken && rectsCollide(player, c)) {
      c.taken = true;
      addScore(10);
    }
  }

  if (!finished && rectsCollide(player, level.finish)) {
    finished = true;
    addScore(50 + currentLevel * 25);
    showMessage('🎉 Niveau ' + currentLevel + ' terminé !', false);
    setTimeout(() => loadLevel(currentLevel + 1), 1600);
  }

  camX = Math.max(0, Math.min(player.x - W / 2 + player.w / 2, level.width - W));
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (!level) return;

  ctx.save();
  ctx.translate(-camX, 0);

  for (const p of level.platforms) {
    ctx.fillStyle = '#e94560';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#ff8c42';
    ctx.fillRect(p.x, p.y, p.w, 6);
  }

  for (const t of level.traps) {
    ctx.fillStyle = '#9e9e9e';
    ctx.beginPath();
    ctx.moveTo(t.x, t.y + t.h);
    for (let i = 0; i <= 4; i++) {
      ctx.lineTo(t.x + i * 10 + 5, t.y);
      ctx.lineTo(t.x + (i + 1) * 10, t.y + t.h);
    }
    ctx.fill();
  }

  for (const e of level.enemies) {
    ctx.fillStyle = '#e91e63';
    ctx.beginPath();
    ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(e.dir > 0 ? e.x + e.w - 10 : e.x + 4, e.y + 7, 6, 6);
  }

  for (const c of level.coins) {
    if (c.taken) continue;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const f = level.finish;
  ctx.fillStyle = 'rgba(255,215,0,0.15)';
  ctx.beginPath();
  ctx.arc(f.x + f.w / 2, f.y + f.h / 2, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(f.x - 6, f.y - 6, f.w + 12, f.h + 6);
  ctx.fillStyle = '#8d6e63';
  ctx.fillRect(f.x, f.y, f.w, f.h);
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(f.x + f.w / 2 - 2, f.y, 4, f.h);
  ctx.fillRect(f.x + 4, f.y, 3, f.h);
  ctx.fillRect(f.x + f.w - 7, f.y, 3, f.h);
  ctx.fillStyle = '#ffd835';
  ctx.beginPath();
  ctx.arc(f.x + f.w - 12, f.y + f.h / 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,150,0.9)';
  ctx.fillRect(f.x + 8, f.y - f.h + f.h - 8 + 6, f.w - 16, 4);

  if (!(invincible && Math.floor(Date.now() / 100) % 2 === 0)) {
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(player.facing > 0 ? player.x + player.w - 8 : player.x, player.y + 8, 6, 6);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(player.facing > 0 ? player.x + player.w - 14 : player.x + 8, player.y + 20, 8, 4);
  }

  if (checkpoint && checkpoint.level === currentLevel) {
    const cx = checkpoint.x;
    const cy = checkpoint.y - 50;
    ctx.fillStyle = '#ff6b35';
    ctx.fillRect(cx + 12, cy + 20, 4, 20);
    ctx.beginPath();
    ctx.moveTo(cx + 16, cy + 20);
    ctx.lineTo(cx + 38, cy + 30);
    ctx.lineTo(cx + 16, cy + 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx + 14, cy + 40, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// === ÉVÉNEMENTS CLAVIER (toujours actifs) ===
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === 'p' || e.key === 'P') paused = !paused;
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', e => keys[e.key] = false);

// === BOUTON RECOMMENCER ===
document.getElementById('restart').addEventListener('click', () => {
  lives = maxLives;
  score = 0;
  scoreEl.textContent = 0;
  checkpoint = null;
  loadLevel(1);
  paused = false;
});

// === EMPÊCHER LE SCROLL SUR LES TOUCHES ===
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('#controls, canvas')) e.preventDefault();
}, { passive: false });

// === DÉTECTION DES CHANGEMENTS D'ORIENTATION ===
window.addEventListener('resize', () => {
  const nowMobile = window.innerWidth <= 768;
  const desktopControls = document.getElementById('desktop-controls');
  const mobileControls = document.getElementById('mobile-controls');
  const controls = document.getElementById('controls');
  
  if (nowMobile) {
    desktopControls.style.display = 'none';
    mobileControls.style.display = 'inline';
    controls.style.display = 'flex';
  } else {
    desktopControls.style.display = 'inline';
    mobileControls.style.display = 'none';
    controls.style.display = 'none';
  }
});

// === DÉMARRAGE ===
updateLives();
loadLevel(1);
loop();