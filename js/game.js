const canvas = document.getElementById('galaga');
const ctx = canvas.getContext('2d');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

let gameState = 'START';
let score = 0;
let level = 1;
let highScore = parseInt(localStorage.getItem('galagaHighScore')) || 0;

let player;
let enemies = [];
let particles = [];
let bullets = [];
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
    }
};

// Imágenes
const imgPlayer = new Image(); imgPlayer.src = 'img/nave.png';
const imgEnemy = new Image(); imgEnemy.src = 'img/enemigo.png';
const imgBoss = new Image(); imgBoss.src = 'img/jefe.png';
const imgFondo = new Image(); imgFondo.src = 'img/fondo.png';

// Esperar a que todas las imágenes carguen antes de iniciar el juego
const images = [imgPlayer, imgEnemy, imgBoss, imgFondo];
let imagesLoaded = 0;
images.forEach(img => {
    img.onload = () => {
        imagesLoaded++;
        if (imagesLoaded === images.length) {
            animate(); // Inicia el bucle solo cuando todas están listas
        }
    };
    img.onerror = () => {
        console.warn('Error cargando imagen:', img.src);
        imagesLoaded++; // Aún así contamos para no bloquear el juego
    };
});

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
        this.w = 8; this.h = 8; // Ajustado para coincidir con el círculo
        this.speed = 6;
        this.markedForDeletion = false;
    }
    update() {
        this.y += this.speed;
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
    }
    draw(ctx) {
        ctx.drawImage(imgEnemy, this.x, this.y, this.w, this.h);
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
        this.shootCooldown = 0; // Nuevo: cooldown para disparos
    }
    update() {
        this.x += this.speed * this.dir;
        if (this.x > GAME_WIDTH - this.w || this.x < 0) this.dir *= -1;

        // Disparo con cooldown (cada 20 frames aproximadamente)
        if (this.shootCooldown <= 0) {
            this.bullets.push(new EnemyBullet(this.x + this.w/2, this.y + this.h));
            Synth.playTone(200, 'sawtooth', 0.1);
            this.shootCooldown = 20; // ~0.33 segundos a 60fps
        } else {
            this.shootCooldown--;
        }

        this.bullets.forEach(b => b.update());
        this.bullets = this.bullets.filter(b => !b.markedForDeletion);
    }
    draw(ctx) {
        ctx.drawImage(imgBoss, this.x, this.y, this.w, this.h);
        
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
        this.x = 0;
        this.y = 0;
        this.width = GAME_WIDTH;
        this.height = GAME_HEIGHT;
        this.speed = 1;
    }
    update() {
        this.y += this.speed;
        if (this.y >= this.height) {
            this.y = 0;
        }
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
    }
    update(input) {
        if (this.cooldown > 0) this.cooldown--;
        if (input.keys.includes('ArrowLeft') && this.x > 0) this.x -= this.speed;
        if (input.keys.includes('ArrowRight') && this.x < GAME_WIDTH - this.w) this.x += this.speed;
        
        if (input.keys.includes('Space') && this.cooldown === 0) {
            bullets.push(new Bullet(this.x + this.w/2 - 2, this.y));
            this.cooldown = 12; 
            Synth.shoot();
        }
    }
    draw(ctx) {
        ctx.drawImage(imgPlayer, this.x, this.y, this.w, this.h);
    }
}

class InputHandler {
    constructor() {
        this.keys = [];
        window.addEventListener('keydown', e => {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }

            if (this.keys.indexOf(e.code) === -1) this.keys.push(e.code);
            
            if (e.code === 'Enter') {
                if (gameState === 'START' || gameState === 'GAMEOVER' || gameState === 'VICTORY') {
                    initGame();
                }
            }
        });
        window.addEventListener('keyup', e => {
            const index = this.keys.indexOf(e.code);
            if (index > -1) this.keys.splice(index, 1);
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
    boss = null;
    score = 0;
    level = 1;
    enemySpeed = 2;
    enemyDir = 1;
    gameState = 'PLAYING';
    
    if (audioCtx.state === 'suspended') audioCtx.resume();
    Synth.start();
    spawnEnemies();
}

function nextLevel() {
    level++;
    bullets = []; 
    enemies = [];
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

function gameOver() {
    gameState = 'GAMEOVER';
    // Crear muchas partículas al morir
    for (let i = 0; i < 30; i++) {
        particles.push(new Particle(player.x + player.w/2, player.y + player.h/2, "red"));
    }
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

function drawUI() {
    ctx.fillStyle = "white";
    ctx.font = "14px 'Press Start 2P', monospace"; 
    ctx.textAlign = "left";
    
    ctx.fillText(`SCORE: ${score}`, 20, 30);
    ctx.fillText(`HI: ${highScore}`, 180, 30);
    ctx.fillText(`LVL: ${level}`, 380, 30);

    if (gameState === 'START') {
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
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Actualizar y dibujar fondo
    bg.update();
    bg.draw(ctx);

    if (gameState === 'PLAYING') {
        player.update(input);
        player.draw(ctx);

        bullets.forEach(b => b.update());
        bullets = bullets.filter(b => !b.markedForDeletion);
        bullets.forEach(b => b.draw(ctx));

        if (boss) {
            boss.update();
            boss.draw(ctx);

            // Colisiones balas del jugador con jefe
            bullets.forEach(b => {
                if (!b.markedForDeletion &&
                    b.x < boss.x + boss.w && b.x + b.w > boss.x &&
                    b.y < boss.y + boss.h && b.y + b.h > boss.y) {
                    
                    b.markedForDeletion = true;
                    boss.hp--; 
                    Synth.bossHit();
                    particles.push(new Particle(b.x, b.y, "lime"));

                    if (boss.hp <= 0) {
                        score += 5000;
                        Synth.explosion();
                        for(let i=0; i<50; i++) particles.push(new Particle(boss.x + boss.w/2, boss.y + boss.h/2, "lime"));
                        boss = null;
                        setTimeout(() => { victory(); }, 2000);
                    }
                }
            });

            // Colisión balas del jefe con jugador
            boss.bullets.forEach(bb => {
                if (bb.x < player.x + player.w && bb.x + bb.w > player.x &&
                    bb.y < player.y + player.h && bb.y + bb.h > player.y) {
                    gameOver();
                }
            });

            // Colisión jefe con jugador (ambos ejes)
            if (player.x < boss.x + boss.w && player.x + player.w > boss.x &&
                player.y < boss.y + boss.h && player.y + player.h > boss.y) {
                gameOver();
            }

        } else {
            let hitEdge = false;
            enemies.forEach(en => {
                en.x += enemySpeed * enemyDir;

                // Dibujar enemigo
                en.draw(ctx);

                // Detectar si toca el borde
                if (en.x > GAME_WIDTH - en.w || en.x < 0) hitEdge = true;

                // Colisiones balas del jugador con enemigos
                bullets.forEach(b => {
                    if (!b.markedForDeletion && !en.markedForDeletion &&
                        b.x < en.x + en.w && b.x + b.w > en.x &&
                        b.y < en.y + en.h && b.y + b.h > en.y) {
                        
                        en.markedForDeletion = true;
                        b.markedForDeletion = true;
                        score += 100;
                        Synth.explosion();
                        for (let i = 0; i < 8; i++) particles.push(new Particle(en.x + en.w/2, en.y + en.h/2, "orange"));
                    }
                });

                // Colisión enemigo con jugador (ambos ejes)
                if (player.x < en.x + en.w && player.x + player.w > en.x &&
                    player.y < en.y + en.h && player.y + player.h > en.y) {
                    gameOver();
                }
            });

            if (hitEdge) {
                enemyDir *= -1;
                enemies.forEach(en => {
                    en.y += 20;
                    // Corregir posición si se sale del borde para evitar acumulación
                    if (en.x < 0) en.x = 0;
                    if (en.x > GAME_WIDTH - en.w) en.x = GAME_WIDTH - en.w;
                });
            }

            enemies = enemies.filter(e => !e.markedForDeletion);
            
            if (enemies.length === 0 && !boss && level < 10) {
                nextLevel();
            }
        }
    }

    // Partículas
    particles.forEach(p => { p.update(); p.draw(ctx); });
    particles = particles.filter(p => p.alpha > 0);

    drawUI();
    requestAnimationFrame(animate);
}

// Si las imágenes ya estaban en caché, forzamos la animación
if (imagesLoaded === images.length) animate();