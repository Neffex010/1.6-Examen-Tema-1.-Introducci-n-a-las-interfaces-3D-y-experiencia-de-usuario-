const canvas = document.getElementById('galaga');
const ctx = canvas.getContext('2d');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

let gameState = 'START';
let score = 0;
let level = 1;
let lives = 3; 
let highScore = parseInt(localStorage.getItem('galagaHighScore')) || 0;

let nextLifeScore = 15000;
let shakeTime = 0; 
let levelBannerTimer = 0; 
let flashTimer = 0;       

let currentWave = 1;
let maxWaves = 2;

let player;
let enemies = [];
let particles = [];
let bullets = [];
let enemyBullets = []; 
let powerUps = []; 
let floatingTexts = []; 
let boss = null;

let enemyDir = 1;
let enemySpeed = 2;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const Synth = {
    playTone: (freq, type, duration, vol = 0.1) => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    shoot: () => Synth.playTone(400, 'square', 0.1, 0.05),
    explosion: () => {
        Synth.playTone(100, 'sawtooth', 0.2, 0.1);
        setTimeout(() => Synth.playTone(50, 'square', 0.2, 0.1), 50);
    },
    levelUp: () => {
        Synth.playTone(600, 'sine', 0.1);
        setTimeout(() => Synth.playTone(800, 'sine', 0.1), 150);
        setTimeout(() => Synth.playTone(1200, 'square', 0.3), 300);
    },
    bossHit: () => Synth.playTone(150, 'square', 0.05, 0.1),
    start: () => {
        Synth.playTone(400, 'triangle', 0.1);
        setTimeout(() => Synth.playTone(600, 'triangle', 0.4), 200);
    },
    powerUp: () => {
        Synth.playTone(600, 'sine', 0.1);
        setTimeout(() => Synth.playTone(900, 'sine', 0.2), 100);
    },
    extraLife: () => { 
        Synth.playTone(500, 'square', 0.1);
        setTimeout(() => Synth.playTone(1000, 'square', 0.2), 100);
        setTimeout(() => Synth.playTone(1500, 'square', 0.4), 200);
    }
};

const imgPlayer = new Image(); imgPlayer.src = 'img/nave.png';
const imgEnemy = new Image(); imgEnemy.src = 'img/enemigo.png';
const imgBoss = new Image(); imgBoss.src = 'img/jefe.png';
const imgFondo = new Image(); imgFondo.src = 'img/fondo.png'; 

const images = [imgPlayer, imgEnemy, imgBoss, imgFondo];
let imagesLoaded = 0;
images.forEach(img => {
    img.onload = () => {
        imagesLoaded++;
        if (imagesLoaded === images.length) animate();
    };
    img.onerror = () => {
        console.warn('Error cargando imagen:', img.src);
        imagesLoaded++;
    };
});

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x; this.y = y; this.text = text; this.color = color;
        this.alpha = 1; this.dy = -1.5; 
    }
    update() { this.y += this.dy; this.alpha -= 0.02; }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.textAlign = "center";
        ctx.shadowBlur = 4; ctx.shadowColor = "black";
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

class PowerUp {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.w = 22; this.h = 22;
        this.type = type; this.speed = 1.5; this.markedForDeletion = false;
        this.colors = ['#0088ff', '#ff0044', '#00ffff']; 
        this.glowColors = ['#88ccff', '#ff88aa', '#aaffff']; 
        this.letters = ['S', 'R', 'T'];
        this.names = ['SHIELD', 'RAPID!', 'FREEZE!']; 
        this.angle = 0; this.floatOffset = Math.random() * Math.PI * 2; 
    }
    update() {
        this.y += this.speed;
        this.x += Math.sin(this.angle + this.floatOffset) * 0.8;
        this.angle += 0.05; 
        if (this.y > GAME_HEIGHT) this.markedForDeletion = true;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
        let pulse = 1 + Math.sin(this.angle * 3) * 0.15;
        ctx.scale(pulse, pulse);
        ctx.rotate(this.angle);
        ctx.shadowBlur = 15; ctx.shadowColor = this.colors[this.type];
        ctx.strokeStyle = this.colors[this.type]; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -this.h / 2); ctx.lineTo(this.w / 2, 0);  
        ctx.lineTo(0, this.h / 2); ctx.lineTo(-this.w / 2, 0); 
        ctx.closePath();
        ctx.fillStyle = "rgba(10, 15, 30, 0.7)"; 
        ctx.fill(); ctx.stroke();
        ctx.rotate(-this.angle);
        ctx.fillStyle = "#ffffff"; ctx.shadowBlur = 8;
        ctx.shadowColor = this.glowColors[this.type];
        ctx.font = "bold 14px 'Orbitron', sans-serif"; 
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(this.letters[this.type], 0, 1);
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.velocity = { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6 };
        this.alpha = 1; this.friction = 0.96;
    }
    update() {
        this.velocity.x *= this.friction; this.velocity.y *= this.friction;
        this.x += this.velocity.x; this.y += this.velocity.y;
        this.alpha -= 0.04;
    }
    draw(ctx) {
        ctx.save(); ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, 4, 4);
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y, vx = 0, vy = -10) {
        this.x = x; this.y = y; this.w = 4; this.h = 12;
        this.vx = vx; this.vy = vy; this.markedForDeletion = false;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        if (this.y < 0 || this.x < 0 || this.x > GAME_WIDTH) this.markedForDeletion = true;
    }
    draw(ctx) {
        ctx.fillStyle = "#ffeb3b"; ctx.shadowBlur = 10; ctx.shadowColor = "red";
        ctx.fillRect(this.x, this.y, this.w, this.h); ctx.shadowBlur = 0;
    }
}

class EnemyBullet {
    constructor(x, y, vx = 0, vy = 6, color = "#ff0000") {
        this.x = x; this.y = y; this.w = 8; this.h = 8; 
        this.vx = vx; this.vy = vy; this.color = color;
        this.markedForDeletion = false;
    }
    update() {
        let factor = player.slowMoTimer > 0 ? 0.4 : 1;
        this.x += this.vx * factor; this.y += this.vy * factor;
        if (this.y > GAME_HEIGHT || this.x < 0 || this.x > GAME_WIDTH) this.markedForDeletion = true;
    }
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10; ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x + this.w/2, this.y + this.h/2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x; this.y = y; this.w = 32; this.h = 32;
        this.markedForDeletion = false; this.isDiving = false; this.isDying = false; 
        this.angle = 0; this.frameX = 0; this.timer = Math.floor(Math.random() * 100); 
        this.hp = 1; this.scoreValue = 100; this.hitTimer = 0; 
    }
    draw(ctx) {
        let frames = Math.max(1, Math.floor(imgEnemy.width / imgEnemy.height) || 1);
        let sWidth = imgEnemy.width / frames; let sHeight = imgEnemy.height;
        this.timer++;
        if (this.timer % 20 === 0) this.frameX = (this.frameX + 1) % frames;

        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2); 
        if (frames === 1) {
            let scaleEffect = 1 + Math.sin(this.timer * 0.15) * 0.1;
            ctx.scale(scaleEffect, 1 / scaleEffect); 
        }
        if (this.hitTimer > 0) {
            ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.6;
            this.hitTimer--;
        }
        ctx.drawImage(imgEnemy, this.frameX * sWidth, 0, sWidth, sHeight, -this.w / 2, -this.h / 2, this.w, this.h);
        ctx.restore();
    }
}

class TankEnemy extends Enemy {
    constructor(x, y) {
        super(x, y); this.w = 40; this.h = 40; this.hp = 3; this.scoreValue = 300; 
    }
    draw(ctx) {
        super.draw(ctx); 
        ctx.globalAlpha = 1.0;
        if (this.hp > 1) {
            ctx.save();
            ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
            ctx.strokeStyle = this.hp === 3 ? "#00ffff" : "#ffaa00"; 
            ctx.lineWidth = 2; ctx.beginPath();
            ctx.arc(0, 0, this.w / 2 + 2, 0, Math.PI * 2);
            ctx.stroke(); ctx.restore();
        }
    }
}

class ShooterEnemy extends Enemy {
    constructor(x, y) {
        super(x, y); 
        this.hp = 2; this.scoreValue = 250; 
        this.shootTimer = 100 + Math.random() * 100;
    }
    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#ff00ff";
        super.draw(ctx);
        ctx.restore();
    }
}

class Boss {
    constructor() {
        this.w = 120; this.h = 100;
        this.x = GAME_WIDTH / 2 - this.w / 2;
        this.y = 80;
        this.hp = 80; 
        this.maxHp = 80;
        this.dir = 1;
        this.bullets = [];
        this.shootCooldown = 0; 
        this.hitTimer = 0; 
        this.isDead = false; 
    }
    update() {
        let isPhase2 = this.hp <= this.maxHp * 0.66 && this.hp > this.maxHp * 0.33;
        let isPhase3 = this.hp <= this.maxHp * 0.33;

        let baseSpeed = isPhase3 ? 4.5 : (isPhase2 ? 3.5 : 2.5);
        let currentSpeed = player.slowMoTimer > 0 ? baseSpeed * 0.4 : baseSpeed;
        
        this.x += currentSpeed * this.dir;
        if (this.x > GAME_WIDTH - this.w || this.x < 0) this.dir *= -1;
        
        let shake = isPhase3 ? Math.random() * 6 - 3 : 0;
        this.y = 80 + Math.sin(Date.now() / (isPhase3 ? 150 : 300)) * (isPhase2 ? 30 : 20) + shake;

        if (this.shootCooldown <= 0) {
            if (isPhase3) {
                for(let i=-2; i<=2; i++) {
                    this.bullets.push(new EnemyBullet(this.x + this.w/2 - 4, this.y + this.h, i * 1.5, 5, "#ff0000"));
                }
                Synth.playTone(250, 'sawtooth', 0.1);
                this.shootCooldown = player.slowMoTimer > 0 ? 50 : 30; 

            } else if (isPhase2) {
                this.bullets.push(new EnemyBullet(this.x + this.w/2 - 4, this.y + this.h, -2, 4.5, "#ff00ff"));
                this.bullets.push(new EnemyBullet(this.x + this.w/2 - 4, this.y + this.h, 0, 5, "#ff00ff"));
                this.bullets.push(new EnemyBullet(this.x + this.w/2 - 4, this.y + this.h, 2, 4.5, "#ff00ff"));
                Synth.playTone(200, 'sawtooth', 0.1);
                this.shootCooldown = player.slowMoTimer > 0 ? 70 : 40; 
            } else {
                this.bullets.push(new EnemyBullet(this.x + this.w/2 - 4, this.y + this.h, 0, 5, "#ffff00"));
                Synth.playTone(150, 'sawtooth', 0.1);
                this.shootCooldown = player.slowMoTimer > 0 ? 90 : 45; 
            }
        } else {
            this.shootCooldown--;
        }
        this.bullets.forEach(b => b.update());
        this.bullets = this.bullets.filter(b => !b.markedForDeletion);
    }
    draw(ctx) {
        if (this.hitTimer > 0) {
            ctx.globalAlpha = 0.5;
            this.hitTimer--;
        }
        ctx.drawImage(imgBoss, this.x, this.y, this.w, this.h);
        ctx.globalAlpha = 1.0; 
        
        const hpPercent = this.hp / this.maxHp;
        ctx.fillStyle = "red";
        ctx.fillRect(this.x, this.y - 15, this.w, 8);
        
        if (this.hp <= this.maxHp * 0.33) ctx.fillStyle = Math.random() > 0.5 ? "white" : "red"; 
        else if (this.hp <= this.maxHp * 0.66) ctx.fillStyle = "#ff00ff"; 
        else ctx.fillStyle = "#00ff00"; 
        
        ctx.fillRect(this.x, this.y - 15, this.w * hpPercent, 8);
        
        this.bullets.forEach(b => b.draw(ctx));
    }
}

class Background {
    constructor() {
        this.x = 0; this.y = 0; this.width = GAME_WIDTH; this.height = GAME_HEIGHT; this.speed = 1;
    }
    update() {
        this.y += this.speed; if (this.y >= this.height) this.y = 0;
    }
    draw(ctx) {
        ctx.drawImage(imgFondo, this.x, this.y, this.width, this.height);
        ctx.drawImage(imgFondo, this.x, this.y - this.height, this.width, this.height);
    }
}

const bg = new Background();

class Player {
    constructor() {
        this.w = 40; this.h = 40;
        this.x = GAME_WIDTH / 2 - this.w / 2;
        this.y = GAME_HEIGHT - 60;
        this.speed = 5;
        this.cooldown = 0;
        this.invincibleTimer = 0; 
        this.hasShield = false;
        this.rapidFireTimer = 0;
        this.slowMoTimer = 0;
        this.tilt = 0; 
    }
    
    getHitbox() {
        return { x: this.x + 8, y: this.y + 12, w: 24, h: 24 };
    }

    update(input) {
        if (this.cooldown > 0) this.cooldown--;
        if (this.invincibleTimer > 0) this.invincibleTimer--; 
        if (this.rapidFireTimer > 0) this.rapidFireTimer--;
        if (this.slowMoTimer > 0) this.slowMoTimer--;
        
        let targetTilt = 0;

        if (input.keys.includes('ArrowLeft') && this.x > 0) {
            this.x -= this.speed; targetTilt = -0.25; 
        }
        if (input.keys.includes('ArrowRight') && this.x < GAME_WIDTH - this.w) {
            this.x += this.speed; targetTilt = 0.25;  
        }

        this.tilt += (targetTilt - this.tilt) * 0.2;
        
        let currentCooldownRate = this.rapidFireTimer > 0 ? 4 : 12;
        if (input.keys.includes('Space') && this.cooldown === 0) {
            if (this.rapidFireTimer > 0) {
                bullets.push(new Bullet(this.x + 6, this.y, -2, -10)); 
                bullets.push(new Bullet(this.x + this.w/2 - 2, this.y, 0, -10)); 
                bullets.push(new Bullet(this.x + this.w - 10, this.y, 2, -10)); 
            } else if (level >= 3) {
                bullets.push(new Bullet(this.x + 6, this.y));          
                bullets.push(new Bullet(this.x + this.w - 10, this.y)); 
            } else {
                bullets.push(new Bullet(this.x + this.w/2 - 2, this.y));
            }
            this.cooldown = currentCooldownRate; 
            Synth.shoot();
        }
    }
    draw(ctx) {
        if (this.invincibleTimer > 0 && Math.floor(Date.now() / 100) % 2 === 0) return;
        
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
        ctx.rotate(this.tilt);

        if (Math.random() > 0.3) {
            ctx.fillStyle = Math.random() > 0.5 ? "#ffaa00" : "#ff0000";
            ctx.beginPath();
            ctx.moveTo(-6, this.h / 2 - 5);
            ctx.lineTo(6, this.h / 2 - 5);
            ctx.lineTo(0, this.h / 2 + 10 + Math.random() * 15); 
            ctx.closePath();
            ctx.fill();
        }

        ctx.drawImage(imgPlayer, -this.w / 2, -this.h / 2, this.w, this.h);
        
        if (this.hasShield) {
            ctx.strokeStyle = "#0088ff"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); 
            ctx.stroke(); ctx.fillStyle = "rgba(0, 136, 255, 0.2)"; ctx.fill();
        }

        ctx.restore();
    }
}

class InputHandler {
    constructor() {
        this.keys = [];
        
        // 1. Controles de teclado originales
        window.addEventListener('keydown', e => {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) e.preventDefault();
            if (this.keys.indexOf(e.code) === -1) this.keys.push(e.code);
            
            if (e.code === 'Enter') {
                if (gameState === 'START' || gameState === 'GAMEOVER' || gameState === 'VICTORY') initGame();
            }
            if (e.code === 'KeyP') {
                if (gameState === 'PLAYING') {
                    gameState = 'PAUSED'; drawPauseScreen();
                } else if (gameState === 'PAUSED') {
                    gameState = 'PLAYING'; animate(); 
                }
            }
        });
        
        window.addEventListener('keyup', e => {
            const index = this.keys.indexOf(e.code);
            if (index > -1) this.keys.splice(index, 1);
        });
        
        window.addEventListener('blur', () => {
            this.keys = [];
            if (gameState === 'PLAYING') { gameState = 'PAUSED'; drawPauseScreen(); }
        });

        // 2. Inicializar controles táctiles
        this.setupMobileControls();
    }

    setupMobileControls() {
        const mapButton = (id, keyCode) => {
            const btn = document.getElementById(id);
            if (!btn) return;

            const press = (e) => {
                e.preventDefault(); 
                
                if (keyCode === 'Enter') {
                    if (gameState === 'START' || gameState === 'GAMEOVER' || gameState === 'VICTORY') initGame();
                } else if (keyCode === 'KeyP') {
                    if (gameState === 'PLAYING') {
                        gameState = 'PAUSED'; drawPauseScreen();
                    } else if (gameState === 'PAUSED') {
                        gameState = 'PLAYING'; animate(); 
                    }
                } else {
                    if (this.keys.indexOf(keyCode) === -1) this.keys.push(keyCode);
                }
            };

            const release = (e) => {
                e.preventDefault();
                const index = this.keys.indexOf(keyCode);
                if (index > -1) this.keys.splice(index, 1);
            };

            // Eventos táctiles para celular
            btn.addEventListener('touchstart', press, { passive: false });
            btn.addEventListener('touchend', release, { passive: false });
            btn.addEventListener('touchcancel', release, { passive: false });
            
            // Eventos de ratón por si haces pruebas dando clic en la PC
            btn.addEventListener('mousedown', press);
            btn.addEventListener('mouseup', release);
            btn.addEventListener('mouseleave', release);
        };

        mapButton('btn-left', 'ArrowLeft');
        mapButton('btn-right', 'ArrowRight');
        mapButton('btn-shoot', 'Space');
        mapButton('btn-start', 'Enter');
        mapButton('btn-pause', 'KeyP');
    }
}

function spawnEnemies() {
    if (level === 10) return; 
    const rows = Math.min(3 + Math.floor((level - 1) / 2), 6); 
    const cols = 8;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (r === 0 && level >= 2) {
                enemies.push(new TankEnemy(50 + c * 45, 50 + r * 35));
            } else if (r === rows - 1 && level >= 3 && c % 2 === 0) {
                enemies.push(new ShooterEnemy(50 + c * 45, 50 + r * 35));
            } else {
                enemies.push(new Enemy(50 + c * 45, 50 + r * 35));
            }
        }
    }
}

function initGame() {
    player = new Player();
    bullets = []; enemies = []; enemyBullets = []; particles = []; powerUps = []; floatingTexts = []; 
    boss = null; score = 0; level = 1; lives = 3; nextLifeScore = 15000; 
    enemySpeed = 2; enemyDir = 1; shakeTime = 0; levelBannerTimer = 120; flashTimer = 0;
    currentWave = 1; maxWaves = 2; 
    gameState = 'PLAYING';
    if (audioCtx.state === 'suspended') audioCtx.resume();
    Synth.start(); spawnEnemies();
}

function nextLevel() {
    level++; bullets = []; enemyBullets = []; enemies = []; powerUps = []; floatingTexts = [];
    enemyDir = 1; levelBannerTimer = 120; 
    currentWave = 1;
    maxWaves = level >= 5 ? 3 : 2; 
    
    if (level === 10) {
        Synth.playTone(300, 'square', 0.5); setTimeout(() => Synth.playTone(250, 'square', 0.5), 400);
        boss = new Boss();
    } else {
        enemySpeed = Math.min(4.5, enemySpeed + 0.15); Synth.levelUp(); spawnEnemies();
    }
}

function loseLife() {
    shakeTime = 25; flashTimer = 15; 
    if (player.hasShield) {
        player.hasShield = false; player.invincibleTimer = 60;
        Synth.explosion();
        for (let i = 0; i < 20; i++) particles.push(new Particle(player.x+20, player.y+20, "#0088ff"));
        return;
    }
    Synth.explosion();
    for (let i = 0; i < 30; i++) particles.push(new Particle(player.x + player.w/2, player.y + player.h/2, "red"));
    lives--;
    
    if (lives <= 0) {
        gameOver();
    } else {
        player.x = GAME_WIDTH / 2 - player.w / 2; player.y = GAME_HEIGHT - 60;
        player.invincibleTimer = 120; 
    }
}

function gameOver() {
    gameState = 'GAMEOVER';
    if (score > highScore) { highScore = score; localStorage.setItem('galagaHighScore', highScore); }
}
function victory() {
    gameState = 'VICTORY';
    if (score > highScore) { highScore = score; localStorage.setItem('galagaHighScore', highScore); }
}

function drawCRT(ctx) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    for (let i = 0; i < GAME_HEIGHT; i += 4) ctx.fillRect(0, i, GAME_WIDTH, 1);
    let gradient = ctx.createRadialGradient(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.4, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT);
    gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

function drawPauseScreen() {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = "#00ffff"; ctx.textAlign = "center"; ctx.font = "40px 'Press Start 2P', monospace";
    ctx.fillText("PAUSA", GAME_WIDTH / 2, GAME_HEIGHT / 2);
    ctx.fillStyle = "white"; ctx.font = "12px 'Press Start 2P', monospace";
    ctx.fillText("PRESIONA 'P' PARA CONTINUAR", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
    drawCRT(ctx); 
}

function drawUI() {
    ctx.fillStyle = "white"; ctx.font = "14px 'Press Start 2P', monospace"; ctx.textAlign = "left";
    ctx.fillText(`SCORE: ${score}`, 20, 30); ctx.fillText(`HI: ${highScore}`, 180, 30); 
    
    // Mostramos nivel y oleada actual
    ctx.fillText(`LVL: ${level}-${currentWave}`, 360, 30);
    
    if (gameState === 'PLAYING') {
        ctx.font = "12px 'Press Start 2P', monospace"; ctx.fillText("LIVES:", 20, GAME_HEIGHT - 20);
        for(let i = 0; i < lives; i++) { ctx.drawImage(imgPlayer, 95 + (i * 25), GAME_HEIGHT - 35, 20, 20); }
        
        ctx.textAlign = "center";
        if (player.rapidFireTimer > 0) { ctx.fillStyle = "#ff0044"; ctx.fillText("RAPID FIRE!", GAME_WIDTH / 2, 60); }
        if (player.slowMoTimer > 0) { ctx.fillStyle = "#00ffff"; ctx.fillText("TIME FREEZE!", GAME_WIDTH / 2, 80); }

        if (levelBannerTimer > 0) {
            ctx.fillStyle = `rgba(0, 255, 255, ${levelBannerTimer / 120})`;
            ctx.font = "24px 'Press Start 2P', monospace";
            let bannerText = level === 10 ? "BOSS BATTLE!" : `LEVEL ${level} - WAVE ${currentWave}`;
            ctx.fillText(bannerText, GAME_WIDTH / 2, GAME_HEIGHT / 2);
            levelBannerTimer--;
        }

    } else if (gameState === 'START') {
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = "#00ffff"; ctx.textAlign = "center"; ctx.font = "40px 'Press Start 2P', monospace";
        ctx.fillText("GALACTIC ", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50);
        ctx.fillStyle = "#aaaaaa"; ctx.font = "12px 'Press Start 2P', monospace";
        ctx.fillText("FLECHAS: MOVER", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10);
        ctx.fillText("ESPACIO: DISPARAR", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);
        ctx.fillText("P: PAUSAR", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50);
        let pulse = Math.floor(Date.now() / 600) % 2 === 0 ? "white" : "rgba(255,255,255,0)";
        ctx.fillStyle = pulse; ctx.font = "14px 'Press Start 2P', monospace";
        ctx.fillText("PRESS ENTER TO START", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100);

    } else if (gameState === 'GAMEOVER' || gameState === 'VICTORY') {
        ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = gameState === 'VICTORY' ? "#ffff00" : "red"; ctx.textAlign = "center";
        ctx.font = "40px 'Press Start 2P', monospace";
        ctx.fillText(gameState === 'VICTORY' ? "YOU WIN!" : "GAME OVER", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
        ctx.fillStyle = "white"; ctx.font = "14px 'Press Start 2P', monospace";
        if(gameState === 'VICTORY') ctx.fillText("GALAXY SAVED", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);
        ctx.fillText(`FINAL SCORE: ${score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60);
        ctx.fillText("PRESS ENTER TO RESTART", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100);
    }
}

const input = new InputHandler();

function animate() {
    if (gameState === 'PAUSED') return; 

    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.save();
    if (shakeTime > 0) {
        let magnitude = (shakeTime / 25) * 8;
        ctx.translate((Math.random() - 0.5) * magnitude, (Math.random() - 0.5) * magnitude);
        shakeTime--;
    }

    bg.update(); bg.draw(ctx);
    
    if (gameState === 'PLAYING') {
        player.update(input); player.draw(ctx);
        let pHb = player.getHitbox();

        if (score >= nextLifeScore) {
            if (lives < 3) {
                lives++; Synth.extraLife();
                floatingTexts.push(new FloatingText(player.x + player.w/2, player.y, "1UP!", "#00ff00"));
            } else {
                score += 5000; Synth.powerUp(); 
                floatingTexts.push(new FloatingText(player.x + player.w/2, player.y, "+5000", "#ffff00"));
            }
            nextLifeScore += 15000; 
        }
        
        bullets.forEach(b => { b.update(); b.draw(ctx); });
        bullets = bullets.filter(b => !b.markedForDeletion);
        
        enemyBullets.forEach(eb => {
            eb.update(); eb.draw(ctx);
            if (eb.x < pHb.x + pHb.w && eb.x + eb.w > pHb.x &&
                eb.y < pHb.y + pHb.h && eb.y + eb.h > pHb.y) {
                if (player.invincibleTimer <= 0) loseLife();
                eb.markedForDeletion = true;
            }
        });
        enemyBullets = enemyBullets.filter(eb => !eb.markedForDeletion);
        
        powerUps.forEach(pu => {
            pu.update(); pu.draw(ctx);
            if (pHb.x < pu.x + pu.w && pHb.x + pHb.w > pu.x && pHb.y < pu.y + pu.h && pHb.y + pHb.h > pu.y) {
                pu.markedForDeletion = true; Synth.powerUp();
                floatingTexts.push(new FloatingText(pu.x, pu.y, pu.names[pu.type], pu.colors[pu.type]));
                if (pu.type === 0) player.hasShield = true;
                if (pu.type === 1) player.rapidFireTimer = 180; 
                if (pu.type === 2) player.slowMoTimer = 180; 
            }
        });
        powerUps = powerUps.filter(p => !p.markedForDeletion);
        
        if (boss) {
            boss.update();
            if (!boss.isDead) boss.draw(ctx);
            
            bullets.forEach(b => {
                if (!b.markedForDeletion && boss && !boss.isDead &&
                    b.x < boss.x + boss.w && b.x + b.w > boss.x && b.y < boss.y + boss.h && b.y + b.h > boss.y) {
                    
                    b.markedForDeletion = true; boss.hp--; boss.hitTimer = 5; shakeTime = 5; Synth.bossHit();
                    particles.push(new Particle(b.x, b.y, "lime"));
                    
                    if (boss.hp <= 0 && !boss.isDead) {
                        boss.isDead = true; score += 5000;
                        floatingTexts.push(new FloatingText(boss.x + boss.w/2, boss.y + boss.h/2, "+5000", "#ff00ff"));
                        shakeTime = 50; Synth.explosion();
                        for(let i=0; i<50; i++) particles.push(new Particle(boss.x + boss.w/2, boss.y + boss.h/2, "lime"));
                        setTimeout(() => { victory(); }, 2000);
                    }
                }
            });
            
            if (boss && !boss.isDead) {
                boss.bullets.forEach(bb => {
                    if (bb.x < pHb.x + pHb.w && bb.x + bb.w > pHb.x && bb.y < pHb.y + pHb.h && bb.y + bb.h > pHb.y) {
                        if (player.invincibleTimer <= 0) loseLife(); bb.markedForDeletion = true;
                    }
                });
                if (pHb.x < boss.x + boss.w && pHb.x + pHb.w > boss.x && pHb.y < boss.y + boss.h && pHb.y + pHb.h > boss.y) {
                    if (player.invincibleTimer <= 0) loseLife();
                }
            }

            if (boss && boss.isDead) boss = null;

        } else {
            let hitEdge = false;
            let currentEnemySpeed = player.slowMoTimer > 0 ? enemySpeed * 0.4 : enemySpeed;
            let activeDivers = enemies.filter(e => e.isDiving).length;
            let maxDivers = Math.min(1 + Math.floor(level / 2), 5); 
            let totalEnemiesAlive = Math.max(enemies.length, 1);
            let adaptiveMultiplier = Math.max(1, 15 / totalEnemiesAlive); 

            enemies.forEach(en => {
                if (en.isDying) {
                    en.draw(ctx);
                    if (en.hitTimer <= 0) en.markedForDeletion = true;
                    return; 
                }

                if (en instanceof ShooterEnemy && !en.isDiving) {
                    en.shootTimer -= player.slowMoTimer > 0 ? 0.4 : 1;
                    if (en.shootTimer <= 0) {
                        let dx = (player.x + player.w/2) - (en.x + en.w/2);
                        let dy = (player.y + player.h/2) - (en.y + en.h/2);
                        let dist = Math.sqrt(dx*dx + dy*dy);
                        let vx = (dx / dist) * 4;
                        let vy = (dy / dist) * 4;
                        
                        enemyBullets.push(new EnemyBullet(en.x + en.w/2 - 4, en.y + en.h, vx, vy, "#ff00ff"));
                        en.shootTimer = 120 + Math.random() * 80; 
                        Synth.playTone(300, 'triangle', 0.1); 
                    }
                }

                if (!en.isDiving) {
                    en.x += currentEnemySpeed * enemyDir;
                    if (en.x > GAME_WIDTH - en.w || en.x < 0) hitEdge = true;
                    
                    let baseDiveChance = 0.0002 + (level * 0.0001);
                    if (Math.random() < baseDiveChance * adaptiveMultiplier && level >= 2 && activeDivers < maxDivers) {
                        en.isDiving = true; activeDivers++;
                    }
                } else {
                    let diveSpeed = 4 + (level * 0.2);
                    en.y += player.slowMoTimer > 0 ? diveSpeed * 0.4 : diveSpeed; 
                    
                    if (player.x > en.x) en.x += (player.slowMoTimer > 0 ? 0.5 : 1.5);
                    else en.x -= (player.slowMoTimer > 0 ? 0.5 : 1.5);

                    en.angle += 0.1;
                    
                    if (en.y > GAME_HEIGHT) {
                        en.y = -50; en.isDiving = false; 
                        if (en instanceof TankEnemy) en.hp = 3; 
                    }
                }
                en.draw(ctx);
                
                bullets.forEach(b => {
                    if (!b.markedForDeletion && !en.markedForDeletion && !en.isDying &&
                        b.x < en.x + en.w && b.x + b.w > en.x && b.y < en.y + en.h && b.y + b.h > en.y) {
                        
                        b.markedForDeletion = true; en.hp--; en.hitTimer = 4; 
                        if (en instanceof TankEnemy) { Synth.bossHit(); particles.push(new Particle(b.x, b.y, "white")); }

                        if (en.hp <= 0) {
                            en.isDying = true; 
                            let pointsEarned = en.isDiving ? en.scoreValue * 2 : en.scoreValue;
                            score += pointsEarned; 
                            floatingTexts.push(new FloatingText(en.x + en.w/2, en.y, `+${pointsEarned}`, "#00ffff"));
                            Synth.explosion();
                            for (let i = 0; i < 8; i++) particles.push(new Particle(en.x + en.w/2, en.y + en.h/2, "orange"));
                            if (Math.random() < 0.05 && powerUps.length < 2) powerUps.push(new PowerUp(en.x + 8, en.y + 8, Math.floor(Math.random() * 3)));
                        }
                    }
                });

                if (pHb.x < en.x + en.w && pHb.x + pHb.w > en.x && pHb.y < en.y + en.h && pHb.y + pHb.h > en.y) {
                    if (player.invincibleTimer <= 0) {
                        loseLife(); en.markedForDeletion = true; Synth.explosion();
                        for (let i = 0; i < 8; i++) particles.push(new Particle(en.x + en.w/2, en.y + en.h/2, "orange"));
                    }
                }
            });
            
            if (hitEdge) {
                enemyDir *= -1;
                enemies.forEach(en => {
                    if (!en.isDiving && !en.isDying) {
                        en.y += 20; if (en.x < 0) en.x = 0; if (en.x > GAME_WIDTH - en.w) en.x = GAME_WIDTH - en.w;
                    }
                });
            }
            enemies = enemies.filter(e => !e.markedForDeletion);
            
            // NUEVA LÓGICA DE OLEADAS
            if (enemies.length === 0 && !boss && level < 10) {
                if (currentWave < maxWaves) {
                    currentWave++;
                    levelBannerTimer = 120; // Vuelve a mostrar el letrero
                    spawnEnemies();
                } else {
                    nextLevel();
                }
            }
        }
    }
    
    particles.forEach(p => { p.update(); p.draw(ctx); });
    particles = particles.filter(p => p.alpha > 0);
    if (particles.length > 500) particles = particles.slice(0, 500);
    
    floatingTexts.forEach(ft => { ft.update(); ft.draw(ctx); });
    floatingTexts = floatingTexts.filter(ft => ft.alpha > 0);

    ctx.restore(); 
    drawUI();

    if (flashTimer > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${flashTimer / 45})`; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        flashTimer--;
    }

    drawCRT(ctx); 
    requestAnimationFrame(animate);
}

if (imagesLoaded === images.length) animate();