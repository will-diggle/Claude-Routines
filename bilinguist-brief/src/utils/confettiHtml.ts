import { Dimensions } from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

export const makeConfettiHtml = (initColors: string[], initEmoji: string) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
* { margin:0; padding:0; }
html, body { width:100%; height:100%; overflow:hidden; background:transparent; }
canvas { position:fixed; top:0; left:0; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
var SW = (window.innerWidth  > 10 ? window.innerWidth  : ${SW});
var SH = (window.innerHeight > 10 ? window.innerHeight : ${SH});

var canvas = document.getElementById('c');
var ctx = canvas.getContext('2d');
var dpr = window.devicePixelRatio || 1;
canvas.width  = Math.round(SW * dpr);
canvas.height = Math.round(SH * dpr);
canvas.style.width  = SW + 'px';
canvas.style.height = SH + 'px';
ctx.scale(dpr, dpr);

// ── Physics constants ─────────────────────────────────────────────────────────
var BURST_COUNT     = 260;
var RAIN_COUNT      = 100;
var GRAVITY_STR     = 900;
var RESTITUTION     = 0.22;
var WALL_FRICTION   = 0.72;
var BURST_DRAG      = 0.018;
var RAIN_DRAG       = 0.10;
var ANGULAR_DRAG    = 0.991;
var REST_SPEED      = 28;
var REST_FRAMES_REQ = 8;
var UN_REST_DOT     = 0.85;
var SWAY_FORCE      = 85;
var RAIN_SPEED_BASE = 80;
var RAD = Math.PI / 180;

var SHAPES = ['pill','pill','pill','rect','rect','circle','circle','flag'];

var colors    = ${JSON.stringify(initColors)};
var flagEmoji = ${JSON.stringify(initEmoji)};
var gravity   = { x:0, y:1 };
var particles = [];
var rafId     = 0;
var prevTs    = 0;

var CARD_X = 0, CARD_Y = 0, CARD_W = 0, CARD_H = 0, cardActive = false;

var MAX_PARTICLES    = BURST_COUNT + RAIN_COUNT * 2; // cap to prevent multiplication on rotation
var drainingMode     = false;
var drainCheckTimer  = 0;

// ── Particle factory ──────────────────────────────────────────────────────────
function makeParticle(isRain) {
  var shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  var base  = 8 + Math.random() * 14;
  var pw    = (shape === 'star' || shape === 'flag') ? 20 : base;
  var ph    = (shape === 'circle' || shape === 'star' || shape === 'flag')
              ? pw : pw * (0.35 + Math.random() * 0.45);
  return {
    shape: shape, pw: pw, ph: ph,
    colorIdx:  Math.floor(Math.random() * colors.length),
    mass:      (pw * ph) / 55 + 0.4,
    r:         Math.sqrt(pw*pw + ph*ph) / 2,
    x: -200, y: -200, vx: 0, vy: 0,
    angle:     Math.random() * Math.PI * 2,
    angularV:  (Math.random() - 0.5) * 1600 * RAD,
    flipPhase: Math.random() * Math.PI * 2,
    flipFreq:  (Math.PI*2) / (2.0 + Math.random() * 2.5),
    swayPhase: Math.random() * Math.PI * 2,
    swayFreq:  (Math.PI*2) / (3.0 + Math.random() * 3.5),
    swayAmp:   0.7 + Math.random() * 1.0,
    skew:      (-14 + Math.random() * 28) * RAD,
    isTwirler: Math.random() < 0.28,
    twirlTimer: 0.5 + Math.random() * 3.0,
    resting: false, restFrames: 0,
    settledGx: 0, settledGy: 1,
    isRain: isRain, inBurst: false, permanentlySettled: false,
    usesCardSurface: Math.random() < 0.17, onCardSurface: false,
    delay: 0
  };
}

function resetBurst(p, i) {
  var fromLeft  = i < BURST_COUNT / 2;
  var sideIdx   = i % (BURST_COUNT / 2);
  p.x = fromLeft ? -p.r - 3 - Math.random()*8 : SW + p.r + 3 + Math.random()*8;
  p.y = SH * 0.35 + Math.random() * SH * 0.25;
  var baseAngle = fromLeft ? -Math.PI/2.2 : -Math.PI + Math.PI/2.2;
  var shotAngle = baseAngle + (Math.random()-0.5) * (Math.PI/2.2);
  var speed     = 1000 + Math.random() * 1400;
  p.vx = Math.cos(shotAngle) * speed;
  p.vy = Math.sin(shotAngle) * speed;
  p.angle    = Math.random() * Math.PI * 2;
  p.angularV = (Math.random()-0.5) * 3600 * RAD;
  p.resting  = false; p.restFrames = 0;
  p.settledGx = 0; p.settledGy = 1;
  p.inBurst   = true; p.permanentlySettled = false;
  p.flipPhase = Math.random() * Math.PI * 2;
  p.swayPhase = Math.random() * Math.PI * 2;
  p.twirlTimer = 0.5 + Math.random() * 2.5;
  p.delay     = sideIdx * 0.005;
}

function resetRainInitial(p) {
  var speed = RAIN_SPEED_BASE + Math.random() * 80;
  p.x  = Math.random() * SW;
  p.y  = -(p.r + Math.random() * SH * 0.4);
  p.vx = (Math.random()-0.5) * 40;
  p.vy = speed;
  p.angle    = Math.random() * Math.PI * 2;
  p.angularV = (Math.random()-0.5) * 1200 * RAD;
  p.resting  = false; p.restFrames = 0;
  p.inBurst  = false; p.permanentlySettled = false;
  p.settledGx = 0; p.settledGy = 1;
  p.flipPhase = Math.random() * Math.PI * 2;
  p.swayPhase = Math.random() * Math.PI * 2;
  p.twirlTimer = 0.5 + Math.random() * 3.0;
  p.delay = Math.random() * 7.0;
}

function resetRainLive(p) {
  var gx = gravity.x, gy = gravity.y;
  var speed = RAIN_SPEED_BASE + Math.random() * 80;
  if (Math.abs(gy) >= Math.abs(gx)) {
    p.x  = Math.random() * SW;
    p.y  = gy > 0 ? -(p.r + Math.random() * SH * 0.70) : SH + p.r + Math.random() * SH * 0.70;
    p.vx = (gy !== 0 ? gx / gy : 0) * speed + (Math.random()-0.5) * 40;
    p.vy = gy > 0 ? speed : -speed;
  } else {
    p.y  = Math.random() * SH;
    p.x  = gx > 0 ? -(p.r + Math.random() * SW * 0.70) : SW + p.r + Math.random() * SW * 0.70;
    p.vx = gx > 0 ? speed : -speed;
    p.vy = (gx !== 0 ? gy / gx : 0) * speed + (Math.random()-0.5) * 40;
  }
  p.angle    = Math.random() * Math.PI * 2;
  p.angularV = (Math.random()-0.5) * 1200 * RAD;
  p.resting  = false; p.restFrames = 0;
  p.inBurst  = false; p.permanentlySettled = false;
  p.settledGx = gx; p.settledGy = gy;
  p.flipPhase = Math.random() * Math.PI * 2;
  p.swayPhase = Math.random() * Math.PI * 2;
  p.twirlTimer = 0.5 + Math.random() * 3.0;
  p.delay = 0;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r);
  ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h);
  ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r);
  ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

function drawParticle(p) {
  var color  = colors[p.colorIdx % colors.length] || '#FF6B6B';
  var scaleX = Math.abs(Math.cos(p.flipPhase));
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  if (scaleX < 0.999) ctx.scale(scaleX, 1);
  if (p.skew !== 0)   ctx.transform(1, 0, Math.tan(p.skew), 1, 0, 0);

  if (p.shape === 'flag') {
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(flagEmoji, 0, 0);
  } else if (p.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, p.pw/2, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
  } else if (p.shape === 'pill') {
    roundRect(-p.pw/2, -p.ph/2, p.pw, p.ph, p.ph/2);
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    roundRect(-p.pw/2, -p.ph/2, p.pw, p.ph, Math.round(p.ph * 0.28));
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

function step(ts) {
  if (!prevTs) prevTs = ts;
  var dt = Math.min((ts - prevTs) / 1000, 0.033);
  prevTs = ts;

  var gx = gravity.x, gy = gravity.y;
  var angMul = Math.pow(ANGULAR_DRAG, dt * 60);

  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];

    if (p.delay > 0) { p.delay -= dt; continue; }

    if (p.resting) {
      var dot = gx * p.settledGx + gy * p.settledGy;
      if (dot < UN_REST_DOT) {
        if (p.isRain) {
          // Teleport to new "above" so rain always falls in gravity direction
          resetRainLive(p);
        } else {
          p.resting = false; p.restFrames = 0;
          p.permanentlySettled = false;
          p.vx = gx * 80; p.vy = gy * 80;
          if (p.onCardSurface) {
            p.onCardSurface = false;
            p.usesCardSurface = false;
          }
        }
      }
      continue;
    }

    var ugx = p.inBurst ? 0 : gx;
    var ugy = p.inBurst ? 1 : gy;

    p.vx += ugx * GRAVITY_STR * dt;
    p.vy += ugy * GRAVITY_STR * dt;
    if (p.inBurst && p.vy > 30) p.inBurst = false;

    p.swayPhase += p.swayFreq * dt;
    var swayF = Math.sin(p.swayPhase) * p.swayAmp * SWAY_FORCE;
    p.vx += -ugy * swayF * dt;
    p.vy +=  ugx * swayF * dt;

    p.flipPhase += p.flipFreq * dt;

    if (p.isTwirler) {
      p.twirlTimer -= dt;
      if (p.twirlTimer <= 0) {
        p.angularV += (Math.random() > 0.5 ? 1 : -1) * (900 + Math.random()*1800) * RAD;
        p.twirlTimer = 0.8 + Math.random() * 3.5;
      }
    }

    var drag = (p.isRain ? RAIN_DRAG : BURST_DRAG) / Math.sqrt(p.mass);
    var spd  = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
    if (spd > 1) {
      var d = Math.min(drag * spd * dt * 60, spd * 0.45);
      p.vx -= (p.vx/spd)*d;
      p.vy -= (p.vy/spd)*d;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle    += p.angularV * dt;
    p.angularV *= angMul;

    var onSurface = false;
    if (p.x - p.r < 0) {
      p.x = p.r;
      if (p.vx < 0) { p.vx = -p.vx*RESTITUTION; p.vy *= WALL_FRICTION; p.angularV *= 0.65; onSurface = true; }
    } else if (p.x + p.r > SW) {
      p.x = SW - p.r;
      if (p.vx > 0) { p.vx = -p.vx*RESTITUTION; p.vy *= WALL_FRICTION; p.angularV *= 0.65; onSurface = true; }
    }
    if (p.y - p.r < 0) {
      p.y = p.r;
      if (p.vy < 0) { p.vy = -p.vy*RESTITUTION; p.vx *= WALL_FRICTION; p.angularV *= 0.65; onSurface = true; }
    } else if (!drainingMode && p.y + p.r > SH) {
      p.y = SH - p.r;
      if (p.vy > 0) { p.vy = -p.vy*RESTITUTION; p.vx *= WALL_FRICTION; p.angularV *= 0.65; onSurface = true; }
    }

    if (!drainingMode && cardActive && p.usesCardSurface && !p.onCardSurface && p.vy > 0) {
      var inCardX = p.x + p.r > CARD_X && p.x - p.r < CARD_X + CARD_W;
      if (inCardX) {
        var prevYBot = p.y + p.r - p.vy * dt;
        if (prevYBot < CARD_Y && p.y + p.r >= CARD_Y) {
          p.y = CARD_Y - p.r;
          p.vy = -p.vy * 0.12;
          p.vx *= 0.20;
          p.angularV *= 0.40;
          onSurface = true;
        }
      }
    }

    if (onSurface) {
      var cs = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
      if (cs < REST_SPEED) {
        p.restFrames++;
        if (p.restFrames >= REST_FRAMES_REQ) {
          p.resting = true; p.vx = 0; p.vy = 0; p.angularV = 0;
          p.settledGx = gx; p.settledGy = gy;
          var onGravFloor = Math.abs(gy) >= Math.abs(gx)
            ? (gy > 0 ? p.y + p.r >= SH - 2 : p.y - p.r <= 2)
            : (gx > 0 ? p.x + p.r >= SW - 2 : p.x - p.r <= 2);
          if (p.isRain && onGravFloor && !drainingMode) {
            if (Math.random() < 0.30 && particles.length < MAX_PARTICLES) {
              p.isRain = false; // settle permanently — joins the floor pile
              // Spawn a replacement so the rain count stays constant
              var rep = makeParticle(true);
              resetRainLive(rep);
              particles.push(rep);
            } else {
              resetRainLive(p);
            }
          }
          var inCX = p.x > CARD_X && p.x < CARD_X + CARD_W;
          if (p.usesCardSurface && inCX && Math.abs(p.y + p.r - CARD_Y) < 5) {
            p.onCardSurface = true;
          }
        }
      } else { p.restFrames = 0; }
    } else { p.restFrames = 0; }

    // Recycle in-flight rain that exits the screen in the gravity direction
    if (!drainingMode && p.isRain && !p.resting) {
      var MARGIN = 180;
      var offScreen = (gy > 0.3 && p.y - p.r > SH + MARGIN)
                   || (gy < -0.3 && p.y + p.r < -MARGIN)
                   || (gx > 0.3 && p.x - p.r > SW + MARGIN)
                   || (gx < -0.3 && p.x + p.r < -MARGIN);
      if (offScreen) resetRainLive(p);
    }
  }

  // In drain mode, check if every particle has fallen off the bottom
  if (drainingMode) {
    drainCheckTimer += dt;
    if (drainCheckTimer > 0.25) {
      drainCheckTimer = 0;
      var allGone = true;
      for (var k = 0; k < particles.length; k++) {
        if (particles[k].y - particles[k].r < SH + 120) { allGone = false; break; }
      }
      if (allGone) {
        cancelAnimationFrame(rafId);
        ctx.clearRect(0, 0, SW, SH);
        try { window.ReactNativeWebView.postMessage('drained'); } catch(e) {}
      }
    }
  }
}

function loop(ts) {
  step(ts);
  ctx.clearRect(0, 0, SW, SH);
  for (var i = 0; i < particles.length; i++) {
    if (particles[i].delay <= 0) drawParticle(particles[i]);
  }
  rafId = requestAnimationFrame(loop);
}

function handleGravity(gx, gy) {
  gravity.x = gx; gravity.y = gy;
}

function handleCardBounds(x, y, w, h) {
  CARD_X = x; CARD_Y = y; CARD_W = w; CARD_H = h; cardActive = true;
}

function handleReset(newColors, newEmoji) {
  colors    = newColors;
  flagEmoji = newEmoji;
  particles = [];
  for (var i = 0; i < BURST_COUNT; i++) {
    var bp = makeParticle(false);
    resetBurst(bp, i);
    particles.push(bp);
  }
  for (var j = 0; j < RAIN_COUNT; j++) {
    var rp = makeParticle(true);
    resetRainInitial(rp);
    particles.push(rp);
  }
  prevTs = 0;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function startDrainMode() {
  if (drainingMode) return;
  drainingMode = true;
  gravity.x = 0;
  gravity.y = 1;
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    p.isRain = false;           // prevent any recycling
    p.permanentlySettled = false;
    p.delay = 0;                // cancel any pending spawn delay so particles don't appear late
    if (p.resting) {
      p.resting = false;
      p.restFrames = 0;
      p.vx = (Math.random() - 0.5) * 80;
      p.vy = 500 + Math.random() * 400;   // strong kick — off screen in ~1s
    } else {
      // In-flight: clamp lateral drift, guarantee strong downward motion
      p.vx *= 0.4;
      p.vy = Math.max(p.vy, 0) + 400 + Math.random() * 300;
    }
  }
  prevTs = 0;
}

window.onload = function() {
  handleReset(colors, flagEmoji);
};
</script>
</body>
</html>`;
