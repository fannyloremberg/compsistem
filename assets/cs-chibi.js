/* COMPSISTEM mascote — só decoração. Não altera o bundle React nem o comportamento dos links. */
(function () {
  "use strict";

  var WELCOME_KEY = "cs-chibi-bemvindo";
  var IDLE_MS = 15000;
  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  /* Horário da loja — copiado do conteúdo do site (bundle routes-DpqyCAA7.js,
     seção "Horário" / #hours, array z; também no texto de contato):
       "Segunda a sexta, 9h às 16h30. Sábado, 9h às 13h. Domingo, fechado."
     Fuso: America/Sao_Paulo. enabled: true porque o horário foi encontrado no site. */
  var HORARIO = {
    enabled: true,
    tz: "America/Sao_Paulo",
    monFri: { start: 9 * 60, end: 16 * 60 + 30 },
    saturday: { start: 9 * 60, end: 13 * 60 },
    sundayClosed: true
  };

  function getDebugFlag() {
    try {
      var m = /(?:^|[?&])chibi=([^&]+)/i.exec(location.search || "");
      return m ? decodeURIComponent(m[1]).toLowerCase().replace(/[^a-z0-9-]/g, "") : "";
    } catch (e) { return ""; }
  }
  var debugFlag = getDebugFlag();

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
  var docked = false;
  var firstTourDone = false;
  var demoQueue = [];
  var repeatIdx = 0;
  var HUG_OPEN_MS = 1300;
  var pendingQueue = [];
  var tapTimes = [];
  var currentHat = "";
  var outfit = "";
  var hatForced = false;
  var bottomOnce = false;
  var sectionSeen = {};

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

  var OUTFIT_BODY = { pijama: 1, natal: 1, anonovo: 1, criancas: 1, pascoa: 1 };

  function restPose() {
    if (OUTFIT_BODY[outfit]) return outfit;
    return "idle";
  }

  function setPose(name) {
    if (name !== "caminha" && OUTFIT_BODY[outfit] && name !== outfit) name = outfit;
    pose = name;
    Object.keys(poses).forEach(function (k) {
      poses[k].classList.toggle("cs-on", k === name);
    });
    if (root) root.classList.toggle("cs-caminha", name === "caminha");
  }

  function setFace(name) {
    face = name;
    if (name !== "static") staticUntil = 0;
  }

  function markInput() {
    lastInput = Date.now();
    if (sleeping) wake();
  }

  /* ---------- posição: sentado na logo, ou dock fixo se a logo saiu da vista ---------- */
  function flyTransition() {
    return reduced ? "none" : "left .55s cubic-bezier(.22,.8,.25,1), top .55s cubic-bezier(.22,.8,.25,1), width .5s cubic-bezier(.22,.8,.25,1), height .5s cubic-bezier(.22,.8,.25,1), transform .55s cubic-bezier(.22,.8,.25,1)";
  }

  function safeInset(side) {
    var probe = document.getElementById("cs-safe-probe");
    if (!probe) {
      probe = document.createElement("div");
      probe.id = "cs-safe-probe";
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = "position:fixed;pointer-events:none;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);";
      document.body.appendChild(probe);
    }
    var cs = window.getComputedStyle(probe);
    if (side === "top") return parseFloat(cs.paddingTop) || 0;
    if (side === "right") return parseFloat(cs.paddingRight) || 0;
    if (side === "bottom") return parseFloat(cs.paddingBottom) || 0;
    if (side === "left") return parseFloat(cs.paddingLeft) || 0;
    return 0;
  }

  function viewBox() {
    var vv = window.visualViewport;
    if (vv && vv.width && vv.height) {
      return { left: vv.offsetLeft || 0, top: vv.offsetTop || 0, w: vv.width, h: vv.height };
    }
    return { left: 0, top: 0, w: window.innerWidth, h: window.innerHeight };
  }

  function topStickyBottom() {
    var vh = window.innerHeight, maxB = 0;
    var nodes = document.querySelectorAll("header, [data-sticky], .sticky, .z-30");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (root && (el === root || root.contains(el))) continue;
      var cs = window.getComputedStyle(el);
      if (cs.position !== "sticky" && cs.position !== "fixed") continue;
      if (cs.pointerEvents === "none" || cs.display === "none" || cs.visibility === "hidden") continue;
      var r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      /* só barreiras grudadas no topo */
      if (r.top > 80) continue;
      if (r.bottom > maxB && r.bottom < vh * 0.6) maxB = r.bottom;
    }
    return Math.max(maxB, safeInset("top"));
  }

  function collectObstacles() {
    var out = [];
    var vw = window.innerWidth, vh = window.innerHeight;
    var nodes = document.body ? document.body.getElementsByTagName("*") : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (root && (el === root || root.contains(el))) continue;
      if (el.id === "cs-safe-probe") continue;
      if (el.classList && (el.classList.contains("cs-leds") || el.classList.contains("cs-led-barra") || el.classList.contains("cs-led-amb") || el.classList.contains("cs-led-flash"))) continue;
      var cs = window.getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      if (cs.pointerEvents === "none") continue;
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
      var r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      out.push({ x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height });
    }
    return out;
  }

  function rectsOverlap(a, o, pad) {
    return a.x < o.r + pad && a.x + a.w > o.x - pad && a.y < o.b + pad && a.y + a.h > o.y - pad;
  }

  function dockSize() {
    var mobile = isMobile();
    var w = mobile ? 88 : 104;
    return { w: w, h: w * (480 / 360) };
  }

  function findDockRect() {
    var sz = dockSize();
    var w = sz.w, h = sz.h;
    var view = viewBox();
    var margin = 12;
    var topMin = Math.max(view.top + 8, topStickyBottom() + 8);
    var left = view.left + view.w - safeInset("right") - margin - w;
    var top = view.top + view.h - safeInset("bottom") - margin - h;
    var minLeft = view.left + safeInset("left") + margin;
    /* reserva um pouco à esquerda para o balão */
    if (left < minLeft + 120) left = Math.max(minLeft, left);
    if (top < topMin) top = topMin;
    var box = { x: left, y: top, w: w, h: h };
    var obs = collectObstacles();
    var pad = 10;
    var guard = 0;
    while (guard < 12) {
      var hit = null;
      for (var i = 0; i < obs.length; i++) {
        if (rectsOverlap(box, obs[i], pad)) { hit = obs[i]; break; }
      }
      if (!hit) break;
      guard += 1;
      /* barra larga no rodapé: sobe; senão tenta subir ou ir para a esquerda */
      if (hit.w > view.w * 0.45 && hit.b > view.top + view.h * 0.7) {
        box.y = hit.y - h - pad;
      } else if (hit.y + hit.h / 2 > box.y) {
        box.y = hit.y - h - pad;
      } else {
        box.x = hit.x - w - pad;
      }
      if (box.x < minLeft) box.x = minLeft;
      if (box.y < topMin) box.y = topMin;
      if (box.x + box.w > view.left + view.w - safeInset("right") - 4) {
        box.x = view.left + view.w - safeInset("right") - 4 - box.w;
      }
      if (box.y + box.h > view.top + view.h - safeInset("bottom") - 4) {
        box.y = Math.max(topMin, view.top + view.h - safeInset("bottom") - 4 - box.h);
      }
    }
    return box;
  }

  function shouldSitOnLogo() {
    var logo = document.querySelector("img.logo-glow");
    if (!logo) return false;
    var r = logo.getBoundingClientRect();
    if (r.width < 8) return false;
    var mobile = isMobile();
    var w = r.width * (mobile ? 0.5 : 0.48);
    var h = w * (480 / 360);
    var mascotTop = r.top - 0.72 * h;
    var mascotBottom = r.top + 0.28 * h;
    var view = viewBox();
    var sticky = topStickyBottom();
    var viewTop = Math.max(view.top, sticky);
    var viewBottom = view.top + view.h;
    var visibleH = Math.min(mascotBottom, viewBottom) - Math.max(mascotTop, viewTop);
    if (visibleH < 0) visibleH = 0;
    var logoOnScreen = r.bottom > viewTop + 24 && r.top < viewBottom - 8;
    if (!logoOnScreen) return false;
    /* folga diferente na ida e na volta, para não ficar oscilando */
    if (docked) return visibleH >= h * 0.38;
    return visibleH >= h * 0.28;
  }

  function applyBox(left, top, w, h, transform, z, withTransition) {
    if (!root) return;
    root.style.position = "fixed";
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.transition = withTransition && !reduced ? flyTransition() : "none";
    root.style.left = left + "px";
    root.style.top = top + "px";
    root.style.width = w + "px";
    root.style.height = h + "px";
    root.style.transform = transform;
    root.style.zIndex = z;
    root.style.pointerEvents = "none";
  }

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
    var wasDocked = docked;
    docked = false;
    if (root.classList) root.classList.remove("cs-dock");
    applyBox(cx, cy, w, h, "translate(-50%, -72%)", "8", withTransition || wasDocked);
  }

  function placeDock(withTransition) {
    if (hugging || !root) return;
    var box = findDockRect();
    var wasHome = !docked;
    docked = true;
    if (root.classList) root.classList.add("cs-dock");
    applyBox(box.x, box.y, box.w, box.h, "none", "25", withTransition || wasHome);
  }

  function updatePlace(withTransition) {
    if (hugging) return;
    if (shouldSitOnLogo()) placeHome(!!withTransition);
    else placeDock(!!withTransition);
  }

  function onScrollOrResize() {
    updatePlace(false);
    clampZeds();
    if (balao && balao.classList.contains("cs-show")) placeBalao();
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

  function drawLedBar(g, w, h) {
    /* Barra de backlight de TV: PCB comprida com vários LEDs brilhando. */
    var bw = w * 0.92, bh = Math.max(h * 0.46, w * 0.22);
    var x = (w - bw) / 2, y = (h - bh) / 2;
    var n = 7;
    var t = reduced ? 0 : (Date.now() / 220);
    g.save();
    /* sombra da peça */
    g.fillStyle = "rgba(0,0,0,0.45)";
    roundedRect(g, x + w * 0.012, y + h * 0.03, bw, bh, bh * 0.22);
    g.fill();
    /* placa (PCB) */
    var board = g.createLinearGradient(x, y, x, y + bh);
    board.addColorStop(0, "#2a2f28");
    board.addColorStop(0.45, "#1a2218");
    board.addColorStop(1, "#0e140c");
    g.fillStyle = board;
    roundedRect(g, x, y, bw, bh, bh * 0.22);
    g.fill();
    /* borda dourada/cobre */
    g.strokeStyle = "rgba(210, 170, 80, 0.65)";
    g.lineWidth = Math.max(1.5, w * 0.012);
    roundedRect(g, x, y, bw, bh, bh * 0.22);
    g.stroke();
    /* filete de luz no topo (espessura) */
    g.strokeStyle = "rgba(255,255,255,0.28)";
    g.lineWidth = Math.max(1, w * 0.008);
    g.beginPath();
    g.moveTo(x + bh * 0.25, y + bh * 0.12);
    g.lineTo(x + bw - bh * 0.25, y + bh * 0.12);
    g.stroke();
    /* trilhas de cobre */
    g.strokeStyle = "rgba(196, 140, 50, 0.4)";
    g.lineWidth = Math.max(1, w * 0.007);
    g.beginPath();
    g.moveTo(x + bw * 0.06, y + bh * 0.72);
    g.lineTo(x + bw * 0.94, y + bh * 0.72);
    g.stroke();
    var pad = bw * 0.08;
    var span = bw - pad * 2;
    for (var i = 0; i < n; i++) {
      var cx = x + pad + (i + 0.5) * (span / n);
      var cy = y + bh * 0.44;
      var glow = 0.7 + 0.3 * Math.sin(t + i * 0.85);
      if (reduced) glow = 0.95;
      var ledW = Math.min(span / n * 0.62, bh * 0.42);
      var ledH = bh * 0.36;
      /* base SMD */
      g.fillStyle = "#0a0a0c";
      roundedRect(g, cx - ledW / 2, cy - ledH / 2, ledW, ledH, ledH * 0.18);
      g.fill();
      /* bloom */
      var rad = ledH * 0.85 * (0.85 + 0.15 * glow);
      var grd = g.createRadialGradient(cx, cy, 0, cx, cy, rad * 2.4);
      grd.addColorStop(0, "rgba(255,255,255," + (0.98 * glow) + ")");
      grd.addColorStop(0.22, "rgba(255,230,245," + (0.9 * glow) + ")");
      grd.addColorStop(0.5, "rgba(255,45,138," + (0.7 * glow) + ")");
      grd.addColorStop(1, "rgba(255,45,138,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(cx, cy, rad * 2.3, 0, Math.PI * 2);
      g.fill();
      /* lente */
      var lens = g.createRadialGradient(cx - rad * 0.15, cy - rad * 0.18, 0, cx, cy, rad);
      lens.addColorStop(0, "#fff");
      lens.addColorStop(0.35, "#ffe8f3");
      lens.addColorStop(0.7, "#ff5aa0");
      lens.addColorStop(1, "#c2185b");
      g.fillStyle = lens;
      g.beginPath();
      g.arc(cx, cy, rad * 0.55, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function drawSparkle(g, x, y, s, color) {
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI / 4);
    g.fillStyle = color || "#fff";
    g.beginPath();
    g.moveTo(0, -s);
    g.quadraticCurveTo(s * 0.15, -s * 0.15, s, 0);
    g.quadraticCurveTo(s * 0.15, s * 0.15, 0, s);
    g.quadraticCurveTo(-s * 0.15, s * 0.15, -s, 0);
    g.quadraticCurveTo(-s * 0.15, -s * 0.15, 0, -s);
    g.fill();
    g.restore();
  }

  function drawAcrylic(g, w, h) {
    /* Chapa de acrílico / diffuser: placa translúcida com brilho e reflexo. */
    var pw = w * 0.78, ph = h * 0.78;
    var x = (w - pw) / 2, y = (h - ph) / 2;
    var t = reduced ? 0 : (Date.now() / 500);
    g.save();
    /* sombra */
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.moveTo(x + pw * 0.1, y + ph + h * 0.02);
    g.lineTo(x + pw * 0.95, y + ph + h * 0.02);
    g.lineTo(x + pw * 0.88, y + ph + h * 0.05);
    g.lineTo(x + pw * 0.16, y + ph + h * 0.05);
    g.closePath();
    g.fill();
    /* perspectiva: trapézio leve (placa inclinada) */
    var inset = pw * 0.06;
    var p1 = [x + inset, y];
    var p2 = [x + pw - inset * 0.4, y + ph * 0.04];
    var p3 = [x + pw, y + ph];
    var p4 = [x, y + ph - ph * 0.02];
    function platePath() {
      g.beginPath();
      g.moveTo(p1[0], p1[1]);
      g.lineTo(p2[0], p2[1]);
      g.lineTo(p3[0], p3[1]);
      g.lineTo(p4[0], p4[1]);
      g.closePath();
    }
    /* espessura (aresta direita e inferior) */
    var thick = Math.max(4, w * 0.035);
    g.fillStyle = "rgba(180, 90, 130, 0.7)";
    g.beginPath();
    g.moveTo(p2[0], p2[1]);
    g.lineTo(p2[0] + thick * 0.55, p2[1] + thick * 0.35);
    g.lineTo(p3[0] + thick * 0.55, p3[1] + thick * 0.35);
    g.lineTo(p4[0] + thick * 0.25, p4[1] + thick * 0.45);
    g.lineTo(p4[0], p4[1]);
    g.lineTo(p3[0], p3[1]);
    g.closePath();
    g.fill();
    /* face translúcida */
    var grd = g.createLinearGradient(x, y, x + pw, y + ph);
    grd.addColorStop(0, "rgba(255,255,255,0.72)");
    grd.addColorStop(0.28, "rgba(255,230,245,0.4)");
    grd.addColorStop(0.55, "rgba(255,45,138,0.16)");
    grd.addColorStop(0.8, "rgba(255,200,230,0.32)");
    grd.addColorStop(1, "rgba(230, 200, 220, 0.5)");
    platePath();
    g.fillStyle = grd;
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = Math.max(2, w * 0.016);
    g.stroke();
    /* reflexo diagonal */
    g.save();
    platePath();
    g.clip();
    g.translate(x + pw * (0.15 + 0.05 * Math.sin(t)), y);
    g.rotate(-0.45);
    var shine = g.createLinearGradient(0, 0, w * 0.18, 0);
    shine.addColorStop(0, "rgba(255,255,255,0)");
    shine.addColorStop(0.45, "rgba(255,255,255,0.7)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = shine;
    g.fillRect(-w * 0.1, -h, w * 0.2, h * 3);
    g.restore();
    /* brilhos */
    drawSparkle(g, p2[0] - pw * 0.08, p2[1] + ph * 0.14, Math.min(w, h) * 0.08, "#fff");
    drawSparkle(g, p4[0] + pw * 0.16, p4[1] - ph * 0.16, Math.min(w, h) * 0.05, "#ffe0f0");
    drawSparkle(g, p3[0] - pw * 0.14, p3[1] - ph * 0.12, Math.min(w, h) * 0.045, "#fff");
    g.restore();
  }

  function drawThumbsUp(g, w, h) {
    var s = Math.min(w, h);
    g.save();
    g.translate(w * 0.5, h * 0.56);
    g.scale(s * 0.01, s * 0.01);
    /* luva branquinha, no jeitinho das mãos dele */
    g.fillStyle = "#f6f6f8";
    g.strokeStyle = "#c2185b";
    g.lineWidth = 2.2;
    /* punho */
    roundedRect(g, -14, 4, 28, 22, 8);
    g.fill();
    g.stroke();
    /* palma */
    roundedRect(g, -16, -10, 32, 22, 10);
    g.fill();
    g.stroke();
    /* polegares */
    g.beginPath();
    g.ellipse(-4, -22, 8, 14, -0.15, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    /* brilhinho */
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.beginPath();
    g.ellipse(-8, -6, 5, 3, -0.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawExtraBlush(g, w, h) {
    /* blush extra, por cima da cara aprovada, nas bochechas */
    var spots = [
      { x: w * 0.18, y: h * 0.72, rx: w * 0.14, ry: h * 0.1 },
      { x: w * 0.82, y: h * 0.72, rx: w * 0.14, ry: h * 0.1 }
    ];
    g.save();
    spots.forEach(function (s) {
      var grd = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.rx);
      grd.addColorStop(0, "rgba(255,45,138,0.72)");
      grd.addColorStop(0.55, "rgba(255,45,138,0.35)");
      grd.addColorStop(1, "rgba(255,45,138,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
      g.fill();
    });
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
      /* fallback na tela; o zzz visível de verdade flutua no DOM (.cs-zeds) */
      drawFacePhoto(ctx, w, h, faceArt.blink, null);
    } else if (kind === "oba") {
      textFace(ctx, w, h, ["Oba!"], "#fff");
      drawHeart(ctx, w * 0.78, h * 0.28, Math.min(w, h) * 0.012, "#ff2d8a");
    } else if (kind === "led") {
      drawLedBar(ctx, w, h);
    } else if (kind === "acrylic") {
      drawAcrylic(ctx, w, h);
    } else if (kind === "copied") {
      drawThumbsUp(ctx, w, h);
    } else if (kind === "shy") {
      drawFacePhoto(ctx, w, h, faceArt.smile, eye);
      drawExtraBlush(ctx, w, h);
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
  function placeBalao() {
    if (!balao || !root) return;
    balao.classList.remove("cs-flip", "cs-acima");
    balao.style.transform = "";
    var r = balao.getBoundingClientRect();
    var view = viewBox();
    var sticky = topStickyBottom();
    if (r.left < view.left + 8) {
      balao.classList.add("cs-flip");
      r = balao.getBoundingClientRect();
      if (r.right > view.left + view.w - 8) {
        balao.classList.remove("cs-flip");
      }
    }
    r = balao.getBoundingClientRect();
    var dx = 0, dy = 0;
    if (r.left < view.left + 8) dx += (view.left + 8) - r.left;
    if (r.right > view.left + view.w - 8) dx += (view.left + view.w - 8) - r.right;
    if (r.top < sticky + 8) dy += (sticky + 8) - r.top;
    if (r.bottom > view.top + view.h - 8) dy -= r.bottom - (view.top + view.h - 8);
    if (dx || dy) balao.style.transform = "translate(" + dx + "px," + dy + "px)";
  }

  function showBalao(text, variant, ms) {
    if (!balao) return;
    balao.textContent = text;
    balao.classList.toggle("cs-balao-welcome", variant === "welcome");
    balao.classList.remove("cs-flip", "cs-acima");
    balao.classList.add("cs-show");
    balao.hidden = false;
    later(function () { placeBalao(); }, 0);
    later(hideBalao, ms);
  }
  function hideBalao() {
    if (!balao) return;
    balao.classList.remove("cs-show", "cs-balao-welcome", "cs-flip", "cs-acima");
    balao.style.transform = "";
    later(function () {
      if (!balao.classList.contains("cs-show")) {
        balao.hidden = true;
      }
    }, 280);
  }

  function clampZeds() {
    if (!root) return;
    var box = root.querySelector(".cs-zeds");
    if (!box) return;
    var sticky = topStickyBottom();
    var rr = root.getBoundingClientRect();
    var startY = rr.top + rr.height * 0.28;
    var roomUp = startY - (sticky + 10);
    var letter = isMobile() ? 36 : 44;
    var cap = isMobile() ? 6 : 22;
    var maxUp = Math.max(0, Math.min(cap, roomUp - letter));
    box.style.setProperty("--zed-up", (-maxUp) + "px");
    var side = isMobile() ? 44 : 16;
    box.style.setProperty("--zed-side", (-side) + "px");
    box.classList.toggle("cs-zeds-side", isMobile() || maxUp < 10);
    /* também evita o botão Pedir: se algum Z cruzar, empurra mais pra esquerda e menos pra cima */
    var pedir = document.querySelector('header a[href*="wa.me"], header a[href*="whatsapp"], a[data-voice="pedir-topo"]');
    if (!pedir) {
      var links = document.querySelectorAll("header a, header button");
      for (var i = 0; i < links.length; i++) {
        if (/pedir/i.test((links[i].textContent || "") + " " + (links[i].getAttribute("aria-label") || ""))) {
          pedir = links[i];
          break;
        }
      }
    }
    if (pedir) {
      var pr = pedir.getBoundingClientRect();
      var zx = rr.left + rr.width * 0.15;
      var zy = startY - maxUp;
      if (zy < pr.bottom + 8 && zx > pr.left - 24 && zx < pr.right + 24) {
        box.style.setProperty("--zed-up", "0px");
        box.style.setProperty("--zed-side", isMobile() ? "-48px" : "-28px");
        box.classList.add("cs-zeds-side");
      }
    }
  }

  function showZeds(on) {
    if (!root) return;
    var box = root.querySelector(".cs-zeds");
    if (box) box.classList.toggle("cs-on", !!on);
    if (on) clampZeds();
  }

  function clearHearts() {
    if (!root) return;
    var box = root.querySelector(".cs-hearts");
    if (box) box.innerHTML = "";
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
    setPose(restPose());
    showZeds(false);
    if (face !== "zzz") setFace("smile");
    hideBalao();
    if (leds) leds.classList.remove("cs-liga");
    lastInput = Date.now();
    if (pendingQueue.length) {
      later(function () {
        var fn = pendingQueue.shift();
        if (fn) fn();
        else finish(400);
      }, 500);
      return;
    }
    if (demoQueue.length) {
      later(runDemoQueue, 900);
      return;
    }
    firstTourDone = true;
    later(scheduleNext, 22000 + Math.random() * 8000);
  }

  function requestAction(fn, opts) {
    opts = opts || {};
    if (hugging) {
      pendingQueue.push(fn);
      return;
    }
    if (opts.user) {
      if (busy() && state !== "hug") {
        clearTimers();
        hideBalao();
        if (leds) leds.classList.remove("cs-liga");
        state = "idle";
      }
      fn();
      return;
    }
    if (busy() || sleeping) {
      pendingQueue.push(fn);
      return;
    }
    fn();
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
    jump();
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
    setPose("caminha");
    setFace("blink");
    showZeds(true);
    hideBalao();
    if (inner) inner.classList.remove("cs-flutua");
    later(function () { sizeCanvas(); paint(); clampZeds(); }, 0);
  }

  function wake(opts) {
    if (!sleeping && state !== "sleep") return;
    sleeping = false;
    if (state === "sleep") state = "idle";
    showZeds(false);
    setPose(restPose());
    setFace("smile");
    if (inner && !reduced) inner.classList.add("cs-flutua");
    later(function () { sizeCanvas(); paint(); }, 0);
    if (!opts || !opts.silent) later(scheduleNext, 2500);
  }

  function doHug(btn) {
    if (!root || !btn) return;
    /* abraço visual; a abertura do WhatsApp é atrasada no clique (onWaClick) */
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
      updatePlace(true);
      setFace("smile");
      later(function () {
        if (inner) inner.classList.remove("cs-aperto");
        root.style.transition = "none";
        finish(4000);
      }, reduced ? 50 : 420);
    }, 1500);
  }

  /* ---------- horário, datas, acessórios e novas graçinhas ---------- */
  function spNow() {
    var parts = {};
    try {
      var fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: HORARIO.tz,
        weekday: "short",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23"
      });
      fmt.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) {
      var d = new Date();
      return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes(), wd: d.getDay() };
    }
    var wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      y: +parts.year,
      m: +parts.month,
      d: +parts.day,
      h: +parts.hour,
      min: +parts.minute,
      wd: wdMap[parts.weekday] != null ? wdMap[parts.weekday] : new Date().getDay()
    };
  }

  function closedMessage(t) {
    var mins = t.h * 60 + t.min;
    if (t.wd >= 1 && t.wd <= 5 && mins < HORARIO.monFri.start) return "Abro às 9h ❤️";
    if (t.wd === 6 && mins < HORARIO.saturday.start) return "Abro às 9h ❤️";
    if (t.wd >= 1 && t.wd <= 5) return "Volto amanhã ❤️";
    return "Volto segunda ❤️";
  }

  function storeStatus() {
    var dbg = debugFlag;
    if (dbg === "aberto" || dbg === "open") {
      return { open: true, message: "Estamos abertos!", cap: false };
    }
    if (dbg === "fechado" || dbg === "closed" || dbg === "pijama") {
      return { open: false, message: closedMessage(spNow()), cap: true };
    }
    if (!HORARIO.enabled) return { open: null, message: "", cap: false };
    var t = spNow();
    var mins = t.h * 60 + t.min;
    var open = false;
    if (t.wd >= 1 && t.wd <= 5) open = mins >= HORARIO.monFri.start && mins < HORARIO.monFri.end;
    else if (t.wd === 6) open = mins >= HORARIO.saturday.start && mins < HORARIO.saturday.end;
    return { open: open, message: open ? "Estamos abertos!" : closedMessage(t), cap: !open };
  }

  function lastFridayOfNovember(year) {
    var day = 30;
    while (day >= 1) {
      var wd;
      try {
        var iso = year + "-11-" + (day < 10 ? "0" : "") + day + "T12:00:00";
        var fmt = new Intl.DateTimeFormat("en-US", { timeZone: HORARIO.tz, weekday: "short" });
        wd = fmt.format(new Date(iso + "-03:00"));
      } catch (e) {
        wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(year, 10, day).getDay()];
      }
      if (wd === "Fri") return day;
      day -= 1;
    }
    return 29;
  }

  function easterSunday(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 16);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return { m: month, d: day };
  }

  function seasonalHatName() {
    var dbg = debugFlag;
    if (dbg === "blackfriday" || dbg === "bf") return "bf";
    if (dbg === "natal" || dbg === "christmas" || dbg === "papainoel") return "natal";
    if (dbg === "anonovo" || dbg === "reveillon" || dbg === "festa" || dbg === "festah" || dbg === "ano-novo") return "anonovo";
    if (dbg === "pascoa" || dbg === "easter") return "pascoa";
    if (dbg === "criancas" || dbg === "criancas" || dbg === "diadascriancas") return "criancas";
    if (dbg === "caminha" || dbg === "dorme" || dbg === "sleep") return "caminha";
    if (dbg === "fechado" || dbg === "closed" || dbg === "pijama") return "touca";
    if (dbg === "aberto" || dbg === "open") return "";
    var t = spNow();
    /* Natal: 1 a 26 de dezembro */
    if (t.m === 12 && t.d >= 1 && t.d <= 26) return "natal";
    /* Ano-Novo: 27 dez a 2 jan */
    if ((t.m === 12 && t.d >= 27) || (t.m === 1 && t.d <= 2)) return "anonovo";
    /* Semana da Black Friday (segunda a domingo da semana do último Friday de novembro) */
    if (t.m === 11) {
      var bf = lastFridayOfNovember(t.y);
      if (t.d >= bf - 4 && t.d <= bf + 2) return "bf";
    }
    /* Páscoa: da semana santa (domingo de ramos) até a segunda */
    var es = easterSunday(t.y);
    var easterDate = Date.UTC(t.y, es.m - 1, es.d);
    var today = Date.UTC(t.y, t.m - 1, t.d);
    var dayMs = 86400000;
    if (today >= easterDate - 7 * dayMs && today <= easterDate + 1 * dayMs) return "pascoa";
    /* Dia das Crianças (Brasil, 12 de outubro), 11–13 */
    if (t.m === 10 && t.d >= 11 && t.d <= 13) return "criancas";
    return "";
  }

  function applyLook() {
    if (currentHat === "natal") outfit = "natal";
    else if (currentHat === "anonovo" || currentHat === "festa") outfit = "anonovo";
    else if (currentHat === "criancas") outfit = "criancas";
    else if (currentHat === "pascoa") outfit = "pascoa";
    else if (currentHat === "touca" || currentHat === "pijama") outfit = "pijama";
    else outfit = "";
    if (!root) return;
    root.classList.toggle("cs-pijama", outfit === "pijama");
    root.classList.toggle("cs-outfit-natal", outfit === "natal");
    root.classList.toggle("cs-outfit-anonovo", outfit === "anonovo");
    root.classList.toggle("cs-outfit-criancas", outfit === "criancas");
    root.classList.toggle("cs-outfit-pascoa", outfit === "pascoa");
    root.classList.toggle("cs-fechado", outfit === "pijama" && !sleeping);
    $all(".cs-hat", root).forEach(function (img) {
      var h = img.getAttribute("data-hat");
      /* corpos temáticos já trazem o acessório; não empilha o overlay */
      var on = !!currentHat && h === currentHat && !OUTFIT_BODY[currentHat] && h !== "touca" && h !== "pijama" && currentHat !== "caminha";
      img.classList.toggle("cs-on", on);
    });
    if (sleeping) {
      setPose("caminha");
    } else if (!hugging && (pose === "idle" || pose === "pijama" || pose === "natal" || pose === "anonovo" || pose === "criancas" || pose === "pascoa" || pose === "caminha")) {
      setPose(restPose());
    }
    later(function () { sizeCanvas(); paint(); }, 0);
  }

  function setHat(name) {
    currentHat = name || "";
    applyLook();
  }

  function applySeasonalHat() {
    if (hatForced) {
      applyLook();
      return;
    }
    var seasonal = seasonalHatName();
    if (seasonal) currentHat = seasonal;
    else if (storeStatus().cap) currentHat = "touca";
    else currentHat = "";
    applyLook();
  }

  function doHours() {
    if (hugging) return;
    if (busy() && state !== "idle") return;
    clearHearts();
    var st = storeStatus();
    if (st.open == null) {
      finish(200);
      return;
    }
    state = "hours";
    applySeasonalHat();
    if (st.open) {
      setPose(restPose());
      setFace("smile");
      jump();
      showBalao("Estamos abertos!", "hours", isMobile() ? 2600 : 3600);
    } else {
      if (!OUTFIT_BODY[outfit] || outfit === "pijama") setHat("pijama");
      setPose(restPose());
      setFace("blink");
      showBalao(st.message, "hours", isMobile() ? 2800 : 3800);
    }
    later(function () {
      if (outfit !== "pijama") setFace("smile");
      finish(800);
    }, isMobile() ? 3000 : 4000);
  }

  function doLedIcon() {
    if (hugging) return;
    if (busy()) { pendingQueue.push(doLedIcon); return; }
    clearHearts();
    state = "led";
    sleeping = false;
    setPose("idle");
    setFace("led");
    jump();
    later(function () {
      setFace("smile");
      finish(2500);
    }, reduced ? 900 : 1800);
  }

  function doAcrylicIcon() {
    if (hugging) return;
    if (busy()) { pendingQueue.push(doAcrylicIcon); return; }
    clearHearts();
    state = "acrylic";
    sleeping = false;
    setPose("idle");
    setFace("acrylic");
    jump();
    later(function () {
      setFace("smile");
      finish(2500);
    }, reduced ? 900 : 1800);
  }

  function doBye() {
    if (hugging) return;
    if (busy()) { pendingQueue.push(doBye); return; }
    clearHearts();
    state = "bye";
    sleeping = false;
    setPose("acena");
    setFace("smile");
    jump();
    showBalao("Volte sempre!", "bye", isMobile() ? 2400 : 3600);
    later(function () {
      setPose("idle");
      finish(5000);
    }, isMobile() ? 2800 : 4000);
  }

  function spawnHearts() {
    if (!root) return;
    var box = root.querySelector(".cs-hearts");
    if (!box) return;
    box.innerHTML = "";
    var n = reduced ? 3 : 8;
    for (var i = 0; i < n; i++) {
      var p = document.createElement("span");
      p.className = "cs-floheart";
      p.style.left = (30 + Math.random() * 40) + "%";
      p.style.bottom = (30 + Math.random() * 25) + "%";
      p.style.setProperty("--dx", (Math.random() * 70 - 35) + "px");
      p.style.setProperty("--dy", (-50 - Math.random() * 70) + "px");
      p.style.animationDelay = (Math.random() * 0.2) + "s";
      p.style.transform = "rotate(45deg) scale(" + (0.7 + Math.random() * 0.6) + ")";
      box.appendChild(p);
    }
    later(function () { box.innerHTML = ""; }, 1400);
  }

  function doShy() {
    if (hugging) return;
    clearTimers();
    hideBalao();
    if (leds) leds.classList.remove("cs-liga");
    state = "shy";
    sleeping = false;
    setPose("idle");
    setFace("shy");
    jump();
    spawnHearts();
    later(function () { if (!reduced) spawnHearts(); }, 500);
    later(function () {
      setFace("smile");
      finish(3000);
    }, reduced ? 1400 : 2200);
  }

  function doCopied() {
    if (hugging) return;
    clearTimers();
    hideBalao();
    clearHearts();
    if (leds) leds.classList.remove("cs-liga");
    state = "copied";
    sleeping = false;
    setPose("idle");
    setFace("copied");
    jump();
    showBalao("Copiado! 👍", "copied", 1800);
    later(function () {
      setFace("smile");
      finish(3000);
    }, reduced ? 1200 : 2000);
  }

  function watchSections() {
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        if (en.intersectionRatio < 0.28) return;
        var id = en.target && en.target.id;
        if (!id) return;
        var now = Date.now();
        if (sectionSeen[id] && now - sectionSeen[id] < 28000) return;
        sectionSeen[id] = now;
        if (id === "placas") requestAction(doLedIcon);
        else if (id === "acrilicos") requestAction(doAcrylicIcon);
      });
    }, { threshold: [0.3, 0.5] });
    ["placas", "acrilicos"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  function watchBottom() {
    if (!("IntersectionObserver" in window)) return;
    var sent = document.createElement("div");
    sent.id = "cs-fim-pagina";
    sent.setAttribute("aria-hidden", "true");
    sent.style.cssText = "height:1px;width:1px;pointer-events:none;position:relative;";
    var anchor = document.getElementById("cartao");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sent, anchor.nextSibling);
    else if (document.body) document.body.appendChild(sent);
    var io = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      var near = (window.scrollY + window.innerHeight) >= (Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - 200);
      if (!near && window.scrollY < 200) return;
      if (bottomOnce) return;
      bottomOnce = true;
      if (!firstTourDone && (demoQueue.length || busy())) {
        pendingQueue.push(doBye);
        return;
      }
      requestAction(doBye);
    }, { threshold: 0.01, rootMargin: "0px 0px 40px 0px" });
    io.observe(sent);
  }

  function isCopyControl(el) {
    if (!el || !el.closest) return null;
    var b = el.closest("button, [role='button'], a");
    if (!b) return null;
    var t = ((b.getAttribute("data-voice") || "") + " " + (b.textContent || "") + " " + (b.getAttribute("aria-label") || "")).toLowerCase();
    if (t.indexOf("copiar") !== -1 || t.indexOf("copy") !== -1) return b;
    return null;
  }

  function watchCopy() {
    document.addEventListener("copy", function () {
      requestAction(doCopied, { user: true });
    }, { passive: true });
    document.addEventListener("click", function (ev) {
      if (!isCopyControl(ev.target)) return;
      /* passivo: não mexe no clique, só reage um pouquinho depois */
      later(function () { requestAction(doCopied, { user: true }); }, 70);
    }, true);
  }

  function runDemoQueue() {
    if (busy()) return;
    if (sleeping) wake({ silent: true });
    if (!demoQueue.length) {
      firstTourDone = true;
      later(scheduleNext, 22000 + Math.random() * 8000);
      return;
    }
    var name = demoQueue.shift();
    if (name === "hours") doHours();
    else if (name === "faces") doFaces();
    else if (name === "remote") doRemote();
    else if (name === "bubble") doBubble();
    else runDemoQueue();
  }

  function scheduleNext() {
    if (busy()) return;
    later(function pick() {
      if (busy()) {
        later(scheduleNext, 4000);
        return;
      }
      if (sleeping) wake({ silent: true });
      var acts = [doFaces, doRemote, doBubble];
      var fn = acts[repeatIdx % acts.length];
      repeatIdx += 1;
      fn();
    }, 20000 + Math.random() * 10000);
  }

  function tickIdle() {
    if (!firstTourDone || demoQueue.length) {
      /* piscar no sorriso mesmo durante o tour */
    } else if (!sleeping && !busy() && Date.now() - lastInput > IDLE_MS) doSleep();
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

  function isModifiedClick(ev) {
    if (!ev) return false;
    if (ev.button != null && ev.button !== 0) return true;
    return !!(ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey);
  }

  function openWaHref(href, win) {
    try {
      if (win && !win.closed) {
        win.location.href = href;
        return true;
      }
    } catch (e) {}
    try {
      var w2 = window.open(href, "_blank");
      if (w2) return true;
    } catch (e2) {}
    try { window.location.href = href; return true; } catch (e3) {}
    return false;
  }

  function onWaClick(ev) {
    var a = isWaLink(ev.target);
    if (!a || !a.href) return;
    if (ev.defaultPrevented) return;
    if (isModifiedClick(ev)) return;
    markInput();
    var href = a.href;
    /* reduced-motion: não atrasa a abertura; o abraço ainda pode aparecer se o link for _blank */
    if (reduced) {
      try { doHug(a); } catch (err) {}
      return;
    }
    ev.preventDefault();
    /* abre a aba na hora do clique (síncrono) para o iOS / bloqueador não barrar depois */
    var win = null;
    try { win = window.open("", "_blank"); } catch (err) { win = null; }
    try { doHug(a); } catch (err2) {}
    /* setTimeout próprio: não entra em clearTimers() do abraço / outras ações */
    if (win) {
      try { win.blur(); } catch (e0) {}
      try { window.focus(); } catch (e1) {}
    }
    window.setTimeout(function () { openWaHref(href, win); }, HUG_OPEN_MS);
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
    }, { passive: true, capture: true });
    document.addEventListener("touchmove", function (ev) {
      if (!ev.touches || !ev.touches.length) return;
      pointer.x = ev.touches[0].clientX;
      pointer.y = ev.touches[0].clientY;
      pointer.has = true;
    }, { passive: true });
    document.addEventListener("click", onWaClick, true);
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
        var now = Date.now();
        tapTimes.push(now);
        tapTimes = tapTimes.filter(function (t) { return now - t < 3000; });
        if (tapTimes.length >= 5) {
          tapTimes = [];
          doShy();
          return;
        }
        doStatic();
      });
    }
    if (balao) balao.addEventListener("click", onBalaoClick);
  }

  function startSchedule() {
    /* bem-vindo em todo carregamento, depois o tour (caras, controle+LEDs, balão) ainda nos primeiros 20s */
    demoQueue = ["hours", "faces", "remote", "bubble"];
    firstTourDone = false;
    later(doWelcome, 700);
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

    updatePlace(false);
    later(function () { updatePlace(false); sizeCanvas(); paint(); }, 50);
    later(function () { updatePlace(false); }, 400);
    later(function () { updatePlace(false); }, 1200);

    var logo = document.querySelector("img.logo-glow");
    if (logo) {
      if (!logo.complete) logo.addEventListener("load", function () { updatePlace(false); });
      try {
        var ro = new ResizeObserver(function () { updatePlace(false); });
        ro.observe(logo);
      } catch (e) {}
    }
    /* hidratação do React pode atrasar um pouco a logo */
    var n = 0;
    var hydra = setInterval(function () {
      updatePlace(false);
      n += 1;
      if (n > 20) clearInterval(hydra);
    }, 250);

    bind();
    watchCadastro();
    watchSections();
    watchBottom();
    watchCopy();
    applySeasonalHat();
    if (debugFlag === "caminha" || debugFlag === "dorme" || debugFlag === "sleep") {
      later(function () { doSleep(); }, 200);
    }
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
    place: function () { updatePlace(false); },
    isDocked: function () { return !!docked; },
    setPointer: function (x, y) { pointer.x = x; pointer.y = y; pointer.has = true; eyeLock = null; },
    setFace: function (name) { setFace(name); if (name !== "static") staticUntil = 0; },
    setEye: function (x, y) {
      if (x == null || y == null) { eyeLock = null; return; }
      eyeLock = { x: x, y: y };
      eye.x = x;
      eye.y = y;
    },
    setPose: setPose,
    hours: doHours,
    led: doLedIcon,
    acrylic: doAcrylicIcon,
    bye: doBye,
    shy: doShy,
    copied: doCopied,
    setHat: function (name) { hatForced = !!name; setHat(name || ""); },
    storeStatus: storeStatus,
    debugFlag: function () { return debugFlag; },
    stop: function () {
      clearTimers();
      demoQueue = [];
      pendingQueue = [];
      firstTourDone = true;
      hugging = false;
      sleeping = false;
      state = "idle";
      hideBalao();
      clearHearts();
      showZeds(false);
      if (leds) leds.classList.remove("cs-liga");
      setPose("idle");
      setFace("smile");
      if (inner) { inner.classList.remove("cs-pula"); inner.classList.remove("cs-aperto"); }
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
