/*
 * NovaPlay admin: the design editor (owner, 2026-11-28: "an editor app inside the admin: decide the page's height and edit
 * everything on it freely"). A page (or part of one) is designed like in a phone editor app: a canvas 360 units wide whose height
 * the admin sets (drag the bar under it), with text, pictures, buttons and shapes placed anywhere: drag to move, the handles to
 * resize and turn, a sheet below for fonts, sizes, colours, outline, shadow, corners, fit, see-through and what a tap opens;
 * background colour, colour fade or picture; layers; undo / redo. Saving draws the design as a sharp picture (1080 px wide), in
 * parts at most 2400 px tall one under the other (an older or smaller phone can't draw one very tall picture), and lists the
 * areas that open something when tapped: the app shows the parts full width, one under the other, with those areas on them.
 *
 * On a phone a finger first taps a part to choose it and then drags it (a swipe that starts on a part that isn't chosen scrolls
 * the page, so a long page full of pictures still scrolls); a mouse chooses and drags at once.
 *
 *   NovaDesignEditor.open({ design, title, imageUrl(id), choosePicture() -> File|null, uploadPicture(file) -> picture, bannerPicture(),
 *                           targetOptionsHtml(value) })
 *     -> Promise<{ design, exported: [{ base64, mimeType, width, height, dataUrl }, ...] (top to bottom), links }
 *                | null (closed without saving)>
 */
(function () {
  'use strict';

  var W = 360; // the canvas width in design units (a phone's width); the app scales it to the screen
  var MIN_H = 200;
  var MAX_H = 4000;
  var EXPORT_SCALE = 3; // the saved picture: 1080 px wide
  var PART_PX = 2400; // ... in parts at most this tall
  var FONTS = [
    ['Montserrat', ['400', '600', '700', '800', '900']],
    ['Poppins', ['400', '600', '700', '800']],
    ['Bebas Neue', ['400']],
    ['Anton', ['400']],
    ['Playfair Display', ['700', '900']],
    ['Pacifico', ['400']],
  ];
  var COLORS = ['#FFFFFF', '#000000', '#F0B93D', '#FFD45E', '#E3162C', '#FF5A6A', '#1DB36B', '#4BE39A', '#2F7BFF', '#8CC4FF', '#8B3DFF', '#FF8A00', '#FF4FA3', '#00C2D1', '#170709', '#4A0812', '#0B1E4A', '#2C0F55'];
  var TONES = {
    red: ['#FF6B6B', '#E3162C', '#A1081C', '#C4102A'],
    gold: ['#FFF1B8', '#F2C14E', '#C88A16', '#E0A830'],
    green: ['#6EE7A8', '#1DB36B', '#0B7A45', '#15924F'],
    blue: ['#7DB8FF', '#2F7BFF', '#1446B8', '#2160D8'],
    purple: ['#C99BFF', '#8B3DFF', '#5A16B0', '#7428D8'],
  };
  var PW_URL = '__url';

  // ---------- small helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function uid() { return 'e' + Math.random().toString(36).slice(2, 9); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function weightOf(el) {
    var f = FONTS.find(function (x) { return x[0] === el.font; }) || FONTS[0];
    return f[1].indexOf(String(el.weight)) >= 0 ? String(el.weight) : f[1][f[1].length - 1];
  }
  // (single quotes round the font's name: this also goes inside style="…" attributes)
  function fontCss(el, scale) { return weightOf(el) + ' ' + (el.size * scale) + "px '" + el.font + "', Montserrat, sans-serif"; }

  // Text is broken into lines here, for the editor and for the picture alike (the same breaks in both).
  var measureCtx = document.createElement('canvas').getContext('2d');
  function layoutText(el) {
    measureCtx.font = fontCss(el, 1);
    var maxW = Math.max(4, el.w);
    var lines = [];
    String(el.text || '').split('\n').forEach(function (para) {
      var words = para.split(' ');
      var line = '';
      words.forEach(function (word) {
        var tryLine = line ? line + ' ' + word : word;
        if (measureCtx.measureText(tryLine).width <= maxW || !line) {
          // a single word wider than the box is cut into pieces
          if (!line && measureCtx.measureText(word).width > maxW) {
            var piece = '';
            for (var k = 0; k < word.length; k++) {
              if (measureCtx.measureText(piece + word[k]).width > maxW && piece) { lines.push(piece); piece = word[k]; } else piece += word[k];
            }
            line = piece;
          } else line = tryLine;
        } else {
          lines.push(line);
          line = word;
          if (measureCtx.measureText(word).width > maxW) {
            var p2 = '';
            for (var j = 0; j < word.length; j++) {
              if (measureCtx.measureText(p2 + word[j]).width > maxW && p2) { lines.push(p2); p2 = word[j]; } else p2 += word[j];
            }
            line = p2;
          }
        }
      });
      lines.push(line);
    });
    var lh = el.size * (el.lineHeight || 1.2);
    return { lines: lines, lineHeight: lh, height: Math.max(1, lines.length) * lh };
  }

  // ---------- the picture of a design (also what the app shows) ----------
  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawImageFit(ctx, img, x, y, w, h, fit) {
    var ir = img.naturalWidth / img.naturalHeight;
    var br = w / h;
    var dw, dh;
    if ((fit === 'contain') === (ir > br)) { dw = w; dh = w / ir; } else { dh = h; dw = h * ir; }
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  function srcOf(opts, id, local) { return local || opts.imageUrl(id); }

  // The picture of the design at `scale` (3: 1080 px wide), or only the part of it from `part.top` (px), `part.height` px tall.
  function renderDesign(design, scale, opts, pics, part) {
    var cw = Math.round(W * scale);
    var ch = Math.round(design.h * scale);
    var cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = part ? part.height : ch;
    var ctx = cv.getContext('2d');
    if (part) ctx.translate(0, -part.top);
    var bg = design.bg || {};
    if (bg.color2) {
      var g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, bg.color || '#170709');
      g.addColorStop(1, bg.color2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = bg.color || '#170709';
    ctx.fillRect(0, 0, cw, ch);
    var bgImg = bg.imageId && pics[bg.imageId];
    if (bgImg) {
      if (bg.fit === 'width') ctx.drawImage(bgImg, 0, 0, cw, cw * bgImg.naturalHeight / bgImg.naturalWidth);
      else drawImageFit(ctx, bgImg, 0, 0, cw, ch, 'cover');
      if (bg.shade) { ctx.fillStyle = 'rgba(12,3,5,' + bg.shade + ')'; ctx.fillRect(0, 0, cw, ch); }
    }
    design.els.forEach(function (el) {
      ctx.save();
      ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
      ctx.translate((el.x + el.w / 2) * scale, (el.y + el.h / 2) * scale);
      ctx.rotate(((el.rot || 0) * Math.PI) / 180);
      var x = (-el.w / 2) * scale, y = (-el.h / 2) * scale, w = el.w * scale, h = el.h * scale;
      if (el.kind === 'shape') {
        if (el.shape === 'circle') { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.closePath(); } else roundRect(ctx, x, y, w, h, (el.radius || 0) * scale);
        if (el.fill && el.fill !== 'transparent') { ctx.fillStyle = el.fill; ctx.fill(); }
        if (el.border && el.borderWidth) { ctx.lineWidth = el.borderWidth * scale; ctx.strokeStyle = el.border; ctx.stroke(); }
      } else if (el.kind === 'image') {
        var img = pics[el.imageId];
        if (img) {
          ctx.save();
          roundRect(ctx, x, y, w, h, (el.radius || 0) * scale);
          ctx.clip();
          drawImageFit(ctx, img, x, y, w, h, el.fit || 'cover');
          ctx.restore();
        }
      } else if (el.kind === 'button') {
        var tone = TONES[el.tone] || TONES.red;
        var rad = (el.radius == null ? 999 : el.radius) * scale;
        roundRect(ctx, x, y, w, h, rad);
        var rim = ctx.createLinearGradient(0, y, 0, y + h);
        rim.addColorStop(0, '#FFE9A8'); rim.addColorStop(0.5, '#E3A92E'); rim.addColorStop(1, '#8F5A0C');
        ctx.fillStyle = rim;
        ctx.fill();
        var inset = 2.2 * scale;
        roundRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(0, rad - inset));
        var face = ctx.createLinearGradient(0, y, 0, y + h);
        face.addColorStop(0, tone[0]); face.addColorStop(0.45, tone[1]); face.addColorStop(0.55, tone[2]); face.addColorStop(1, tone[3]);
        ctx.fillStyle = face;
        ctx.fill();
        ctx.save();
        roundRect(ctx, x + h * 0.3, y + inset + 1, w - h * 0.6, (h - inset * 2) * 0.42, h);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fill();
        ctx.restore();
        var fs = Math.min(h * 0.38, (w * 0.84) / Math.max(1, String(el.label || '').length) * 1.7);
        ctx.font = '900 ' + fs + 'px Montserrat, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = el.tone === 'gold' ? 'rgba(255,246,210,0.7)' : 'rgba(60,0,0,0.75)';
        ctx.shadowBlur = 3 * scale;
        ctx.shadowOffsetY = 1.5 * scale;
        ctx.fillStyle = el.textColor || (el.tone === 'gold' ? '#4A2A00' : '#FFFFFF');
        ctx.fillText(el.label || '', 0, 0, w * 0.9);
      } else if (el.kind === 'text') {
        var lay = layoutText(el);
        ctx.font = fontCss(el, scale);
        ctx.textBaseline = 'middle';
        ctx.textAlign = el.align === 'left' ? 'left' : el.align === 'right' ? 'right' : 'center';
        var tx = el.align === 'left' ? x : el.align === 'right' ? x + w : 0;
        lay.lines.forEach(function (line, i) {
          var ty = y + (i + 0.5) * lay.lineHeight * scale;
          if (el.stroke && el.strokeWidth) {
            ctx.save();
            ctx.lineJoin = 'round';
            ctx.lineWidth = el.strokeWidth * 2 * scale;
            ctx.strokeStyle = el.stroke;
            ctx.strokeText(line, tx, ty);
            ctx.restore();
          }
          if (el.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 5 * scale; ctx.shadowOffsetY = 2 * scale; }
          ctx.fillStyle = el.color || '#FFFFFF';
          ctx.fillText(line, tx, ty);
          ctx.shadowColor = 'transparent';
        });
      }
      ctx.restore();
    });
    return cv;
  }

  // What a tap opens, for the app: each element that opens something, as the box around it (turned boxes included).
  function linksOf(design) {
    return design.els.filter(function (el) { return el.target && el.target !== 'url:'; }).map(function (el) {
      var a = ((el.rot || 0) * Math.PI) / 180;
      var cw2 = (Math.abs(el.w * Math.cos(a)) + Math.abs(el.h * Math.sin(a))) / 2;
      var ch2 = (Math.abs(el.w * Math.sin(a)) + Math.abs(el.h * Math.cos(a))) / 2;
      var cx = el.x + el.w / 2, cy = el.y + el.h / 2;
      var x0 = clamp(cx - cw2, 0, W), y0 = clamp(cy - ch2, 0, design.h), x1 = clamp(cx + cw2, 0, W), y1 = clamp(cy + ch2, 0, design.h);
      return { x: r1(x0), y: r1(y0), w: r1(Math.max(4, x1 - x0)), h: r1(Math.max(4, y1 - y0)), target: el.target, label: el.kind === 'button' ? el.label || '' : el.kind === 'text' ? String(el.text || '').slice(0, 40) : '' };
    }).reverse(); // the topmost first (a tap goes to the element in front)
  }

  // ---------- styles ----------
  var css = '' +
    '.de-root{position:fixed;inset:0;z-index:4000;background:#0b0f0e;display:flex;flex-direction:column;color:#f4f6f5;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}' +
    '.de-top{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.08);background:#101614;flex:none;}' +
    '.de-top .t{flex:1;font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.de-btn{border:1px solid rgba(255,255,255,0.14);background:#18201e;color:#f4f6f5;border-radius:10px;padding:8px 11px;font-size:13px;font-weight:800;cursor:pointer;}' +
    '.de-btn:disabled{opacity:.35;}' +
    '.de-btn.go{background:#22c55e;color:#06210f;border-color:#22c55e;}' +
    '.de-btn.bad{background:#ef4444;color:#fff;border-color:#ef4444;}' +
    '.de-btn.on{border-color:#f0b93d;color:#f0b93d;background:rgba(240,185,61,0.12);}' +
    '.de-stage{flex:1;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 0 30px;background:repeating-conic-gradient(#121816 0% 25%,#0e1412 0% 50%) 50%/22px 22px;}' +
    '.de-wrap{position:relative;margin:0 auto;}' +
    '.de-canvas{position:relative;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.6);touch-action:pan-y;}' +
    '.de-bgpic{position:absolute;left:0;top:0;right:0;background-repeat:no-repeat;pointer-events:none;}' +
    '.de-el{position:absolute;touch-action:pan-y;cursor:move;user-select:none;-webkit-user-select:none;}' +
    '.de-el.on{touch-action:none;}' +
    '.de-el .tx{white-space:pre;pointer-events:none;}' +
    '.de-el .im{width:100%;height:100%;background-repeat:no-repeat;background-position:center;pointer-events:none;}' +
    '.de-el .bt{width:100%;height:100%;border-radius:999px;padding:2.2px;background:linear-gradient(#FFE9A8,#E3A92E,#8F5A0C);box-sizing:border-box;pointer-events:none;}' +
    '.de-el .bt>div{width:100%;height:100%;border-radius:999px;display:flex;align-items:center;justify-content:center;font-family:Montserrat,sans-serif;font-weight:900;white-space:nowrap;overflow:hidden;position:relative;}' +
    '.de-el .sh{width:100%;height:100%;box-sizing:border-box;pointer-events:none;}' +
    '.de-sel{position:absolute;border:1.5px solid #f0b93d;pointer-events:none;box-shadow:0 0 0 1px rgba(0,0,0,0.5);}' +
    '.de-h{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#fff;border:2px solid #f0b93d;pointer-events:auto;touch-action:none;box-shadow:0 1px 4px rgba(0,0,0,0.6);}' +
    '.de-h.side{width:14px;height:26px;margin:-13px 0 0 -7px;border-radius:7px;}' +
    '.de-h.sideh{width:26px;height:14px;margin:-7px 0 0 -13px;border-radius:7px;}' +
    '.de-h.rot{background:#f0b93d;border-color:#fff;}' +
    '.de-rotline{position:absolute;left:50%;top:-30px;height:30px;border-left:1.5px dashed #f0b93d;}' +
    '.de-guide{position:absolute;background:#ff4fa3;pointer-events:none;}' +
    '.de-grip{margin:8px auto 0;display:flex;align-items:center;justify-content:center;gap:8px;height:34px;border-radius:10px;background:#18201e;border:1px dashed rgba(240,185,61,0.7);color:#ffde8c;font-size:12.5px;font-weight:800;touch-action:none;cursor:ns-resize;user-select:none;}' +
    '.de-sheet{flex:none;max-height:46vh;overflow:auto;background:#101614;border-top:1px solid rgba(255,255,255,0.1);padding:10px 12px 14px;}' +
    '.de-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}' +
    '.de-tool{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:#18201e;color:#f4f6f5;font-size:12px;font-weight:700;cursor:pointer;}' +
    '.de-tool b{font-size:19px;line-height:1;color:#f0b93d;}' +
    '.de-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0;}' +
    '.de-row label{font-size:12px;color:#a6b0ae;min-width:64px;}' +
    '.de-lbl{font-size:12px;color:#a6b0ae;margin:10px 0 4px;}' +
    '.de-sheet input[type=text],.de-sheet input[type=number],.de-sheet textarea,.de-sheet select{width:100%;padding:9px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:#18201e;color:#f4f6f5;font-size:14px;font-family:inherit;box-sizing:border-box;}' +
    '.de-sheet textarea{min-height:64px;}' +
    '.de-sheet input[type=range]{flex:1;min-width:120px;accent-color:#f0b93d;}' +
    '.de-sw{width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,0.25);cursor:pointer;padding:0;}' +
    '.de-sw.on{border-color:#f0b93d;box-shadow:0 0 0 2px #f0b93d;}' +
    '.de-sw.none{background:repeating-linear-gradient(45deg,#fff 0 4px,#e33 4px 6px);}' +
    '.de-chip{padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.16);background:transparent;color:#f4f6f5;font-size:12px;font-weight:700;cursor:pointer;}' +
    '.de-chip.on{border-color:#f0b93d;background:rgba(240,185,61,0.14);color:#f0b93d;}' +
    '.de-head{display:flex;align-items:center;gap:6px;margin-bottom:6px;}' +
    '.de-head .n{flex:1;font-weight:800;color:#f0b93d;font-size:13px;letter-spacing:.04em;}' +
    '.de-num{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;}' +
    '.de-num div{font-size:10.5px;color:#a6b0ae;}' +
    '.de-num input{padding:6px !important;font-size:13px !important;}' +
    '.de-layer{display:flex;align-items:center;gap:6px;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);margin-bottom:6px;cursor:pointer;}' +
    '.de-layer.on{border-color:#f0b93d;}' +
    '.de-layer .nm{flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.de-busy{position:absolute;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;z-index:5;}' +
    '.de-hint{font-size:12px;color:#a6b0ae;text-align:center;margin:6px 0 0;}';

  var styleOn = false;
  function addStyle() {
    if (styleOn) return;
    styleOn = true;
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- the editor ----------
  function open(opts) {
    addStyle();
    return new Promise(function (resolveOpen) {
      var design = opts.design ? JSON.parse(JSON.stringify(opts.design)) : { w: W, h: 640, bg: { color: '#170709', color2: null, imageId: null, fit: 'cover', shade: 0 }, els: [] };
      design.w = W;
      design.bg = design.bg || { color: '#170709' };
      var local = {}; // picture id -> a data URL picked in this browser (shows before the server has it)
      var sel = null;
      var sheet = 'tools'; // tools | element | background | height | layers
      var hist = [JSON.stringify(design)];
      var fut = [];
      var dirty = false;
      var scale = 1;

      var root = document.createElement('div');
      root.className = 'de-root';
      root.innerHTML =
        '<div class="de-top"><button class="de-btn" data-a="close">&times; Close</button><div class="t">' + esc(opts.title || 'Design') + '</div>' +
        '<button class="de-btn" data-a="undo" title="Undo">&#8630;</button><button class="de-btn" data-a="redo" title="Redo">&#8631;</button>' +
        '<button class="de-btn go" data-a="save">Save &#10003;</button></div>' +
        '<div class="de-stage"><div class="de-wrap"><div class="de-canvas"></div><div class="de-grip" data-grip>&#8597; Drag to make the page longer or shorter</div></div></div>' +
        '<div class="de-sheet"></div>';
      document.body.appendChild(root);
      document.body.style.overflow = 'hidden';
      var stage = root.querySelector('.de-stage');
      var wrap = root.querySelector('.de-wrap');
      var canvas = root.querySelector('.de-canvas');
      var sheetEl = root.querySelector('.de-sheet');

      function fitScale() {
        // room on both sides of the page: the handles of a part that sticks out past its edge stay on the screen
        var avail = Math.min(stage.clientWidth - 64, 440);
        scale = Math.max(0.6, avail / W);
        wrap.style.width = W * scale + 'px';
      }
      function find(id) { return design.els.find(function (e) { return e.id === id; }); }
      function picSrc(id) { return local[id] || opts.imageUrl(id); }

      // ----- drawing the canvas
      function elHtmlStyle(el) {
        return 'left:' + el.x * scale + 'px;top:' + el.y * scale + 'px;width:' + el.w * scale + 'px;height:' + el.h * scale + 'px;' +
          'transform:rotate(' + (el.rot || 0) + 'deg);opacity:' + (el.opacity == null ? 1 : el.opacity) + ';';
      }
      function elInner(el) {
        if (el.kind === 'text') {
          var lay = layoutText(el);
          el.h = Math.max(8, Math.round(lay.height * 10) / 10);
          var st = 'font:' + fontCss(el, scale) + ';line-height:' + lay.lineHeight * scale + 'px;color:' + (el.color || '#fff') + ';text-align:' + (el.align || 'center') + ';' +
            (el.shadow ? 'text-shadow:0 ' + 2 * scale + 'px ' + 5 * scale + 'px rgba(0,0,0,0.75);' : '') +
            (el.stroke && el.strokeWidth ? '-webkit-text-stroke:' + el.strokeWidth * 2 * scale + 'px ' + el.stroke + ';paint-order:stroke fill;' : '');
          return '<div class="tx" style="' + st + '">' + esc(lay.lines.join('\n')) + '</div>';
        }
        if (el.kind === 'image') {
          return '<div class="im" style="background-image:url(\'' + esc(picSrc(el.imageId)) + '\');background-size:' + (el.fit === 'contain' ? 'contain' : 'cover') + ';border-radius:' + (el.radius || 0) * scale + 'px;"></div>';
        }
        if (el.kind === 'button') {
          var t = TONES[el.tone] || TONES.red;
          var fs = Math.min(el.h * 0.38, (el.w * 0.84) / Math.max(1, String(el.label || '').length) * 1.7) * scale;
          var rad = (el.radius == null ? 999 : el.radius) * scale;
          return '<div class="bt" style="border-radius:' + rad + 'px;"><div style="border-radius:' + Math.max(0, rad - 2) + 'px;background:linear-gradient(' + t[0] + ' 0%,' + t[1] + ' 45%,' + t[2] + ' 55%,' + t[3] + ' 100%);color:' + (el.textColor || (el.tone === 'gold' ? '#4A2A00' : '#FFFFFF')) + ';font-size:' + fs + 'px;text-shadow:0 1.5px 3px rgba(60,0,0,0.6);">' + esc(el.label || '') + '</div></div>';
        }
        if (el.kind === 'shape') {
          return '<div class="sh" style="background:' + (el.fill === 'transparent' || !el.fill ? 'transparent' : el.fill) + ';border-radius:' + (el.shape === 'circle' ? '50%' : (el.radius || 0) * scale + 'px') + ';' +
            (el.border && el.borderWidth ? 'border:' + el.borderWidth * scale + 'px solid ' + el.border + ';' : '') + '"></div>';
        }
        return '';
      }
      function drawCanvas() {
        var bg = design.bg || {};
        canvas.style.width = W * scale + 'px';
        canvas.style.height = design.h * scale + 'px';
        canvas.style.background = bg.color2 ? 'linear-gradient(' + (bg.color || '#170709') + ',' + bg.color2 + ')' : bg.color || '#170709';
        var html = '';
        if (bg.imageId) {
          html += '<div class="de-bgpic" style="background-image:url(\'' + esc(picSrc(bg.imageId)) + '\');' + (bg.fit === 'width' ? 'background-size:100% auto;height:100%;' : 'background-size:cover;background-position:center;height:100%;') + '"></div>' +
            (bg.shade ? '<div class="de-bgpic" style="height:100%;background:rgba(12,3,5,' + bg.shade + ');"></div>' : '');
        }
        design.els.forEach(function (el) {
          html += '<div class="de-el" data-id="' + el.id + '" style="' + elHtmlStyle(el) + '">' + elInner(el) + '</div>';
        });
        canvas.innerHTML = html;
        // text boxes take the height of their lines
        design.els.forEach(function (el) { if (el.kind === 'text') { var n = canvas.querySelector('[data-id="' + el.id + '"]'); if (n) n.style.height = el.h * scale + 'px'; } });
        drawSel();
      }
      function redrawEl(el) {
        var n = canvas.querySelector('[data-id="' + el.id + '"]');
        if (!n) return drawCanvas();
        n.innerHTML = elInner(el);
        n.setAttribute('style', elHtmlStyle(el));
        drawSel();
      }
      function drawSel() {
        var old = wrap.querySelector('.de-sel');
        if (old) old.remove();
        // the chosen part takes a finger's drags (the others let it scroll the page)
        canvas.querySelectorAll('.de-el').forEach(function (n) { n.classList.toggle('on', n.getAttribute('data-id') === sel); });
        var el = sel && find(sel);
        if (!el) return;
        var box = document.createElement('div');
        box.className = 'de-sel';
        box.setAttribute('style', 'left:' + el.x * scale + 'px;top:' + el.y * scale + 'px;width:' + el.w * scale + 'px;height:' + el.h * scale + 'px;transform:rotate(' + (el.rot || 0) + 'deg);');
        var hs = el.kind === 'text' ? ['nw', 'ne', 'sw', 'se', 'e', 'w'] : ['nw', 'ne', 'sw', 'se', 'e', 'w', 's', 'n'];
        var pos = { nw: [0, 0], ne: [1, 0], sw: [0, 1], se: [1, 1], e: [1, 0.5], w: [0, 0.5], s: [0.5, 1], n: [0.5, 0] };
        var h = '<div class="de-rotline"></div><div class="de-h rot" data-h="rot" style="left:50%;top:-30px;"></div>';
        hs.forEach(function (k) {
          var cls = k === 'e' || k === 'w' ? 'de-h side' : k === 's' || k === 'n' ? 'de-h sideh' : 'de-h';
          h += '<div class="' + cls + '" data-h="' + k + '" style="left:' + pos[k][0] * 100 + '%;top:' + pos[k][1] * 100 + '%;"></div>';
        });
        box.innerHTML = h;
        // over the page, not in it (the page hides what sticks out of it; the handles must stay reachable)
        wrap.appendChild(box);
      }

      // ----- history
      function commit() {
        var s = JSON.stringify(design);
        if (hist[hist.length - 1] === s) return;
        hist.push(s);
        if (hist.length > 60) hist.shift();
        fut = [];
        dirty = true;
        updateTop();
      }
      function updateTop() {
        root.querySelector('[data-a="undo"]').disabled = hist.length < 2;
        root.querySelector('[data-a="redo"]').disabled = !fut.length;
      }
      function restore(s) {
        design = JSON.parse(s);
        if (sel && !find(sel)) sel = null;
        if (!sel && sheet === 'element') sheet = 'tools';
        drawCanvas();
        drawSheet();
        updateTop();
      }
      var typingTimer = null;
      function commitSoon() { clearTimeout(typingTimer); typingTimer = setTimeout(commit, 450); }

      // ----- adding things
      function visibleY(h) {
        var top = Math.max(0, (stage.scrollTop - wrap.offsetTop + 40) / scale);
        return clamp(top + 20, 0, Math.max(0, design.h - h));
      }
      function add(el) {
        el.id = uid();
        el.rot = el.rot || 0;
        el.opacity = el.opacity == null ? 1 : el.opacity;
        el.target = el.target || '';
        design.els.push(el);
        sel = el.id;
        sheet = 'element';
        drawCanvas();
        drawSheet();
        commit();
      }
      function addText() {
        add({ kind: 'text', text: 'Your text', font: 'Montserrat', size: 30, weight: '900', color: '#FFD45E', align: 'center', lineHeight: 1.2, shadow: true, stroke: null, strokeWidth: 0, x: 30, y: visibleY(40), w: 300, h: 40 });
        setTimeout(function () { var t = sheetEl.querySelector('[data-p="text"]'); if (t) { t.focus(); t.select(); } }, 60);
      }
      function addPicture(pic) {
        var w = 300, h = Math.round(300 * pic.height / pic.width);
        if (pic.localUrl) local[pic.id] = pic.localUrl;
        add({ kind: 'image', imageId: pic.id, fit: 'cover', radius: 0, x: 30, y: visibleY(h), w: w, h: h });
      }
      function addButton() { add({ kind: 'button', label: 'DEPOSIT NOW', tone: 'red', textColor: '', radius: 999, x: 55, y: visibleY(54), w: 250, h: 54, target: 'Deposit' }); }
      function addShape(shape) {
        var round = shape === 'circle';
        add({ kind: 'shape', shape: shape, fill: round ? '#F0B93D' : '#4A0812', radius: round ? 0 : 18, border: '#F0B93D', borderWidth: 2, x: round ? 120 : 20, y: visibleY(round ? 120 : 160), w: round ? 120 : 320, h: round ? 120 : 160 });
      }

      // ----- the sheet under the canvas
      function swatches(prop, value, withNone) {
        return '<div class="de-row">' + (withNone ? '<button type="button" class="de-sw none' + (!value || value === 'transparent' ? ' on' : '') + '" data-set="' + prop + '" data-v="" title="None"></button>' : '') +
          COLORS.map(function (c) { return '<button type="button" class="de-sw' + (String(value).toLowerCase() === c.toLowerCase() ? ' on' : '') + '" style="background:' + c + ';" data-set="' + prop + '" data-v="' + c + '"></button>'; }).join('') +
          '<input type="color" data-color="' + prop + '" value="' + (/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ffffff') + '" style="width:34px;height:30px;padding:0;border:none;background:none;" title="Any colour" /></div>';
      }
      function chips(prop, items, value) {
        return '<div class="de-row">' + items.map(function (c) { return '<button type="button" class="de-chip' + (String(value) === String(c[0]) ? ' on' : '') + '" data-set="' + prop + '" data-v="' + c[0] + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>';
      }
      function slider(prop, label, value, min, max, step) {
        return '<div class="de-row"><label>' + esc(label) + '</label><input type="range" data-range="' + prop + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + value + '" /><span data-show="' + prop + '" style="min-width:34px;text-align:right;font-size:12px;">' + value + '</span></div>';
      }
      function targetHtml(value) {
        var isUrl = value && value.indexOf('url:') === 0;
        var o = opts.targetOptionsHtml(isUrl ? '' : value || '');
        o = o.replace('<option value="">Opens: nothing</option>', '<option value="">Opens: nothing</option><option value="' + PW_URL + '"' + (isUrl ? ' selected' : '') + '>Opens a website link (Telegram, WhatsApp…)</option>');
        return '<select data-target>' + o + '</select>' + (isUrl ? '<input type="text" data-url placeholder="https://t.me/your_channel" value="' + esc(value.slice(4)) + '" style="margin-top:6px;" />' : '');
      }
      function nameOf(el) {
        if (el.kind === 'text') return 'Text: ' + String(el.text || '').split('\n')[0].slice(0, 24);
        if (el.kind === 'button') return 'Button: ' + (el.label || '');
        if (el.kind === 'image') return 'Picture';
        return el.shape === 'circle' ? 'Circle' : 'Box';
      }
      function drawSheet() {
        var el = sel && find(sel);
        if (sheet === 'element' && !el) sheet = 'tools';
        var h = '';
        if (sheet === 'tools') {
          h = '<div class="de-tools">' +
            '<button class="de-tool" data-a="addText"><b>T</b>Text</button>' +
            '<button class="de-tool" data-a="addPicture"><b>&#128444;</b>Picture</button>' +
            '<button class="de-tool" data-a="addButton"><b>&#9654;</b>Button</button>' +
            '<button class="de-tool" data-a="addBox"><b>&#9632;</b>Box</button>' +
            '<button class="de-tool" data-a="addCircle"><b>&#9679;</b>Circle</button>' +
            (opts.bannerPicture ? '<button class="de-tool" data-a="addBanner"><b>&#127915;</b>Banner picture</button>' : '') +
            '<button class="de-tool" data-a="sheet:background"><b>&#127912;</b>Background</button>' +
            '<button class="de-tool" data-a="sheet:height"><b>&#8597;</b>Page height</button>' +
            '<button class="de-tool" data-a="sheet:layers"><b>&#9776;</b>Layers</button>' +
            '</div><div class="de-hint">Tap a part of the page to choose it and change it, then drag it to move it: the round handles resize it, the top one turns it.</div>';
        } else if (sheet === 'background') {
          var bg = design.bg;
          h = '<div class="de-head"><span class="n">BACKGROUND</span><button class="de-btn" data-a="sheet:tools">&#10003; Done</button></div>' +
            '<div class="de-lbl">Colour</div>' + swatches('bg.color', bg.color) +
            '<div class="de-lbl">Fade into a second colour at the bottom (optional)</div>' + swatches('bg.color2', bg.color2, true) +
            '<div class="de-lbl">Background picture</div><div class="de-row"><button class="de-btn" data-a="bgPicture">' + (bg.imageId ? 'Change picture' : '+ Picture') + '</button>' + (bg.imageId ? '<button class="de-btn bad" data-a="bgRemove">Remove</button>' : '') + '</div>' +
            (bg.imageId ? chips('bg.fit', [['cover', 'Fill the page'], ['width', 'Full width, at the top']], bg.fit || 'cover') + slider('bg.shade', 'Darken', bg.shade || 0, 0, 0.8, 0.05) : '');
        } else if (sheet === 'height') {
          h = '<div class="de-head"><span class="n">PAGE HEIGHT</span><button class="de-btn" data-a="sheet:tools">&#10003; Done</button></div>' +
            slider('h', 'Height', design.h, MIN_H, MAX_H, 10) +
            '<div class="de-row"><button class="de-btn" data-a="h:-640">&minus; 1 screen</button><button class="de-btn" data-a="h:640">+ 1 screen</button><button class="de-btn" data-a="h:fit">Fit to what is on it</button></div>' +
            '<div class="de-hint">One phone screen is about 640. You can also drag the bar under the page.</div>';
        } else if (sheet === 'layers') {
          h = '<div class="de-head"><span class="n">LAYERS (front first)</span><button class="de-btn" data-a="sheet:tools">&#10003; Done</button></div>' +
            (design.els.length ? design.els.slice().reverse().map(function (x) {
              return '<div class="de-layer' + (x.id === sel ? ' on' : '') + '" data-layer="' + x.id + '"><span class="nm">' + esc(nameOf(x)) + '</span>' +
                '<button class="de-btn" data-a="fwd" data-id="' + x.id + '">&uarr;</button><button class="de-btn" data-a="back" data-id="' + x.id + '">&darr;</button></div>';
            }).join('') : '<div class="de-hint">Nothing on the page yet.</div>');
        } else if (el) {
          h = '<div class="de-head"><span class="n">' + esc(nameOf(el).split(':')[0].toUpperCase()) + '</span>' +
            '<button class="de-btn" data-a="dup" title="Duplicate">&#10697;</button><button class="de-btn" data-a="fwd" data-id="' + el.id + '" title="Bring forward">&uarr;</button>' +
            '<button class="de-btn" data-a="back" data-id="' + el.id + '" title="Send back">&darr;</button><button class="de-btn bad" data-a="del" title="Delete">&#128465;</button>' +
            '<button class="de-btn go" data-a="deselect">&#10003;</button></div>';
          if (el.kind === 'text') {
            h += '<textarea data-p="text" placeholder="Write here">' + esc(el.text) + '</textarea>' +
              '<div class="de-lbl">Font</div><div class="de-row"><select data-sel="font">' + FONTS.map(function (f) { return '<option' + (f[0] === el.font ? ' selected' : '') + ' style="font-family:\'' + f[0] + '\'">' + f[0] + '</option>'; }).join('') + '</select></div>' +
              slider('size', 'Size', el.size, 8, 160, 1) +
              '<div class="de-lbl">Colour</div>' + swatches('color', el.color) +
              chips('weight', [['400', 'Normal'], ['700', 'Bold'], ['900', 'Extra bold']], el.weight) +
              chips('align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], el.align) +
              chips('shadow', [['true', 'Shadow on'], ['false', 'No shadow']], String(!!el.shadow)) +
              '<div class="de-lbl">Outline</div>' + swatches('stroke', el.stroke, true) + (el.stroke ? slider('strokeWidth', 'Outline', el.strokeWidth || 0, 0, 10, 0.5) : '') +
              slider('lineHeight', 'Line gap', el.lineHeight || 1.2, 0.8, 2.5, 0.05);
          } else if (el.kind === 'image') {
            h += '<div class="de-row"><button class="de-btn" data-a="replacePic">Change picture</button></div>' +
              chips('fit', [['cover', 'Fill the box'], ['contain', 'Show all of it']], el.fit || 'cover') +
              slider('radius', 'Corners', el.radius || 0, 0, 200, 1);
          } else if (el.kind === 'button') {
            h += '<input type="text" data-p="label" maxlength="30" value="' + esc(el.label) + '" placeholder="Button text" />' +
              '<div class="de-lbl">Colour</div>' + chips('tone', [['red', 'Red'], ['gold', 'Gold'], ['green', 'Green'], ['blue', 'Blue'], ['purple', 'Purple']], el.tone) +
              '<div class="de-lbl">Text colour</div>' + swatches('textColor', el.textColor, true) +
              slider('radius', 'Corners', el.radius == null ? 999 : Math.min(el.radius, 60), 0, 60, 1);
          } else if (el.kind === 'shape') {
            h += '<div class="de-lbl">Fill</div>' + swatches('fill', el.fill, true) +
              '<div class="de-lbl">Border</div>' + swatches('border', el.border, true) + slider('borderWidth', 'Border', el.borderWidth || 0, 0, 20, 0.5) +
              (el.shape === 'circle' ? '' : slider('radius', 'Corners', el.radius || 0, 0, 200, 1));
          }
          h += slider('opacity', 'See-through', Math.round((el.opacity == null ? 1 : el.opacity) * 100) / 100, 0.1, 1, 0.05) +
            '<div class="de-lbl">' + (el.kind === 'button' ? 'Tapping the button opens' : 'Tapping it opens (optional)') + '</div>' + targetHtml(el.target) +
            '<div class="de-lbl">Exact place and size</div><div class="de-num">' +
            [['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height'], ['rot', 'Turn°']].map(function (k) {
              return '<div>' + k[1] + '<input type="number" data-num="' + k[0] + '" value="' + Math.round(el[k[0]] || 0) + '"' + (el.kind === 'text' && k[0] === 'h' ? ' disabled' : '') + ' /></div>';
            }).join('') + '</div>';
        }
        sheetEl.innerHTML = h;
      }

      // ----- the sheet's controls
      function setProp(el, prop, v) {
        if (prop.indexOf('bg.') === 0) {
          var k = prop.slice(3);
          design.bg[k] = k === 'shade' ? Number(v) : v || null;
          if (k === 'color' && !v) design.bg.color = '#170709';
          drawCanvas();
          return;
        }
        if (prop === 'h') { design.h = clamp(Math.round(Number(v)), MIN_H, MAX_H); drawCanvas(); return; }
        if (!el) return;
        if (['size', 'radius', 'strokeWidth', 'lineHeight', 'opacity', 'borderWidth'].indexOf(prop) >= 0) el[prop] = Number(v);
        else if (prop === 'shadow') el.shadow = v === 'true';
        else el[prop] = v === '' && (prop === 'stroke' || prop === 'textColor' || prop === 'border' || prop === 'fill') ? (prop === 'fill' ? 'transparent' : null) : v;
        if (prop === 'stroke' && v && !el.strokeWidth) el.strokeWidth = 1.5;
        redrawEl(el);
      }
      sheetEl.addEventListener('click', function (ev) {
        var b = ev.target.closest('button');
        if (!b) {
          var layer = ev.target.closest('[data-layer]');
          if (layer) { sel = layer.getAttribute('data-layer'); sheet = 'element'; drawSel(); drawSheet(); }
          return;
        }
        var el = sel && find(sel);
        if (b.hasAttribute('data-set')) {
          setProp(el, b.getAttribute('data-set'), b.getAttribute('data-v'));
          commit();
          drawSheet();
          return;
        }
        var a = b.getAttribute('data-a');
        if (a) action(a, b);
      });
      sheetEl.addEventListener('input', function (ev) {
        var t = ev.target;
        var el = sel && find(sel);
        if (t.hasAttribute('data-p') && el) { el[t.getAttribute('data-p')] = t.value; redrawEl(el); commitSoon(); return; }
        if (t.hasAttribute('data-range')) {
          var p = t.getAttribute('data-range');
          setProp(el, p, t.value);
          var show = sheetEl.querySelector('[data-show="' + p + '"]');
          if (show) show.textContent = t.value;
          commitSoon();
          return;
        }
        if (t.hasAttribute('data-color')) { setProp(el, t.getAttribute('data-color'), t.value); commitSoon(); return; }
        if (t.hasAttribute('data-url') && el) { el.target = 'url:' + t.value.trim(); commitSoon(); return; }
        if (t.hasAttribute('data-num') && el) {
          var k = t.getAttribute('data-num');
          var n = Number(t.value);
          if (!isFinite(n)) return;
          if (k === 'w') el.w = clamp(n, 8, 2000); else if (k === 'h') el.h = clamp(n, 8, 8000); else el[k] = n;
          redrawEl(el);
          commitSoon();
        }
      });
      sheetEl.addEventListener('change', function (ev) {
        var t = ev.target;
        var el = sel && find(sel);
        if (t.hasAttribute('data-sel') && el) { el[t.getAttribute('data-sel')] = t.value; redrawEl(el); commit(); return; }
        if (t.hasAttribute('data-target') && el) { el.target = t.value === PW_URL ? 'url:' : t.value; commit(); drawSheet(); }
        if (t.hasAttribute('data-range') || t.hasAttribute('data-color')) { commit(); drawSheet(); }
      });

      function action(a, b) {
        var el = sel && find(sel);
        if (a === 'close') return close(false);
        if (a === 'save') return save();
        if (a === 'undo' && hist.length > 1) { fut.push(hist.pop()); return restore(hist[hist.length - 1]); }
        if (a === 'redo' && fut.length) { var s = fut.pop(); hist.push(s); return restore(s); }
        if (a.indexOf('sheet:') === 0) { sheet = a.slice(6); if (sheet !== 'element') { sel = null; drawSel(); } return drawSheet(); }
        if (a === 'addText') return addText();
        if (a === 'addButton') return addButton();
        if (a === 'addBox') return addShape('rect');
        if (a === 'addCircle') return addShape('circle');
        if (a === 'addPicture' || a === 'replacePic' || a === 'bgPicture' || a === 'addBanner') {
          var got = a === 'addBanner'
            ? (busy('Adding the banner picture…'), Promise.resolve(opts.bannerPicture()))
            : Promise.resolve(opts.choosePicture()).then(function (file) {
              if (!file) return null;
              busy('Adding the picture…');
              return opts.uploadPicture(file);
            });
          return got.then(function (pic) {
            busy(null);
            if (!pic) return;
            if (pic.localUrl) local[pic.id] = pic.localUrl;
            if (a === 'bgPicture') { design.bg.imageId = pic.id; design.bg.fit = design.bg.fit || 'cover'; drawCanvas(); commit(); return drawSheet(); }
            if (a === 'replacePic' && el) {
              el.imageId = pic.id;
              el.h = Math.round(el.w * pic.height / pic.width);
              redrawEl(el); commit(); return drawSheet();
            }
            addPicture(pic);
          }).catch(function (err) { busy(null); dialog(err && err.message ? err.message : 'Could not add the picture.', false); });
        }
        if (a === 'bgRemove') { design.bg.imageId = null; drawCanvas(); commit(); return drawSheet(); }
        if (a.indexOf('h:') === 0) {
          var v = a.slice(2);
          if (v === 'fit') {
            var bottom = design.els.reduce(function (m, e) { return Math.max(m, e.y + e.h); }, 0);
            design.h = clamp(Math.ceil(bottom + 24), MIN_H, MAX_H);
          } else design.h = clamp(design.h + Number(v), MIN_H, MAX_H);
          drawCanvas(); commit(); return drawSheet();
        }
        if (a === 'deselect') { sel = null; sheet = 'tools'; drawSel(); return drawSheet(); }
        if (a === 'del' && el) { design.els = design.els.filter(function (x) { return x !== el; }); sel = null; sheet = 'tools'; drawCanvas(); commit(); return drawSheet(); }
        if (a === 'dup' && el) {
          var c = JSON.parse(JSON.stringify(el));
          c.id = uid(); c.x = clamp(el.x + 14, -c.w + 20, W - 20); c.y = el.y + 14;
          design.els.splice(design.els.indexOf(el) + 1, 0, c);
          sel = c.id; drawCanvas(); commit(); return drawSheet();
        }
        if (a === 'fwd' || a === 'back') {
          var x = find(b.getAttribute('data-id'));
          var i = design.els.indexOf(x), j = a === 'fwd' ? i + 1 : i - 1;
          if (i < 0 || j < 0 || j >= design.els.length) return;
          design.els.splice(i, 1);
          design.els.splice(j, 0, x);
          drawCanvas(); commit(); return drawSheet();
        }
      }
      root.querySelector('.de-top').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) action(b.getAttribute('data-a'), b); });

      // ----- dragging: move, resize, turn, the page height
      var drag = null;
      var SNAP = 6;
      function pt(ev) {
        var r = canvas.getBoundingClientRect();
        return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale };
      }
      function guides(list) {
        canvas.querySelectorAll('.de-guide').forEach(function (g) { g.remove(); });
        (list || []).forEach(function (g) {
          var d = document.createElement('div');
          d.className = 'de-guide';
          d.setAttribute('style', g.v ? 'left:' + g.v * scale + 'px;top:0;bottom:0;width:1px;' : 'top:' + g.h * scale + 'px;left:0;right:0;height:1px;');
          canvas.appendChild(d);
        });
      }
      wrap.addEventListener('pointerdown', function (ev) {
        if (ev.target.closest('[data-grip]')) return;
        var handle = ev.target.closest('.de-h');
        var node = ev.target.closest('.de-el');
        if (handle && sel) {
          var el = find(sel);
          ev.preventDefault();
          wrap.setPointerCapture(ev.pointerId);
          drag = { kind: handle.getAttribute('data-h'), el: el, start: pt(ev), orig: JSON.parse(JSON.stringify(el)), id: ev.pointerId };
          return;
        }
        var id = node ? node.getAttribute('data-id') : null;
        if (ev.pointerType !== 'mouse' && sel !== id) {
          // a finger on a part that isn't chosen, or on the empty page: a tap chooses it (or lets go), a swipe scrolls the page
          tap = { id: id, x: ev.clientX, y: ev.clientY, pid: ev.pointerId };
          return;
        }
        if (node) {
          ev.preventDefault();
          if (sel !== id) { sel = id; sheet = 'element'; drawSel(); drawSheet(); }
          var e2 = find(id);
          wrap.setPointerCapture(ev.pointerId);
          drag = { kind: 'move', el: e2, start: pt(ev), orig: JSON.parse(JSON.stringify(e2)), id: ev.pointerId, moved: false };
          return;
        }
        // the empty page (mouse): let go of the selection
        if (sel) { sel = null; if (sheet === 'element') sheet = 'tools'; drawSel(); drawSheet(); }
      });
      var tap = null;
      function choose(id) {
        sel = id && find(id) ? id : null;
        if (sel) sheet = 'element';
        else if (sheet === 'element') sheet = 'tools';
        drawSel();
        drawSheet();
      }
      wrap.addEventListener('pointermove', function (ev) {
        if (tap && ev.pointerId === tap.pid && Math.abs(ev.clientX - tap.x) + Math.abs(ev.clientY - tap.y) > 10) tap = null;
        if (!drag || ev.pointerId !== drag.id) return;
        var p = pt(ev);
        var el = drag.el, o = drag.orig;
        var dx = p.x - drag.start.x, dy = p.y - drag.start.y;
        if (drag.kind === 'move') {
          if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 1.5) return;
          drag.moved = true;
          var nx = o.x + dx, ny = o.y + dy, g = [];
          var cx = nx + o.w / 2, cy = ny + o.h / 2;
          if (Math.abs(cx - W / 2) < SNAP) { nx = W / 2 - o.w / 2; g.push({ v: W / 2 }); }
          if (Math.abs(nx) < SNAP) { nx = 0; g.push({ v: 0.5 }); }
          if (Math.abs(nx + o.w - W) < SNAP) { nx = W - o.w; g.push({ v: W - 0.5 }); }
          if (Math.abs(cy - design.h / 2) < SNAP) { ny = design.h / 2 - o.h / 2; g.push({ h: design.h / 2 }); }
          el.x = Math.round(nx * 10) / 10;
          el.y = Math.round(ny * 10) / 10;
          guides(g);
          redrawEl(el);
          return;
        }
        if (drag.kind === 'rot') {
          var c = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
          var ang = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
          var snapTo = Math.round(ang / 45) * 45;
          if (Math.abs(ang - snapTo) < 4) ang = snapTo;
          ang = ((ang % 360) + 540) % 360 - 180;
          el.rot = Math.round(ang);
          redrawEl(el);
          return;
        }
        // resize: in the element's own (turned) axes, the opposite corner / side stays where it is
        var th = ((o.rot || 0) * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th);
        var hx = { nw: -1, ne: 1, sw: -1, se: 1, e: 1, w: -1, n: 0, s: 0 }[drag.kind];
        var hy = { nw: -1, ne: -1, sw: 1, se: 1, e: 0, w: 0, n: -1, s: 1 }[drag.kind];
        var ocx = o.x + o.w / 2, ocy = o.y + o.h / 2;
        // the anchor: opposite handle, in canvas units
        var ax = ocx + (-hx * o.w / 2) * cs - (-hy * o.h / 2) * sn;
        var ay = ocy + (-hx * o.w / 2) * sn + (-hy * o.h / 2) * cs;
        // the pointer, in the element's axes, from the anchor
        var lx = (p.x - ax) * cs + (p.y - ay) * sn;
        var ly = -(p.x - ax) * sn + (p.y - ay) * cs;
        var nw = hx ? Math.max(12, lx * hx) : o.w;
        var nh = hy ? Math.max(12, ly * hy) : o.h;
        var corner = hx && hy;
        if (el.kind === 'text') {
          if (corner) { var k = Math.max(0.1, nw / o.w); el.size = clamp(Math.round(o.size * k * 2) / 2, 6, 300); nw = o.w * k; }
          el.w = Math.round(nw * 10) / 10;
          layoutText(el);
          nh = layoutText(el).height;
        } else if (corner && (el.kind === 'image' || el.shape === 'circle')) {
          // pictures and circles keep their shape from the corners
          var k2 = Math.max(nw / o.w, nh / o.h);
          nw = o.w * k2;
          nh = o.h * k2;
        }
        el.w = Math.round(nw * 10) / 10;
        el.h = Math.round(nh * 10) / 10;
        // the new centre: from the anchor, half the new size along the element's turned axes
        var mx = hx * el.w / 2, my = hy * el.h / 2;
        var ncx = ax + mx * cs - my * sn;
        var ncy = ay + mx * sn + my * cs;
        el.x = Math.round((ncx - el.w / 2) * 10) / 10;
        el.y = Math.round((ncy - el.h / 2) * 10) / 10;
        redrawEl(el);
      });
      function endDrag(ev) {
        if (tap && ev && ev.pointerId === tap.pid) {
          var t = tap;
          tap = null;
          if (ev.type === 'pointerup') choose(t.id);
        }
        if (!drag || (ev && ev.pointerId !== drag.id)) return;
        var was = drag;
        drag = null;
        guides(null);
        if (was.kind !== 'move' || was.moved) { commit(); drawSheet(); }
      }
      wrap.addEventListener('pointerup', endDrag);
      wrap.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('dblclick', function (ev) {
        var node = ev.target.closest('.de-el');
        if (!node) return;
        var el = find(node.getAttribute('data-id'));
        if (el && el.kind === 'text') { var t = sheetEl.querySelector('[data-p="text"]'); if (t) { t.focus(); t.select(); } }
      });
      // the bar under the page: drag to change the page's height
      var grip = root.querySelector('[data-grip]');
      var gripDrag = null;
      grip.addEventListener('pointerdown', function (ev) { ev.preventDefault(); grip.setPointerCapture(ev.pointerId); gripDrag = { y: ev.clientY, h: design.h, id: ev.pointerId }; });
      grip.addEventListener('pointermove', function (ev) {
        if (!gripDrag || ev.pointerId !== gripDrag.id) return;
        design.h = clamp(Math.round(gripDrag.h + (ev.clientY - gripDrag.y) / scale), MIN_H, MAX_H);
        canvas.style.height = design.h * scale + 'px';
        if (sheet === 'height') { var r = sheetEl.querySelector('[data-range="h"]'); if (r) r.value = design.h; var s = sheetEl.querySelector('[data-show="h"]'); if (s) s.textContent = design.h; }
      });
      function endGrip() { if (!gripDrag) return; gripDrag = null; drawCanvas(); commit(); }
      grip.addEventListener('pointerup', endGrip);
      grip.addEventListener('pointercancel', endGrip);

      // keys on a computer: Delete, arrows, undo / redo
      function onKey(ev) {
        var typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !typing) { ev.preventDefault(); return action(ev.shiftKey ? 'redo' : 'undo'); }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y' && !typing) { ev.preventDefault(); return action('redo'); }
        var el = sel && find(sel);
        if (!el || typing) return;
        if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); return action('del'); }
        var step = ev.shiftKey ? 10 : 1;
        var moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[ev.key]) { ev.preventDefault(); el.x += moves[ev.key][0]; el.y += moves[ev.key][1]; redrawEl(el); commitSoon(); }
      }
      document.addEventListener('keydown', onKey);
      function onResize() { fitScale(); drawCanvas(); }
      window.addEventListener('resize', onResize);

      // The editor's own question / message box (the admin app's WebView shows no window.confirm or alert).
      function dialog(message, withCancel) {
        return new Promise(function (resolve) {
          var d = document.createElement('div');
          d.className = 'de-busy';
          d.innerHTML = '<div style="background:#101614;border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:18px;max-width:320px;margin:20px;">' +
            '<div style="font-size:14.5px;line-height:1.45;margin-bottom:14px;">' + esc(message) + '</div><div style="display:flex;gap:8px;justify-content:flex-end;">' +
            (withCancel ? '<button class="de-btn" data-d="no">Cancel</button>' : '') + '<button class="de-btn go" data-d="yes">OK</button></div></div>';
          d.addEventListener('click', function (ev) {
            var b = ev.target.closest('[data-d]');
            if (!b) return;
            d.remove();
            resolve(b.getAttribute('data-d') === 'yes');
          });
          root.appendChild(d);
        });
      }

      var busyEl = null;
      function busy(text) {
        if (busyEl) { busyEl.remove(); busyEl = null; }
        if (text) { busyEl = document.createElement('div'); busyEl.className = 'de-busy'; busyEl.textContent = text; root.appendChild(busyEl); }
      }
      function finish(result) {
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        document.body.style.overflow = '';
        root.remove();
        resolveOpen(result);
      }
      function close(force) {
        if (force || !dirty) return finish(null);
        dialog('Close without saving your design?', true).then(function (ok) { if (ok) finish(null); });
      }
      // Saving: the fonts first, then the picture of the design (1080 px wide, smaller when very long) and its tap areas.
      function save() {
        busy('Saving your design…');
        var fontsUsed = design.els.filter(function (e) { return e.kind === 'text'; }).map(function (e) { return weightOf(e) + ' 40px "' + e.font + '"'; });
        fontsUsed.push('900 40px "Montserrat"');
        var fontsReady = document.fonts && document.fonts.load ? Promise.all(fontsUsed.map(function (f) { return document.fonts.load(f).catch(function () {}); })) : Promise.resolve();
        var ids = {};
        design.els.forEach(function (e) { if (e.kind === 'image') ids[e.imageId] = 1; });
        if (design.bg.imageId) ids[design.bg.imageId] = 1;
        var pics = {};
        fontsReady
          .then(function () {
            return Promise.all(Object.keys(ids).map(function (id) { return loadImage(picSrc(id)).then(function (img) { if (img) pics[id] = img; }); }));
          })
          .then(function () {
            // texts may have changed height now that their fonts are in
            design.els.forEach(function (e) { if (e.kind === 'text') e.h = Math.max(8, layoutText(e).height); });
            var fullH = Math.round(design.h * EXPORT_SCALE);
            var parts = [];
            for (var top = 0; top < fullH; top += PART_PX) {
              var cv = renderDesign(design, EXPORT_SCALE, opts, pics, { top: top, height: Math.min(PART_PX, fullH - top) });
              var out = null;
              [0.9, 0.82, 0.72, 0.6].some(function (q) {
                var url = cv.toDataURL('image/webp', q);
                if (url.indexOf('data:image/webp') !== 0) url = cv.toDataURL('image/jpeg', Math.min(0.92, q + 0.04));
                var b64 = url.slice(url.indexOf(',') + 1);
                if (b64.length * 0.75 > 2.7 * 1024 * 1024) return false;
                out = { base64: b64, mimeType: url.slice(5, url.indexOf(';')), width: cv.width, height: cv.height, dataUrl: url };
                return true;
              });
              if (!out) throw new Error('The design is too big to save. Use smaller pictures.');
              parts.push(out);
            }
            busy(null);
            finish({ design: design, exported: parts, links: linksOf(design) });
          })
          .catch(function (err) { busy(null); dialog(err && err.message ? err.message : 'Could not save the design.', false); });
      }

      fitScale();
      drawCanvas();
      drawSheet();
      updateTop();
      // when the fonts arrive, the texts are laid out again with them
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (root.isConnected) drawCanvas(); });
      FONTS.forEach(function (f) { if (document.fonts && document.fonts.load) document.fonts.load(f[1][f[1].length - 1] + ' 30px "' + f[0] + '"').then(function () { if (root.isConnected) drawCanvas(); }).catch(function () {}); });
    });
  }

  // A first design for a page: its banner picture (when it has one) on top, a heading, a line of text and a button.
  function starter(banner) {
    var els = [];
    var y = 16;
    if (banner) {
      var h = Math.round(328 * banner.height / banner.width);
      els.push({ id: uid(), kind: 'image', imageId: banner.id, fit: 'cover', radius: 14, x: 16, y: y, w: 328, h: h, rot: 0, opacity: 1, target: '' });
      y += h + 22;
    }
    els.push({ id: uid(), kind: 'text', text: 'YOUR BIG\nHEADING', font: 'Montserrat', size: 34, weight: '900', color: '#FFD45E', align: 'center', lineHeight: 1.12, shadow: true, stroke: null, strokeWidth: 0, x: 16, y: y, w: 328, h: 76, rot: 0, opacity: 1, target: '' });
    y += 76 + 16;
    els.push({ id: uid(), kind: 'text', text: 'Write your offer here. Tap anything to choose it, then drag it to move it.', font: 'Poppins', size: 16, weight: '600', color: '#FFFFFF', align: 'center', lineHeight: 1.4, shadow: false, stroke: null, strokeWidth: 0, x: 24, y: y, w: 312, h: 45, rot: 0, opacity: 1, target: '' });
    y += 45 + 40;
    els.push({ id: uid(), kind: 'button', label: 'DEPOSIT NOW', tone: 'red', textColor: '', radius: 999, x: 55, y: y, w: 250, h: 54, rot: 0, opacity: 1, target: 'Deposit' });
    return { w: W, h: Math.max(640, y + 54 + 40), bg: { color: '#2C0F55', color2: '#170709', imageId: null, fit: 'cover', shade: 0 }, els: els };
  }

  window.NovaDesignEditor = { open: open, starter: starter, renderDesign: renderDesign, linksOf: linksOf, layoutText: layoutText, WIDTH: W };
})();
