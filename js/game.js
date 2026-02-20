const canvas = document.getElementById('galaga');
const ctx = canvas.getContext('2d');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

let gameState = 'START';
let score = 0;
let level = 1;
let lives = 3;
let highScore = parseInt(localStorage.getItem('galagaHighScore')) || 0;

let shakeTime = 0; 

let player;
let enemies = [];
let particles = [];
let bullets = [];
let powerUps = []; 
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

class PowerUp {
    constructor(x, y, type) {
        this.x = x; this.y = y;
        this.w = 16; this.h = 16;
        this.type = type; 
        this.speed = 2;
        this.markedForDeletion = false;
        this.colors = ['#0088ff', '#ff0044', '#00ffff'];
        this.letters = ['S', 'R', 'T'];
    }
    update() {
        this.y += this.speed;
        if (this.y > GAME_HEIGHT) this.markedForDeletion = true;
    }
    draw(ctx) {
        ctx.fillStyle = this.colors[this.type];
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.colors[this.type];
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "white";
        ctx.font = "12px monospace";
        ctx.fillText(this.letters[this.type], this.x + 4, this.y + 12);
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.color = color;
        this.velocity = { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6 };
        this.alpha = 1;
        this.friction = 0.96;
    }
    update() {
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= 0.04;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, 4, 4);
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 4; this.h = 12;
        this.speed = 10;
        this.markedForDeletion = false;
    }
    update() {
        this.y -= this.speed;
        if (this.y < 0) this.markedForDeletion = true;
    }
    draw(ctx) {
        ctx.fillStyle = "#ffeb3b"; 
        ctx.shadowBlur = 10; ctx.shadowColor = "red";
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.shadowBlur = 0;
    }
}

class EnemyBullet {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 8; this.h = 8; 
        this.speed = 6;
        this.markedForDeletion = false;
    }
    update() {
        let currentSpeed = player.slowMoTimer > 0 ? this.speed * 0.4 : this.speed;
        this.y += currentSpeed;
        if (this.y > GAME_HEIGHT) this.markedForDeletion = true;
    }
    draw(ctx) {
        ctx.fillStyle = "#ff0000";
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 32; this.h = 32;
        this.markedForDeletion = false;
        this.isDiving = false; 
        this.angle = 0; 
        this.frameX = 0;
        this.timer = Math.floor(Math.random() * 100); 
    }
    draw(ctx) {
        let frames = Math.max(1, Math.floor(imgEnemy.width / imgEnemy.height) || 1);
        let sWidth = imgEnemy.width / frames;
        let sHeight = imgEnemy.height;
        
        this.timer++;
        if (this.timer % 20 === 0) {
            this.frameX = (this.frameX + 1) % frames;
        }

        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2); 
        
        if (frames === 1) {
            let scaleEffect = 1 + Math.sin(this.timer * 0.15) * 0.1;
            ctx.scale(scaleEffect, 1 / scaleEffect); 
        }
        
        ctx.drawImage(imgEnemy, this.frameX * sWidth, 0, sWidth, sHeight, -this.w / 2, -this.h / 2, this.w, this.h);
        ctx.restore();
    }
}

class Boss {
    constructor() {
        this.w = 120; this.h = 100;
        this.x = GAME_WIDTH / 2 - this.w / 2;
        this.y = 80;
        this.hp = 60;
        this.maxHp = 60;
        this.speed = 3;
        this.dir = 1;
        this.bullets = [];
        this.shootCooldown = 0; 
        this.hitTimer = 0; 
    }
    update() {
        let currentSpeed = player.slowMoTimer > 0 ? this.speed * 0.4 : this.speed;
        this.x += currentSpeed * this.dir;
        if (this.x > GAME_WIDTH - this.w || this.x < 0) this.dir *= -1;
        this.y = 80 + Math.sin(Date.now() / 300) * 20;

        if (this.shootCooldown <= 0) {
            this.bullets.push(new EnemyBullet(this.x + this.w/2, this.y + this.h));
            Synth.playTone(200, 'sawtooth', 0.1);
            this.shootCooldown = player.slowMoTimer > 0 ? 50 : 20;
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
        ctx.fillStyle = "#00ff00";
        ctx.fillRect(this.x, this.y - 15, this.w * hpPercent, 8);
        this.bullets.forEach(b => b.draw(ctx));
    }
}

class Background {
    constructor() {
        this.x = 0; this.y = 0;
        this.width = GAME_WIDTH; this.height = GAME_HEIGHT;
        this.speed = 1;
    }
    update() {
        this.y += this.speed;
        if (this.y >= this.height) this.y = 0;
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
    }
    update(input) {
        if (this.cooldown > 0) this.cooldown--;
        if (this.invincibleTimer > 0) this.invincibleTimer--; 
        if (this.rapidFireTimer > 0) this.rapidFireTimer--;
        if (this.slowMoTimer > 0) this.slowMoTimer--;
        
        if (input.keys.includes('ArrowLeft') && this.x > 0) this.x -= this.speed;
        if (input.keys.includes('ArrowRight') && this.x < GAME_WIDTH - this.w) this.x += this.speed;
        
        let currentCooldownRate = this.rapidFireTimer > 0 ? 4 : 12;
        if (input.keys.includes('Space') && this.cooldown === 0) {
            if (level >= 3) {
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
        ctx.drawImage(imgPlayer, this.x, this.y, this.w, this.h);
        if (this.hasShield) {
            ctx.strokeStyle = "#0088ff";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x + this.w/2, this.y + this.h/2, 30, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "rgba(0, 136, 255, 0.2)";
            ctx.fill();
        }
    }
}

class InputHandler {
    constructor() {
        this.keys = [];
        window.addEventListener('keydown', e => {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
            
            if (this.keys.indexOf(e.code) === -1) this.keys.push(e.code);
            
            if (e.code === 'Enter') {
                if (gameState === 'START' || gameState === 'GAMEOVER' || gameState === 'VICTORY') initGame();
            }

            // --- NUEVO: Lógica de la Tecla Pausa ---
            if (e.code === 'KeyP' || e.key === 'p' || e.key === 'P') {
                if (gameState === 'PLAYING') {
                    gameState = 'PAUSED';
                    drawPauseScreen();
                } else if (gameState === 'PAUSED') {
                    gameState = 'PLAYING';
                    animate(); // Reanuda el ciclo del juego
                }
            }
        });
        
        window.addEventListener('keyup', e => {
            const index = this.keys.indexOf(e.code);
            if (index > -1) this.keys.splice(index, 1);
        });

        // --- NUEVO: Autopausa al cambiar de ventana ---
        window.addEventListener('blur', () => {
            this.keys = [];
            if (gameState === 'PLAYING') {
                gameState = 'PAUSED';
                drawPauseScreen();
            }
        });
    }
}

function spawnEnemies() {
    if (level === 10) return; 
    const rows = Math.min(3 + Math.floor((level - 1) / 2), 6); 
    const cols = 8;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            enemies.push(new Enemy(50 + c * 45, 50 + r * 35));
        }
    }
}

function initGame() {
    player = new Player();
    bullets = [];
    enemies = [];
    particles = [];
    powerUps = []; 
    boss = null;
    score = 0;
    level = 1;
    lives = 3; 
    enemySpeed = 2;
    enemyDir = 1;
    shakeTime = 0; 
    gameState = 'PLAYING';
    if (audioCtx.state === 'suspended') audioCtx.resume();
    Synth.start();
    spawnEnemies();
}

function nextLevel() {
    level++;
    bullets = []; 
    enemies = [];
    powerUps = [];
    enemyDir = 1;
    if (level === 10) {
        Synth.playTone(300, 'square', 0.5);
        setTimeout(() => Synth.playTone(250, 'square', 0.5), 400);
        boss = new Boss();
    } else {
        enemySpeed += 0.5;
        Synth.levelUp();
        spawnEnemies();
    }
}

function loseLife() {
    shakeTime = 25; 

    if (player.hasShield) {
        player.hasShield = false;
        player.invincibleTimer = 60;
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
        player.x = GAME_WIDTH / 2 - player.w / 2;
        player.y = GAME_HEIGHT - 60;
        player.invincibleTimer = 120; 
    }
}

function gameOver() {
    gameState = 'GAMEOVER';
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('galagaHighScore', highScore);
    }
}

function victory() {
    gameState = 'VICTORY';
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('galagaHighScore', highScore);
    }
}

function drawCRT(ctx) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    for (let i = 0; i < GAME_HEIGHT; i += 4) {
        ctx.fillRect(0, i, GAME_WIDTH, 1);
    }
    let gradient = ctx.createRadialGradient(
        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.4, 
        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

// --- NUEVO: Función para pintar la pantalla de Pausa ---
function drawPauseScreen() {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = "#00ffff";
    ctx.textAlign = "center";
    ctx.font = "40px 'Press Start 2P', monospace";
    ctx.fillText("PAUSA", GAME_WIDTH / 2, GAME_HEIGHT / 2);
    ctx.fillStyle = "white";
    ctx.font = "12px 'Press Start 2P', monospace";
    ctx.fillText("PRESIONA 'P' PARA CONTINUAR", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
    drawCRT(ctx); // Aplica el filtro CRT sobre la pausa para mantener el estilo
}

function drawUI() {
    ctx.fillStyle = "white";
    ctx.font = "14px 'Press Start 2P', monospace"; 
    ctx.textAlign = "left";
    ctx.fillText(`SCORE: ${score}`, 20, 30);
    ctx.fillText(`HI: ${highScore}`, 180, 30);
    ctx.fillText(`LVL: ${level}`, 380, 30);
    
    if (gameState === 'PLAYING') {
        ctx.font = "12px 'Press Start 2P', monospace"; 
        ctx.fillText("LIVES:", 20, GAME_HEIGHT - 20);
        for(let i = 0; i < lives; i++) {
            ctx.drawImage(imgPlayer, 95 + (i * 25), GAME_HEIGHT - 35, 20, 20);
        }
        
        ctx.textAlign = "center";
        if (player.rapidFireTimer > 0) {
            ctx.fillStyle = "#ff0044";
            ctx.fillText("RAPID FIRE!", GAME_WIDTH / 2, 60);
        }
        if (player.slowMoTimer > 0) {
            ctx.fillStyle = "#00ffff";
            ctx.fillText("TIME FREEZE!", GAME_WIDTH / 2, 80);
        }
    } else if (gameState === 'START') {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = "#00ffff";
        ctx.textAlign = "center";
        ctx.font = "30px 'Press Start 2P', monospace";
        ctx.fillText("GALAGA JS", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
        ctx.fillStyle = "white";
        ctx.font = "12px 'Press Start 2P', monospace";
        ctx.fillText("PRESS ENTER TO START", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);
    } else if (gameState === 'GAMEOVER') {
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = "red";
        ctx.textAlign = "center";
        ctx.font = "40px 'Press Start 2P', monospace";
        ctx.fillText("GAME OVER", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
        ctx.fillStyle = "white";
        ctx.font = "14px 'Press Start 2P', monospace";
        ctx.fillText(`FINAL SCORE: ${score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);
        ctx.fillText("PRESS ENTER TO RESTART", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100);
    } else if (gameState === 'VICTORY') {
        ctx.fillStyle = "rgba(0,0,0,0.9)";
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = "#ffff00"; 
        ctx.textAlign = "center";
        ctx.font = "40px 'Press Start 2P', monospace";
        ctx.fillText("YOU WIN!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
        ctx.fillStyle = "white";
        ctx.font = "14px 'Press Start 2P', monospace";
        ctx.fillText("GALAXY SAVED", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);
        ctx.fillText(`FINAL SCORE: ${score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60);
        ctx.fillText("PRESS ENTER TO PLAY AGAIN", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100);
    }
}

const input = new InputHandler();

function animate() {
    // --- NUEVO: Detiene el bucle por completo si el juego está en pausa ---
    if (gameState === 'PAUSED') return; 

    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    
    ctx.save();
    if (shakeTime > 0) {
        let magnitude = (shakeTime / 25) * 8;
        let dx = (Math.random() - 0.5) * magnitude;
        let dy = (Math.random() - 0.5) * magnitude;
        ctx.translate(dx, dy);
        shakeTime--;
    }

    bg.update();
    bg.draw(ctx);
    
    if (gameState === 'PLAYING') {
        player.update(input);
        player.draw(ctx);
        
        bullets.forEach(b => b.update());
        bullets = bullets.filter(b => !b.markedForDeletion);
        bullets.forEach(b => b.draw(ctx));
        
        powerUps.forEach(pu => {
            pu.update();
            pu.draw(ctx);
            if (player.x < pu.x + pu.w && player.x + player.w > pu.x &&
                player.y < pu.y + pu.h && player.y + player.h > pu.y) {
                pu.markedForDeletion = true;
                Synth.powerUp();
                if (pu.type === 0) player.hasShield = true;
                if (pu.type === 1) player.rapidFireTimer = 300; 
                if (pu.type === 2) player.slowMoTimer = 300; 
            }
        });
        powerUps = powerUps.filter(p => !p.markedForDeletion);
        
        if (boss) {
            boss.update();
            boss.draw(ctx);
            bullets.forEach(b => {
                if (!b.markedForDeletion && boss &&
                    b.x < boss.x + boss.w && b.x + b.w > boss.x &&
                    b.y < boss.y + boss.h && b.y + b.h > boss.y) {
                    
                    b.markedForDeletion = true;
                    boss.hp--; 
                    boss.hitTimer = 5; 
                    shakeTime = 5; 
                    Synth.bossHit();
                    particles.push(new Particle(b.x, b.y, "lime"));
                    
                    if (boss.hp <= 0) {
                        score += 5000;
                        shakeTime = 50; 
                        Synth.explosion();
                        for(let i=0; i<50; i++) particles.push(new Particle(boss.x + boss.w/2, boss.y + boss.h/2, "lime"));
                        boss = null;
                        setTimeout(() => { victory(); }, 2000);
                    }
                }
            });
            if (boss) {
                boss.bullets.forEach(bb => {
                    if (bb.x < player.x + player.w && bb.x + bb.w > player.x &&
                        bb.y < player.y + player.h && bb.y + bb.h > player.y) {
                        if (player.invincibleTimer <= 0) loseLife();
                        bb.markedForDeletion = true;
                    }
                });
                if (player.x < boss.x + boss.w && player.x + player.w > boss.x &&
                    player.y < boss.y + boss.h && player.y + player.h > boss.y) {
                    if (player.invincibleTimer <= 0) loseLife();
                }
            }
        } else {
            let hitEdge = false;
            let currentEnemySpeed = player.slowMoTimer > 0 ? enemySpeed * 0.4 : enemySpeed;
            enemies.forEach(en => {
                if (!en.isDiving) {
                    en.x += currentEnemySpeed * enemyDir;
                    if (en.x > GAME_WIDTH - en.w || en.x < 0) hitEdge = true;
                    if (Math.random() < 0.0015 && level >= 2) en.isDiving = true;
                } else {
                    let diveSpeed = 4 + (level * 0.2);
                    en.y += player.slowMoTimer > 0 ? diveSpeed * 0.4 : diveSpeed; 
                    en.x += Math.sin(en.angle) * (player.slowMoTimer > 0 ? 1.5 : 4); 
                    en.angle += 0.1;
                    if (en.y > GAME_HEIGHT) en.markedForDeletion = true;
                }
                en.draw(ctx);
                bullets.forEach(b => {
                    if (!b.markedForDeletion && !en.markedForDeletion &&
                        b.x < en.x + en.w && b.x + b.w > en.x &&
                        b.y < en.y + en.h && b.y + b.h > en.y) {
                        en.markedForDeletion = true;
                        b.markedForDeletion = true;
                        score += (en.isDiving ? 200 : 100); 
                        Synth.explosion();
                        for (let i = 0; i < 8; i++) particles.push(new Particle(en.x + en.w/2, en.y + en.h/2, "orange"));
                        if (Math.random() < 0.1) {
                            let type = Math.floor(Math.random() * 3);
                            powerUps.push(new PowerUp(en.x + 8, en.y + 8, type));
                        }
                    }
                });
                if (player.x < en.x + en.w && player.x + player.w > en.x &&
                    player.y < en.y + en.h && player.y + player.h > en.y) {
                    if (player.invincibleTimer <= 0) loseLife();
                }
            });
            if (hitEdge) {
                enemyDir *= -1;
                enemies.forEach(en => {
                    if (!en.isDiving) {
                        en.y += 20;
                        if (en.x < 0) en.x = 0;
                        if (en.x > GAME_WIDTH - en.w) en.x = GAME_WIDTH - en.w;
                    }
                });
            }
            enemies = enemies.filter(e => !e.markedForDeletion);
            if (enemies.length === 0 && !boss && level < 10) nextLevel();
        }
    }
    
    particles.forEach(p => { p.update(); p.draw(ctx); });
    particles = particles.filter(p => p.alpha > 0);
    if (particles.length > 500) particles = particles.slice(0, 500);
    
    ctx.restore(); 

    drawUI();
    drawCRT(ctx); 
    
    requestAnimationFrame(animate);
}

if (imagesLoaded === images.length) animate();