const canvas = document.getElementById('dots-canvas');
const ctx = canvas.getContext('2d');

const GRID_SIZE = 24;
const BASE_RADIUS = 1.5;
const MAX_RADIUS = 14;
const INFLUENCE_RADIUS = 120;
const GROW_SPEED = 0.12;
const SHRINK_SPEED = 0.04;
const IDLE_TIMEOUT = 300;

let mouseX = -1000;
let mouseY = -1000;
let dots = [];
let idleTimer = null;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    createDots();
}

function createDots() {
    dots = [];
    const cols = Math.ceil(canvas.width / GRID_SIZE) + 1;
    const rows = Math.ceil(canvas.height / GRID_SIZE) + 1;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            dots.push({
                x: col * GRID_SIZE,
                y: row * GRID_SIZE,
                currentRadius: BASE_RADIUS,
                morphProgress: 0
            });
        }
    }
}

function drawZelligeStar(x, y, size, morph) {
    const points = 8;
    const outerRadius = size;
    const innerRadius = size * 0.38; // Inner indent for 8-pointed star
    
    ctx.beginPath();
    
    for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI / points) - Math.PI / 2;
        const isOuter = i % 2 === 0;
        
        let radius;
        if (isOuter) {
            radius = size;
        } else {
            radius = size - (size - innerRadius) * morph;
        }
        
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        
        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    
    ctx.closePath();
    ctx.fill();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(232, 228, 201, 0.25)';
    
    dots.forEach(dot => {
        const dx = mouseX - dot.x;
        const dy = mouseY - dot.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        let targetRadius;
        let targetMorph;
        
        if (distance < INFLUENCE_RADIUS) {
            const scale = 1 - (distance / INFLUENCE_RADIUS);
            targetRadius = BASE_RADIUS + (MAX_RADIUS - BASE_RADIUS) * scale;
            targetMorph = scale;
        } else {
            targetRadius = BASE_RADIUS;
            targetMorph = 0;
        }
        
        const radiusSpeed = targetRadius > dot.currentRadius ? GROW_SPEED : SHRINK_SPEED;
        const morphSpeed = targetMorph > dot.morphProgress ? GROW_SPEED : SHRINK_SPEED;
        
        dot.currentRadius += (targetRadius - dot.currentRadius) * radiusSpeed;
        dot.morphProgress += (targetMorph - dot.morphProgress) * morphSpeed;
        
        if (dot.currentRadius < BASE_RADIUS + 0.01) {
            dot.currentRadius = BASE_RADIUS;
        }
        if (dot.morphProgress < 0.01) {
            dot.morphProgress = 0;
        }
        
        drawZelligeStar(dot.x, dot.y, dot.currentRadius, dot.morphProgress);
    });
    
    requestAnimationFrame(draw);
}

window.addEventListener('resize', resizeCanvas);
document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        mouseX = -1000;
        mouseY = -1000;
    }, IDLE_TIMEOUT);
});
document.addEventListener('mouseleave', () => {
    mouseX = -1000;
    mouseY = -1000;
});

resizeCanvas();
draw();
