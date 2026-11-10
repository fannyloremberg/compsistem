/* COMPSISTEM mascote — só decoração. Não altera o bundle React nem o comportamento dos links. */
(function () {
  "use strict";

  var WELCOME_KEY = "cs-chibi-bemvindo";
  var IDLE_MS = 15000;
  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var root, inner, tela, canvas, ctx, hit, balao, leds, logosel;
  var poses = {};
  var state = "idle";
  var pose = "idle";
  var face = "smile";
  var hugging = false;
  var sleeping = false;
  var lastInput = Date.now();
  var pointer = { x: 0, y: 0, has: false };
  var eye = { x: 0, y: 0 };
  var eyeLock = null;
  var blinkUntil = 0;
  var timers = [];
  var raf = 0;
  var staticUntil = 0;
  var noise = null;
  var celebrated = false;
  var pendingAsk = false;

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function isMobile() { return window.innerWidth < 768; }
  function later(fn, ms) {
    var id = window.setTimeout(fn, ms);
    timers.push(id);
    return id;
  }
  function clearTimers() {
    timers.forEach(function (id) { clearTimeout(id); });
    timers = [];
  }
  function busy() { return state !== "idle"; }

  function setPose(name) {
    pose = name;
    Object.keys(poses).forEach(function (k) {
      poses[k].classList.toggle("cs-on", k === name);
    });
  }

  function setFace(name) {
    face = name;
    if (name !== "static") staticUntil = 0;
  }

  function markInput() {
    lastInput = Date.now();
    if (sleeping) wake();
  }

  /* ---------- posição relativa à logo (funciona no iOS / Firefox) ---------- */
  function placeHome(withTransition) {
    if (hugging) return;
    var logo = document.querySelector("img.logo-glow");
    if (!root || !logo) return;
    var r = logo.getBoundingClientRect();
    if (r.width < 8) return;
    var mobile = isMobile();
    var w = r.width * (mobile ? 0.5 : 0.48);
    var h = w * (480 / 360);
    var cx = r.left + r.width * 0.7;
    var cy = r.top;
    root.style.position = "fixed";
    root.style.right = "auto";
    root.style.bottom = "auto";
    if (!withTransition) root.style.transition = "none";
    root.style.left = cx + "px";
    root.style.top = cy + "px";
    root.style.width = w + "px";
    root.style.height = h + "px";
    root.style.transform = "translate(-50%, -72%)";
    root.style.zIndex = "8";
    root.style.pointerEvents = "none";
  }

  function onScrollOrResize() {
    placeHome(false);
  }

  /* ---------- desenho da tela ---------- */
  function sizeCanvas() {
    if (!canvas || !tela) return;
    var r = tela.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(120, Math.round(r.width * dpr));
    var h = Math.max(80, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function roundedRect(g, x, y, w, h, rad) {
    var rr = Math.min(rad, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  function drawHeart(g, x, y, s, color) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 6);
    g.bezierCurveTo(-14, -4, -11, -18, 0, -12);
    g.bezierCurveTo(11, -18, 14, -4, 0, 6);
    g.fill();
    g.restore();
  }

  function drawBolt(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = "#ffe566";
    g.strokeStyle = "#ff2d8a";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(4, -16);
    g.lineTo(-6, 0);
    g.lineTo(1, 0);
    g.lineTo(-4, 16);
    g.lineTo(8, -2);
    g.lineTo(1, -2);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  function textFace(g, w, h, lines, color) {
    g.fillStyle = color || "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    var n = lines.length;
    var size = n > 1 ? Math.min(w, h) * 0.22 : Math.min(w, h) * 0.32;
    g.font = "700 " + size + "px Outfit, system-ui, sans-serif";
    var gap = size * 1.15;
    var y0 = h / 2 - ((n - 1) * gap) / 2;
    for (var i = 0; i < n; i++) g.fillText(lines[i], w / 2, y0 + i * gap);
  }

  /* Caras recortadas da arte aprovada (chibi_tv.png / chibi_tv_pisca.png) */
  var faceArt = { smile: null, blink: null, ready: false };
  /* centros e raios dos olhinhos na arte, em fração da largura/altura da tela */
  var EYE_ART = {
    L: { cx: 55.5 / 224, cy: 77.0 / 156, r: 27.5 / 224 },
    R: { cx: 176.0 / 224, cy: 77.5 / 156, r: 28.0 / 224 }
  };

  (function loadFaceArt() {
    function one(key, src) {
      var im = new Image();
      im.onload = function () {
        faceArt[key] = im;
        if (faceArt.smile && faceArt.blink) {
          faceArt.ready = true;
          if (ctx) paint();
        }
      };
      im.src = src;
    }
    one("smile", "./loja/chibi_face_sorriso.png");
    one("blink", "./loja/chibi_face_pisca.png");
  })();

  function drawFacePhoto(g, w, h, img, look) {
    if (!img) return false;
    g.imageSmoothingEnabled = true;
    try { g.imageSmoothingQuality = "high"; } catch (e) {}
    g.drawImage(img, 0, 0, w, h);
    if (!look) return true;
    var lx = look.x || 0, ly = look.y || 0;
    if (lx * lx + ly * ly < 0.0025) return true;
    /* desvia só um pouquinho a pupila/brilho, recortada no olho */
    ["L", "R"].forEach(function (k) {
      var e = EYE_ART[k];
      var cx = e.cx * w, cy = e.cy * h, rad = e.r * w;
      var maxOff = rad * 0.13;
      var ox = lx * maxOff;
      var oy = ly * maxOff * 0.85;
      g.save();
      g.beginPath();
      g.arc(cx, cy, rad * 0.92, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = "#161016";
      g.fill();
      g.drawImage(img, ox, oy, w, h);
      g.restore();
    });
    return true;
  }

  function drawStatic(g, w, h) {

    if (!noise || noise.width !== w || noise.height !== h) {
      noise = g.createImageData(w, h);
    }
    var d = noise.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      var tint = Math.random() < 0.08 ? 1 : 0;
      d[i] = tint ? 255 : v;
      d[i + 1] = tint ? 80 : v;
      d[i + 2] = tint ? 160 : v;
      d[i + 3] = 255;
    }
    g.putImageData(noise, 0, 0);
  }

  function paint() {
    if (!ctx || !canvas) return;
    sizeCanvas();
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    /* fundo da tela */
    var grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#2a2a2e");
    grd.addColorStop(1, "#101012");
    ctx.fillStyle = grd;
    roundedRect(ctx, 0, 0, w, h, Math.min(w, h) * 0.18);
    ctx.fill();

    var now = Date.now();
    var closed = now < blinkUntil;
    var kind = face;
    if (kind === "static" || now < staticUntil) {
      drawStatic(ctx, w, h);
      return;
    }
    if (kind === "smile" || kind === "blink") {
      if (closed || kind === "blink") drawFacePhoto(ctx, w, h, faceArt.blink, null);
      else drawFacePhoto(ctx, w, h, faceArt.smile, eye);
    } else if (kind === "funny") {
      drawFacePhoto(ctx, w, h, faceArt.blink, null);
    } else if (kind === "heart") {
      drawHeart(ctx, w / 2, h / 2 + 4, Math.min(w, h) * 0.028, "#ff2d8a");
    } else if (kind === "bolt") {
      drawBolt(ctx, w / 2, h / 2, Math.min(w, h) * 0.028);
    } else if (kind === "oi") {
      textFace(ctx, w, h, ["Oi!"], "#fff");
    } else if (kind === "welcome") {
      textFace(ctx, w, h, ["Bem-vindo", "❤️"], "#fff");
    } else if (kind === "zzz") {
      ctx.fillStyle = "#f6f6f8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var t = reduced ? 0 : (now / 400);
      ctx.font = "700 " + (h * 0.22) + "px Outfit, system-ui, sans-serif";
      ctx.fillText("z", w * 0.38, h * 0.58 + Math.sin(t) * 3);
      ctx.font = "700 " + (h * 0.28) + "px Outfit, system-ui, sans-serif";
      ctx.fillText("z", w * 0.52, h * 0.42 + Math.sin(t + 1) * 4);
      ctx.font = "700 " + (h * 0.34) + "px Outfit, system-ui, sans-serif";
      ctx.fillText("z", w * 0.68, h * 0.28 + Math.sin(t + 2) * 3);
    } else if (kind === "oba") {
      textFace(ctx, w, h, ["Oba!"], "#fff");
      drawHeart(ctx, w * 0.78, h * 0.28, Math.min(w, h) * 0.012, "#ff2d8a");
    }
  }

  function loop() {
    /* olhos seguem o ponteiro (ou o dedo) quando o rosto é o sorriso */
    if (eyeLock) {
      eye.x = eyeLock.x;
      eye.y = eyeLock.y;
    } else if (pointer.has && (face === "smile" || face === "funny") && !reduced && tela) {
      var r = tela.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = pointer.x - cx, dy = pointer.y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var mag = Math.min(1, dist / 180);
      var tx = (dx / dist) * mag, ty = (dy / dist) * mag;
      eye.x += (tx - eye.x) * 0.22;
      eye.y += (ty - eye.y) * 0.22;
    } else {
      eye.x += (0 - eye.x) * 0.12;
      eye.y += (0 - eye.y) * 0.12;
    }
    paint();
    raf = requestAnimationFrame(loop);
  }

  /* ---------- ações ---------- */
  function showBalao(text, variant, ms) {
    if (!balao) return;
    balao.textContent = text;
    balao.classList.toggle("cs-balao-welcome", variant === "welcome");
    balao.classList.add("cs-show");
    balao.hidden = false;
    later(hideBalao, ms);
  }
  function hideBalao() {
    if (!balao) return;
    balao.classList.remove("cs-show");
    later(function () {
      if (!balao.classList.contains("cs-show")) balao.hidden = true;
    }, 280);
  }

  function jump() {
    if (reduced || !inner) return;
    inner.classList.remove("cs-pula");
    void inner.offsetWidth;
    inner.classList.add("cs-pula");
    later(function () { inner.classList.remove("cs-pula"); }, 560);
  }

  function confetti() {
    if (!root || reduced) return;
    var box = root.querySelector(".cs-confetes");
    if (!box) return;
    box.innerHTML = "";
    var colors = ["#ff2d8a", "#ffd0e8", "#f6f6f8", "#c2185b", "#ffe566"];
    for (var i = 0; i < 22; i++) {
      var p = document.createElement("span");
      p.className = "cs-confete";
      p.style.background = colors[i % colors.length];
      p.style.left = 20 + Math.random() * 60 + "%";
      p.style.setProperty("--dx", (Math.random() * 120 - 60) + "px");
      p.style.setProperty("--dy", (80 + Math.random() * 90) + "px");
      p.style.setProperty("--rot", (Math.random() * 360 - 180) + "deg");
      p.style.animationDelay = (Math.random() * 0.15) + "s";
      box.appendChild(p);
    }
    later(function () { box.innerHTML = ""; }, 1400);
  }

  function finish(nextWait) {
    state = "idle";
    setPose("idle");
    if (face !== "zzz") setFace("smile");
    hideBalao();
    if (leds) leds.classList.remove("cs-liga");
    if (typeof nextWait === "number") later(scheduleNext, nextWait);
  }

  function doWelcome() {
    if (busy()) return;
    state = "welcome";
    setPose("idle");
    setFace("welcome");
    jump();
    showBalao("Bem-vindo ❤️", "welcome", isMobile() ? 2200 : 3200);
    later(function () {
      setFace("smile");
      finish(1800);
    }, isMobile() ? 2600 : 3600);
  }

  function doFaces() {
    if (busy() || sleeping) return;
    state = "faces";
    var seq = ["heart", "bolt", "oi"];
    var i = 0;
    function step() {
      if (state !== "faces") return;
      if (i >= seq.length) {
        setFace("smile");
        finish(4000);
        return;
      }
      setFace(seq[i]);
      i += 1;
      later(step, 1400);
    }
    step();
  }

  function doRemote() {
    if (busy() || sleeping) return;
    state = "remote";
    setPose("controle");
    setFace("smile");
    later(function () {
      if (leds) leds.classList.add("cs-liga");
    }, reduced ? 0 : 280);
    later(function () {
      if (leds) leds.classList.remove("cs-liga");
      setPose("idle");
      finish(5000);
    }, 2800);
  }

  function doBubble() {
    if (busy() || sleeping) return;
    state = "bubble";
    setPose("aponta");
    setFace("oi");
    var ms = isMobile() ? 2400 : 4200;
    showBalao("Precisa de peça? Me chama!", "pedir", ms);
    later(function () {
      setPose("idle");
      setFace("smile");
      finish(6000);
    }, ms + 300);
  }

  function doStatic() {
    /* interrompe ação programada, não o abraço */
    if (hugging) return;
    clearTimers();
    if (leds) leds.classList.remove("cs-liga");
    hideBalao();
    state = "static";
    sleeping = false;
    setPose("idle");
    setFace("static");
    staticUntil = Date.now() + (reduced ? 120 : 650);
    later(function () {
      setFace("funny");
      jump();
      later(function () {
        setFace("smile");
        finish(2500);
      }, 1400);
    }, reduced ? 140 : 680);
  }

  function doCelebrate() {
    if (hugging) return;
    clearTimers();
    hideBalao();
    if (leds) leds.classList.remove("cs-liga");
    state = "celebrate";
    sleeping = false;
    setPose("acena");
    setFace("oba");
    jump();
    confetti();
    later(function () { jump(); }, 400);
    later(function () {
      setPose("idle");
      setFace("smile");
      finish(5000);
    }, 2200);
  }

  function doSleep() {
    if (busy() || sleeping) return;
    sleeping = true;
    state = "sleep";
    setPose("idle");
    setFace("zzz");
    hideBalao();
    if (inner) inner.classList.remove("cs-flutua");
  }

  function wake() {
    if (!sleeping && state !== "sleep") return;
    sleeping = false;
    if (state === "sleep") state = "idle";
    setFace("smile");
    if (inner && !reduced) inner.classList.add("cs-flutua");
    later(scheduleNext, 2500);
  }

  function doHug(btn) {
    if (!root || !btn) return;
    /* não atrasar o clique: só anima depois, na página que ficou aberta (target=_blank) */
    clearTimers();
    hideBalao();
    if (leds) leds.classList.remove("cs-liga");
    state = "hug";
    hugging = true;
    sleeping = false;
    setPose("idle");
    setFace("heart");
    var br = btn.getBoundingClientRect();
    var mobile = isMobile();
    var w = Math.max(72, Math.min(mobile ? 96 : 110, br.height * 2.1));
    var h = w * (480 / 360);
    var shift = mobile ? -0.28 : -0.8;
    var left = br.left + br.width * (mobile ? 0.06 : 0.08);
    var top = br.top + br.height * 0.55;
    /* mantém o mascote inteiro dentro da viewport */
    var minLeft = 10 - shift * w;
    var maxLeft = window.innerWidth - 10 - (1 + shift) * w;
    if (maxLeft < minLeft) left = (minLeft + maxLeft) / 2;
    else left = Math.min(Math.max(left, minLeft), maxLeft);
    root.style.transition = reduced ? "none" : "left .45s cubic-bezier(.22,.8,.25,1), top .45s cubic-bezier(.22,.8,.25,1), width .45s, height .45s, transform .45s";
    root.style.zIndex = "35";
    root.style.left = left + "px";
    root.style.top = top + "px";
    root.style.width = w + "px";
    root.style.height = h + "px";
    root.style.transform = "translate(" + (shift * 100) + "%, -50%) rotate(-8deg)";
    if (inner && !reduced) {
      later(function () {
        inner.classList.remove("cs-aperto");
        void inner.offsetWidth;
        inner.classList.add("cs-aperto");
      }, 420);
    }
    later(function () {
      root.style.transition = reduced ? "none" : "left .4s ease, top .4s ease, width .4s, height .4s, transform .4s";
      hugging = false;
      placeHome(true);
      setFace("smile");
      later(function () {
        if (inner) inner.classList.remove("cs-aperto");
        root.style.transition = "none";
        finish(4000);
      }, reduced ? 50 : 420);
    }, 1500);
  }

  function scheduleNext() {
    if (busy() || sleeping) return;
    /* espaça os eventos para não sobrepor nem cansar */
    later(function pick() {
      if (busy() || sleeping) return;
      var roll = Math.random();
      if (roll < 0.34) doFaces();
      else if (roll < 0.62) doRemote();
      else if (roll < 0.88) doBubble();
      else {
        setPose("acena");
        later(function () { setPose("idle"); later(scheduleNext, 4000); }, 1800);
      }
    }, 8000 + Math.random() * 5000);
  }

  function tickIdle() {
    if (!sleeping && !busy() && Date.now() - lastInput > IDLE_MS) doSleep();
    /* piscar no sorriso */
    if (!busy() && !sleeping && face === "smile" && Date.now() > blinkUntil + 2800 && Math.random() < 0.08) {
      blinkUntil = Date.now() + 160;
    }
  }

  /* ---------- cadastro / consulta de preços ---------- */
  var SUCCESS_RE = /seus pre[cç]os est[aã]o nesta p[aá]gina|pode fechar e abrir o site de novo|toque em enviar\.\s*a mensagem diz se [eé] primeira compra/i;

  function watchCadastro() {
    var box = document.getElementById("precos");
    if (!box) return;
    box.addEventListener("submit", function (ev) {
      var form = ev.target;
      if (!(form instanceof HTMLFormElement)) return;
      /* o formulário de nome+produto do cliente, não o de senha da loja */
      var hasNome = !!form.querySelector('input[data-voice="nome"], input[placeholder="Seu nome"]');
      if (hasNome) pendingAsk = true;
    }, true);

    var obs = new MutationObserver(function () {
      if (celebrated) return;
      if (SUCCESS_RE.test(box.innerText || "")) {
        celebrated = true;
        pendingAsk = false;
        doCelebrate();
      }
    });
    obs.observe(box, { childList: true, subtree: true, characterData: true });
  }

  /* ---------- WhatsApp: abraço visual, listener passivo, sem preventDefault ---------- */
  function isWaLink(el) {
    if (!el) return null;
    var a = el.closest ? el.closest("a") : null;
    if (!a || !a.href) return null;
    var h = a.href.toLowerCase();
    if (h.indexOf("wa.me") !== -1 || h.indexOf("api.whatsapp") !== -1 || h.indexOf("whatsapp.com") !== -1) return a;
    return null;
  }

  function onWaPointer(ev) {
    var a = isWaLink(ev.target);
    if (!a) return;
    markInput();
    /* dispara a animação sem atrasar a navegação */
    try { doHug(a); } catch (err) {}
  }

  function onBalaoClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    hideBalao();
    var btn = document.querySelector('#apresentacao a[data-voice="pedido"], a[data-voice="pedido"]');
    if (!btn) btn = document.querySelector('#apresentacao a[href*="wa.me"]');
    if (btn) {
      try { btn.focus({ preventScroll: true }); } catch (e) { try { btn.focus(); } catch (e2) {} }
      later(function () {
        var r = btn.getBoundingClientRect();
        var sticky = document.querySelector("[data-sticky]");
        var extra = sticky ? sticky.getBoundingClientRect().bottom : 0;
        var y = window.scrollY + r.top - Math.max(extra + 12, 80);
        window.scrollTo({ top: Math.max(0, y), behavior: reduced ? "auto" : "smooth" });
      }, 10);
    }
    if (state === "bubble") {
      setPose("idle");
      setFace("smile");
      finish(4000);
    }
  }

  function bind() {
    document.addEventListener("pointermove", function (ev) {
      pointer.x = ev.clientX;
      pointer.y = ev.clientY;
      pointer.has = true;
      /* movimento do mouse não reseta o sono sozinho no desktop a cada pixel —
         só considera “atividade” em clique, toque, tecla e rolagem. */
    }, { passive: true });
    document.addEventListener("pointerdown", function (ev) {
      pointer.x = ev.clientX;
      pointer.y = ev.clientY;
      pointer.has = true;
      markInput();
      onWaPointer(ev);
    }, { passive: true, capture: true });
    document.addEventListener("keydown", markInput, { passive: true });
    document.addEventListener("scroll", function () {
      markInput();
      onScrollOrResize();
    }, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    window.addEventListener("orientationchange", function () {
      later(onScrollOrResize, 200);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onScrollOrResize, { passive: true });
      window.visualViewport.addEventListener("scroll", onScrollOrResize, { passive: true });
    }

    if (hit) {
      hit.addEventListener("mouseenter", function () {
        if (!busy() && !sleeping) jump();
      });
      hit.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        markInput();
        doStatic();
      });
    }
    if (balao) balao.addEventListener("click", onBalaoClick);
  }

  function startSchedule() {
    try {
      if (!sessionStorage.getItem(WELCOME_KEY)) {
        sessionStorage.setItem(WELCOME_KEY, "1");
        later(doWelcome, 700);
        return;
      }
    } catch (e) {
      later(doWelcome, 700);
      return;
    }
    later(scheduleNext, 4000);
  }

  function boot() {
    root = document.querySelector(".cs-chibi");
    if (!root) return;
    inner = root.querySelector(".cs-chibi-inner");
    tela = root.querySelector(".cs-tela");
    canvas = root.querySelector(".cs-tela canvas");
    hit = root.querySelector(".cs-chibi-hit");
    balao = root.querySelector(".cs-balao");
    leds = document.querySelector(".cs-leds");
    if (canvas) ctx = canvas.getContext("2d");
    $all(".cs-corpo", root).forEach(function (img) {
      poses[img.getAttribute("data-pose")] = img;
    });
    setPose("idle");
    setFace("smile");
    if (inner && !reduced) inner.classList.add("cs-flutua");

    placeHome(false);
    later(function () { placeHome(false); sizeCanvas(); paint(); }, 50);
    later(placeHome, 400);
    later(placeHome, 1200);

    var logo = document.querySelector("img.logo-glow");
    if (logo) {
      if (!logo.complete) logo.addEventListener("load", function () { placeHome(false); });
      try {
        var ro = new ResizeObserver(function () { placeHome(false); });
        ro.observe(logo);
      } catch (e) {}
    }
    /* hidratação do React pode atrasar um pouco a logo */
    var n = 0;
    var hydra = setInterval(function () {
      placeHome(false);
      n += 1;
      if (n > 20) clearInterval(hydra);
    }, 250);

    bind();
    watchCadastro();
    sizeCanvas();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    setInterval(tickIdle, 400);
    startSchedule();
  }

  /* API usada só na prévia / gravação do GIF */
  window.__csChibi = {
    welcome: function () { try { sessionStorage.removeItem(WELCOME_KEY); } catch (e) {} doWelcome(); },
    faces: doFaces,
    remote: doRemote,
    bubble: doBubble,
    static: doStatic,
    celebrate: doCelebrate,
    sleep: doSleep,
    wake: wake,
    jump: jump,
    hug: function (sel) {
      var el = typeof sel === "string" ? document.querySelector(sel) : sel;
      if (!el) el = document.querySelector('#apresentacao a[data-voice="pedido"], a[href*="wa.me"]');
      if (el) doHug(el);
    },
    place: function () { placeHome(false); },
    setPointer: function (x, y) { pointer.x = x; pointer.y = y; pointer.has = true; eyeLock = null; },
    setFace: function (name) { setFace(name); if (name !== "static") staticUntil = 0; },
    setEye: function (x, y) {
      if (x == null || y == null) { eyeLock = null; return; }
      eyeLock = { x: x, y: y };
      eye.x = x;
      eye.y = y;
    },
    setPose: setPose
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
