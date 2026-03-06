(() => {
  // ---------- DOM ----------
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  const scoreEl = document.getElementById("score");
  const bestEl  = document.getElementById("best");

  const menu = document.getElementById("menu");
  const how  = document.getElementById("how");
  const over = document.getElementById("over");

  const playBtn  = document.getElementById("play");
  const howBtn   = document.getElementById("howBtn");
  const backBtn  = document.getElementById("back");
  const retryBtn = document.getElementById("retry");
  const homeBtn  = document.getElementById("home");
  const pauseBtn = document.getElementById("pause");

  const finalScoreEl = document.getElementById("finalScore");
  const finalBestEl  = document.getElementById("finalBest");

  const soundToggle = document.getElementById("sound");
  const vibeToggle  = document.getElementById("vibe");

  // ---------- Storage ----------
  const BEST_KEY = "arenaBreakersBest";
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = best;

  // ---------- State ----------
  const S = {
    running:false, paused:false, over:false,
    w:0, h:0, dpr: Math.max(1, Math.min(2.5, window.devicePixelRatio || 1)),
    last:0, t:0, score:0,
    shake:0,
    sound:true, vibe:true
  };

  // ---------- Audio ----------
  let audioCtx = null;
  function beep(freq=440, dur=0.05, type="triangle", gain=0.03){
    if(!S.sound) return;
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + dur);
    }catch{}
  }
  function vibrate(ms){
    if(!S.vibe) return;
    if(navigator.vibrate) navigator.vibrate(ms);
  }

  // ---------- Resize ----------
  function resize(){
    S.w = Math.floor(innerWidth  * S.dpr);
    S.h = Math.floor(innerHeight * S.dpr);
    canvas.width  = S.w;
    canvas.height = S.h;
  }
  addEventListener("resize", resize, {passive:true});
  resize();

  // ---------- Math helpers ----------
  const rand=(a,b)=>a+Math.random()*(b-a);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const len=(x,y)=>Math.hypot(x,y);

  // ---------- Visual layers (parallax stars) ----------
  const stars1 = Array.from({length:90}, ()=>({x:Math.random(), y:Math.random(), s:rand(0.6,1.6)}));
  const stars2 = Array.from({length:70}, ()=>({x:Math.random(), y:Math.random(), s:rand(1.0,2.4)}));

  // ---------- Entities ----------
  const player = {
    x:0, y:0, r: 16,
    vx:0, vy:0,
    aimX:1, aimY:0,
    fireT:0,
    hp: 3,
    inv: 0
  };

  let bullets=[], drones=[], parts=[], pickups=[];

  function reset(){
    bullets=[]; drones=[]; parts=[]; pickups=[];
    S.t=0; S.score=0; S.shake=0; S.over=false; S.paused=false;
    player.x=S.w*0.5; player.y=S.h*0.6;
    player.vx=0; player.vy=0; player.aimX=1; player.aimY=0;
    player.fireT=0; player.hp=3; player.inv=0;
    scoreEl.textContent="0";
  }

  // ---------- Dual-stick touch controls ----------
  const sticks = {
    left:  {active:false, id:null, x0:0,y0:0, x:0,y:0},
    right: {active:false, id:null, x0:0,y0:0, x:0,y:0}
  };

  function toWorld(clientX, clientY){
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width  * S.w;
    const y = (clientY - rect.top)  / rect.height * S.h;
    return {x,y};
  }

  function onPointerDown(e){
    const p = toWorld(e.clientX, e.clientY);
    const leftSide = (e.clientX < innerWidth * 0.5);

    const st = leftSide ? sticks.left : sticks.right;
    st.active = true;
    st.id = e.pointerId;
    st.x0 = p.x; st.y0 = p.y;
    st.x  = p.x; st.y  = p.y;
  }

  function onPointerMove(e){
    const p = toWorld(e.clientX, e.clientY);
    for(const st of [sticks.left, sticks.right]){
      if(st.active && st.id === e.pointerId){
        st.x = p.x; st.y = p.y;
      }
    }
  }

  function onPointerUp(e){
    for(const st of [sticks.left, sticks.right]){
      if(st.active && st.id === e.pointerId){
        st.active=false; st.id=null;
      }
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  addEventListener("pointerup", onPointerUp);

  // Prevent scrolling while playing
  addEventListener("touchmove", (e)=>{ if(S.running) e.preventDefault(); }, {passive:false});

  // ---------- Spawns ----------
  function spawnDrone(){
    const edge = Math.floor(rand(0,4));
    const pad = 40*S.dpr;
    let x,y;
    if(edge===0){ x=rand(pad,S.w-pad); y=-pad; }
    if(edge===1){ x=S.w+pad; y=rand(pad,S.h-pad); }
    if(edge===2){ x=rand(pad,S.w-pad); y=S.h+pad; }
    if(edge===3){ x=-pad; y=rand(pad,S.h-pad); }

    const r = rand(14,22)*S.dpr;
    drones.push({
      x,y,r,
      vx:0,vy:0,
      hp: 2 + Math.floor(S.score/1200),
      phase: rand(0,10),
      glow: rand(0.7,1.2)
    });
  }

  function spawnPickup(x,y){
    pickups.push({x,y,r:10*S.dpr, vy:rand(30,60)*S.dpr, t:0});
  }

  // ---------- FX ----------
  function burst(x,y,color,n=18,power=1){
    for(let i=0;i<n;i++){
      const a=rand(0,Math.PI*2);
      const sp=rand(140,520)*S.dpr*power;
      parts.push({
        x,y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
        t:0, life:rand(0.25,0.75),
        r:rand(2,4)*S.dpr, color
      });
    }
  }

  function screenShake(amt){
    S.shake = Math.max(S.shake, amt*S.dpr);
  }

  // ---------- Collisions ----------
  function hit(ax,ay,ar,bx,by,br){
    const dx=ax-bx, dy=ay-by;
    const rr=ar+br;
    return (dx*dx+dy*dy) <= rr*rr;
  }

  // ---------- Update ----------
  function difficulty(){
    return Math.min(3.2, S.score/1300);
  }

  function update(dt){
    S.t += dt;

    // movement from left stick
    let mx=0,my=0;
    if(sticks.left.active){
      const dx = sticks.left.x - sticks.left.x0;
      const dy = sticks.left.y - sticks.left.y0;
      const d = len(dx,dy);
      const max = 70*S.dpr;
      const k = Math.min(1, d/max);
      mx = (dx/(d||1))*k;
      my = (dy/(d||1))*k;
    }
    const speed = (310 + difficulty()*70) * S.dpr;
    player.vx = mx*speed;
    player.vy = my*speed;
    player.x += player.vx*dt;
    player.y += player.vy*dt;
    player.x = clamp(player.x, player.r, S.w-player.r);
    player.y = clamp(player.y, player.r, S.h-player.r);

    // aim + auto-fire from right stick
    let ax=player.aimX, ay=player.aimY;
    let firing = false;
    if(sticks.right.active){
      const dx = sticks.right.x - sticks.right.x0;
      const dy = sticks.right.y - sticks.right.y0;
      const d = len(dx,dy);
      if(d > 12*S.dpr){
        ax = dx/d; ay = dy/d;
        firing = true;
      }
    }
    player.aimX=ax; player.aimY=ay;

    // spawn drones (ramps up)
    const d = difficulty();
    const spawnRate = 0.55 + d*0.55; // per second
    if(Math.random() < spawnRate*dt) spawnDrone();

    // fire bullets
    player.fireT -= dt;
    if(firing && player.fireT <= 0){
      player.fireT = Math.max(0.09, 0.16 - d*0.02);
      const bx = player.x + ax*(player.r*1.1);
      const by = player.y + ay*(player.r*1.1);
      const sp = 980*S.dpr;
      bullets.push({x:bx,y:by, vx:ax*sp, vy:ay*sp, r:4.5*S.dpr, t:0});
      burst(bx,by,"rgba(43,108,255,0.9)", 6, 0.65); // muzzle flash
      beep(740, 0.02, "triangle", 0.02);
      vibrate(7);
    }

    // update bullets
    for(const b of bullets){
      b.t += dt;
      b.x += b.vx*dt; b.y += b.vy*dt;
    }
    bullets = bullets.filter(b => b.x>-80 && b.x<S.w+80 && b.y>-80 && b.y<S.h+80 && b.t<1.2);

    // drones chase player with slight wobble
    for(const e of drones){
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = len(dx,dy) || 1;
      const nx = dx/dist, ny = dy/dist;
      const base = (160 + d*55) * S.dpr;
      const wob = Math.sin(S.t*2.6 + e.phase) * 0.9;
      e.vx = nx*base + (-ny)*wob*50*S.dpr;
      e.vy = ny*base + ( nx)*wob*50*S.dpr;
      e.x += e.vx*dt;
      e.y += e.vy*dt;
    }

    // pickups
    for(const p of pickups){
      p.t += dt;
      p.y += p.vy*dt;
      p.vy *= (1 - 0.9*dt);
    }
    pickups = pickups.filter(p => p.t < 10);

    // particles
    for(const p of parts){
      p.t += dt;
      p.x += p.vx*dt; p.y += p.vy*dt;
      p.vx *= (1 - 2.2*dt);
      p.vy *= (1 - 2.2*dt);
    }
    parts = parts.filter(p => p.t < p.life);

    // collisions: bullets vs drones
    for(let i=drones.length-1;i>=0;i--){
      const e = drones[i];
      for(let j=bullets.length-1;j>=0;j--){
        const b = bullets[j];
        if(hit(e.x,e.y,e.r*0.8, b.x,b.y,b.r)){
          bullets.splice(j,1);
          e.hp--;
          screenShake(3);
          burst(b.x,b.y,"rgba(255,210,74,0.95)", 10, 0.8);
          beep(420,0.03,"square",0.02);

          if(e.hp<=0){
            burst(e.x,e.y,"rgba(255,59,59,0.95)", 28, 1.1);
            screenShake(9);
            drones.splice(i,1);
            S.score += 120;
            if(Math.random()<0.22) spawnPickup(e.x,e.y);
            break;
          }
        }
      }
    }

    // collisions: player vs drones
    player.inv = Math.max(0, player.inv - dt);
    if(player.inv <= 0){
      for(const e of drones){
        if(hit(player.x,player.y,player.r*0.9, e.x,e.y,e.r*0.8)){
          player.hp--;
          player.inv = 1.1;
          screenShake(14);
          burst(player.x,player.y,"rgba(43,108,255,0.95)", 26, 1.2);
          burst(e.x,e.y,"rgba(255,59,59,0.95)", 22, 1.0);
          vibrate(120);
          beep(180,0.08,"sawtooth",0.03);
          if(player.hp<=0){
            gameOver();
            return;
          }
          break;
        }
      }
    }

    // collisions: player vs pickup
    for(let i=pickups.length-1;i>=0;i--){
      const p = pickups[i];
      if(hit(player.x,player.y,player.r, p.x,p.y,p.r)){
        pickups.splice(i,1);
        S.score += 250;
        burst(p.x,p.y,"rgba(255,210,74,0.95)", 18, 1.0);
        beep(880,0.04,"triangle",0.03);
        vibrate(20);
      }
    }

    // passive score over time
    S.score += Math.floor(40*dt);
    scoreEl.textContent = S.score;

    // decay shake
    S.shake = Math.max(0, S.shake - 60*S.dpr*dt);
  }

  // ---------- Render ----------
  function bg(){
    ctx.fillStyle = "#071024";
    ctx.fillRect(0,0,S.w,S.h);

    // parallax stars
    ctx.fillStyle = "rgba(200,220,255,0.10)";
    for(const s of stars1){
      const x = (s.x*S.w + S.t*12*s.s) % S.w;
      const y = (s.y*S.h + S.t*18*s.s) % S.h;
      ctx.fillRect(x,y, 2*S.dpr, 2*S.dpr);
    }
    ctx.fillStyle = "rgba(120,170,255,0.14)";
    for(const s of stars2){
      const x = (s.x*S.w + S.t*28*s.s) % S.w;
      const y = (s.y*S.h + S.t*42*s.s) % S.h;
      ctx.fillRect(x,y, 2.5*S.dpr, 2.5*S.dpr);
    }

    // subtle grid
    ctx.strokeStyle = "rgba(63,120,255,0.06)";
    ctx.lineWidth = 1*S.dpr;
    for(let y=0;y<S.h;y+=110*S.dpr){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(S.w,y); ctx.stroke();
    }
  }

  function glowCircle(x,y,r,fill,glow,blur=22){
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur*S.dpr;
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawPlayer(){
    // inv flash
    const invFlash = player.inv>0 && Math.floor(S.t*12)%2===0;

    // body glow
    glowCircle(player.x,player.y, player.r*1.05, invFlash?"#9fd0ff":"#2b6cff", "#2b6cff", 26);

    // ship (triangle) + cockpit
    const ax = player.aimX, ay = player.aimY;
    const ang = Math.atan2(ay,ax);

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(ang);

    // hull
    ctx.fillStyle = invFlash ? "#cfe8ff" : "#d7e6ff";
    ctx.beginPath();
    ctx.moveTo(player.r*1.2, 0);
    ctx.lineTo(-player.r*0.9, -player.r*0.75);
    ctx.lineTo(-player.r*0.55, 0);
    ctx.lineTo(-player.r*0.9, player.r*0.75);
    ctx.closePath();
    ctx.fill();

    // neon trim
    ctx.strokeStyle = "rgba(43,108,255,0.9)";
    ctx.lineWidth = 2.2*S.dpr;
    ctx.stroke();

    // cockpit
    glowCircle(-player.r*0.1, 0, player.r*0.28, "rgba(0,0,0,0.35)", "rgba(138,180,255,0.9)", 14);

    // thruster flame based on movement
    const sp = len(player.vx, player.vy) / (420*S.dpr);
    const flame = clamp(sp, 0.15, 1.0);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255,210,74,0.95)";
    ctx.beginPath();
    ctx.moveTo(-player.r*1.05, 0);
    ctx.lineTo(-player.r*(1.6 + flame*0.9), -player.r*0.32);
    ctx.lineTo(-player.r*(1.35 + flame*0.6), 0);
    ctx.lineTo(-player.r*(1.6 + flame*0.9), player.r*0.32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // HP pips (top-left-ish near player)
    for(let i=0;i<player.hp;i++){
      glowCircle(18*S.dpr + i*14*S.dpr, (66*S.dpr), 4*S.dpr, "#ffd24a", "rgba(255,210,74,0.9)", 12);
    }
  }

  function drawDrone(e){
    // enemy drone: ring + core
    glowCircle(e.x,e.y, e.r*1.02, "rgba(255,59,59,0.85)", "rgba(255,59,59,0.85)", 22*e.glow);
    ctx.strokeStyle = "rgba(255,230,230,0.65)";
    ctx.lineWidth = 2*S.dpr;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r*0.7,0,Math.PI*2); ctx.stroke();
    glowCircle(e.x,e.y, e.r*0.25, "rgba(20,0,0,0.35)", "rgba(255,120,120,0.8)", 14);
  }

  function drawBullet(b){
    glowCircle(b.x,b.y,b.r, "rgba(43,108,255,0.95)", "rgba(43,108,255,0.95)", 14);
  }

  function drawPickup(p){
    glowCircle(p.x,p.y,p.r*1.05, "rgba(255,210,74,0.95)", "rgba(255,210,74,0.9)", 18);
    ctx.strokeStyle = "rgba(255,245,200,0.75)";
    ctx.lineWidth = 2*S.dpr;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r*0.62,0,Math.PI*2); ctx.stroke();
  }

  function drawParticles(){
    for(const p of parts){
      const k = 1 - (p.t/p.life);
      ctx.globalAlpha = Math.max(0,k);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r*k,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSticks(){
    // visual joystick rings (optional polish)
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 2*S.dpr;

    for(const st of [sticks.left, sticks.right]){
      if(!st.active) continue;
      const dx = st.x - st.x0, dy = st.y - st.y0;
      const max = 70*S.dpr;
      const d = Math.min(max, len(dx,dy));
      const nx = st.x0 + (dx/(len(dx,dy)||1))*d;
      const ny = st.y0 + (dy/(len(dx,dy)||1))*d;

      ctx.strokeStyle = "rgba(138,180,255,0.9)";
      ctx.beginPath(); ctx.arc(st.x0,st.y0, max,0,Math.PI*2); ctx.stroke();

      ctx.fillStyle = "rgba(43,108,255,0.9)";
      ctx.beginPath(); ctx.arc(nx,ny, 16*S.dpr,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function render(){
    bg();

    let ox=0,oy=0;
    if(S.shake>0){
      ox = rand(-S.shake,S.shake);
      oy = rand(-S.shake,S.shake);
      ctx.save(); ctx.translate(ox,oy);
    }

    for(const p of pickups) drawPickup(p);
    for(const b of bullets) drawBullet(b);
    for(const e of drones) drawDrone(e);
    drawPlayer();
    drawParticles();

    if(S.shake>0) ctx.restore();

    drawSticks();
  }

  // ---------- Loop ----------
  function loop(now){
    if(!S.running || S.paused) return;
    const dt = Math.min(0.033, (now - S.last)/1000);
    S.last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- Game flow ----------
  function start(){
    menu.classList.remove("show");
    how.classList.remove("show");
    over.classList.remove("show");
    reset();
    S.running=true; S.paused=false; S.last=performance.now();
    beep(660,0.04,"triangle",0.03);
    requestAnimationFrame(loop);
  }

  function gameOver(){
    S.running=false; S.over=true;

    if(S.score > best){
      best = S.score;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = best;
    }

    finalScoreEl.textContent = S.score;
    finalBestEl.textContent = best;
    over.classList.add("show");
    screenShake(18);
    vibrate(140);
    beep(220,0.08,"sawtooth",0.03);
    beep(160,0.10,"sawtooth",0.03);
  }

  function togglePause(){
    if(!S.running) return;
    S.paused = !S.paused;
    pauseBtn.textContent = S.paused ? "▶️" : "⏸";
    if(!S.paused){
      S.last = performance.now();
      requestAnimationFrame(loop);
    }
  }

  // ---------- UI ----------
  playBtn.addEventListener("click", start);
  retryBtn.addEventListener("click", start);
  homeBtn.addEventListener("click", ()=>{ over.classList.remove("show"); menu.classList.add("show"); });
  howBtn.addEventListener("click", ()=>{ menu.classList.remove("show"); how.classList.add("show"); });
  backBtn.addEventListener("click", ()=>{ how.classList.remove("show"); menu.classList.add("show"); });
  pauseBtn.addEventListener("click", togglePause);

  soundToggle.addEventListener("change", ()=>{ S.sound = soundToggle.checked; if(S.sound) beep(720,0.03); });
  vibeToggle.addEventListener("change", ()=>{ S.vibe  = vibeToggle.checked; if(S.vibe) vibrate(15); });
  S.sound = soundToggle.checked;
  S.vibe  = vibeToggle.checked;

  // show menu first
  menu.classList.add("show");
})();
                              
