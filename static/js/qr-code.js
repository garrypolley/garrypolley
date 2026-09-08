var QrCodeUtils = (function () {
  "use strict";

  var MAX_PAYLOAD = 1200;
  var MIN_OUTPUT = 192;
  var MAX_OUTPUT = 1024;
  var DEFAULT_OUTPUT = 384;
  var MIN_LOGO_PCT = 12;
  var MAX_LOGO_PCT = 24;
  var DEFAULT_LOGO_PCT = 18;
  var QUIET_MODULES = 4;
  var DEFAULT_FG = "#111111";
  var DEFAULT_BG = "#ffffff";

  function getQrLib() {
    if (typeof qrcodegen !== "undefined") return qrcodegen;
    if (typeof module === "object" && module.exports) {
      return require("./vendor/qrcodegen.js");
    }
    return null;
  }

  function normalizePayload(raw) {
    var text = String(raw == null ? "" : raw).replace(/^\s+|\s+$/g, "");
    if (!text) {
      throw new Error("Paste a link or some text to encode.");
    }
    if (text.length > MAX_PAYLOAD) {
      throw new Error("Keep the text under " + MAX_PAYLOAD + " characters.");
    }
    return text;
  }

  function parseHexColor(raw, fallback) {
    var text = String(raw == null ? "" : raw).trim();
    var short = text.match(/^#([0-9a-f]{3})$/i);
    if (short) {
      return (
        "#" +
        short[1]
          .split("")
          .map(function (ch) {
            return ch + ch;
          })
          .join("")
          .toLowerCase()
      );
    }
    if (/^#[0-9a-f]{6}$/i.test(text)) {
      return text.toLowerCase();
    }
    return fallback;
  }

  function clampOutputSize(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) return DEFAULT_OUTPUT;
    if (n < MIN_OUTPUT) return MIN_OUTPUT;
    if (n > MAX_OUTPUT) return MAX_OUTPUT;
    return n;
  }

  function clampLogoPercent(value) {
    var n = parseFloat(value);
    if (!isFinite(n)) return DEFAULT_LOGO_PCT;
    if (n < MIN_LOGO_PCT) return MIN_LOGO_PCT;
    if (n > MAX_LOGO_PCT) return MAX_LOGO_PCT;
    return n;
  }

  function chooseEcc(hasOverlay) {
    return hasOverlay ? "H" : "M";
  }

  function eccObject(level) {
    var lib = getQrLib();
    if (!lib) {
      throw new Error("QR library is not loaded.");
    }
    if (level === "H") return lib.QrCode.Ecc.HIGH;
    if (level === "L") return lib.QrCode.Ecc.LOW;
    if (level === "Q") return lib.QrCode.Ecc.QUARTILE;
    return lib.QrCode.Ecc.MEDIUM;
  }

  function encodePayload(text, eccLevel) {
    var payload = normalizePayload(text);
    var lib = getQrLib();
    if (!lib) {
      throw new Error("QR library is not loaded.");
    }
    var qr = lib.QrCode.encodeText(payload, eccObject(eccLevel || "M"));
    return {
      size: qr.size,
      version: qr.version,
      getModule: function (x, y) {
        return qr.getModule(x, y);
      },
    };
  }

  function filenameFromPayload(text) {
    var payload = String(text || "").replace(/^\s+|\s+$/g, "");
    var host;
    try {
      if (/^https?:\/\//i.test(payload)) {
        host = new URL(payload).hostname.replace(/^www\./i, "");
      }
    } catch (err) {
      host = "";
    }
    var base = host || payload.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    if (!base) base = "qr-code";
    base = base.toLowerCase().slice(0, 40);
    return base + ".png";
  }

  function overlayBox(qrSize, modulePx, logoPercent) {
    var cover = clampLogoPercent(logoPercent) / 100;
    var inner = Math.max(1, Math.round(qrSize * cover * modulePx));
    var pad = Math.max(4, Math.round(inner * 0.14));
    return { inner: inner, pad: pad, total: inner + pad * 2 };
  }

  return {
    MAX_PAYLOAD: MAX_PAYLOAD,
    MIN_OUTPUT: MIN_OUTPUT,
    MAX_OUTPUT: MAX_OUTPUT,
    DEFAULT_OUTPUT: DEFAULT_OUTPUT,
    MIN_LOGO_PCT: MIN_LOGO_PCT,
    MAX_LOGO_PCT: MAX_LOGO_PCT,
    DEFAULT_LOGO_PCT: DEFAULT_LOGO_PCT,
    QUIET_MODULES: QUIET_MODULES,
    DEFAULT_FG: DEFAULT_FG,
    DEFAULT_BG: DEFAULT_BG,
    normalizePayload: normalizePayload,
    parseHexColor: parseHexColor,
    clampOutputSize: clampOutputSize,
    clampLogoPercent: clampLogoPercent,
    chooseEcc: chooseEcc,
    encodePayload: encodePayload,
    filenameFromPayload: filenameFromPayload,
    overlayBox: overlayBox,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = QrCodeUtils;
}

(function () {
  if (typeof document === "undefined") return;

  var utils = typeof QrCodeUtils !== "undefined" ? QrCodeUtils : null;
  if (!utils) return;

  var root = document.getElementById("qrCodeTool");
  if (!root) return;

  var textEl = document.getElementById("qrText");
  var labelEl = document.getElementById("qrLabel");
  var centerTextEl = document.getElementById("qrCenterText");
  var logoEl = document.getElementById("qrLogo");
  var logoClearEl = document.getElementById("qrLogoClear");
  var logoPctEl = document.getElementById("qrLogoPct");
  var logoPctValEl = document.getElementById("qrLogoPctVal");
  var fgEl = document.getElementById("qrFg");
  var bgEl = document.getElementById("qrBg");
  var sizeEl = document.getElementById("qrSize");
  var downloadEl = document.getElementById("qrDownload");
  var resetEl = document.getElementById("qrReset");
  var statusEl = document.getElementById("qrStatus");
  var canvas = document.getElementById("qrCanvas");
  var previewWrap = document.getElementById("qrPreview");

  var logoImage = null;
  var lastObjectUrl = "";
  var debounceTimer = null;

  function setStatus(msg, isError) {
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("is-error", !!isError);
  }

  function syncLogoLabel() {
    if (logoPctValEl) logoPctValEl.textContent = String(utils.clampLogoPercent(logoPctEl.value)) + "%";
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function draw() {
    var payload;
    try {
      payload = utils.normalizePayload(textEl.value);
    } catch (err) {
      if (canvas) {
        var ctxEmpty = canvas.getContext("2d");
        ctxEmpty.clearRect(0, 0, canvas.width, canvas.height);
      }
      downloadEl.disabled = true;
      if (previewWrap) previewWrap.hidden = true;
      setStatus(textEl.value.replace(/^\s+|\s+$/g, "") ? err.message : "", !!textEl.value.replace(/^\s+|\s+$/g, ""));
      return;
    }

    var label = String(labelEl.value || "").replace(/^\s+|\s+$/g, "").slice(0, 80);
    var centerText = String(centerTextEl.value || "").replace(/^\s+|\s+$/g, "").slice(0, 18);
    var hasOverlay = !!(logoImage || centerText);
    var ecc = utils.chooseEcc(hasOverlay);
    var qr;
    try {
      qr = utils.encodePayload(payload, ecc);
    } catch (err) {
      downloadEl.disabled = true;
      if (previewWrap) previewWrap.hidden = true;
      setStatus(err.message || "Could not encode that text.", true);
      return;
    }

    var fg = utils.parseHexColor(fgEl.value, utils.DEFAULT_FG);
    var bg = utils.parseHexColor(bgEl.value, utils.DEFAULT_BG);
    var output = utils.clampOutputSize(sizeEl.value);
    var quiet = utils.QUIET_MODULES;
    var modules = qr.size + quiet * 2;
    var modulePx = output / modules;
    var labelH = label ? Math.round(output * 0.11) : 0;
    var pad = 16;
    var width = Math.round(output + pad * 2);
    var height = Math.round(output + pad * 2 + (label ? labelH + 10 : 0));

    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    var ox = pad;
    var oy = pad;
    var x;
    var y;
    for (y = 0; y < qr.size; y++) {
      for (x = 0; x < qr.size; x++) {
        ctx.fillStyle = qr.getModule(x, y) ? fg : bg;
        ctx.fillRect(
          ox + (x + quiet) * modulePx,
          oy + (y + quiet) * modulePx,
          modulePx + 0.45,
          modulePx + 0.45
        );
      }
    }

    if (hasOverlay) {
      var box = utils.overlayBox(qr.size, modulePx, logoPctEl.value);
      var cx = ox + output / 2;
      var cy = oy + output / 2;
      ctx.fillStyle = bg;
      roundRect(ctx, cx - box.total / 2, cy - box.total / 2, box.total, box.total, Math.max(6, box.pad));
      ctx.fill();
      if (logoImage && logoImage.width && logoImage.height) {
        var scale = Math.min(box.inner / logoImage.width, box.inner / logoImage.height);
        var lw = logoImage.width * scale;
        var lh = logoImage.height * scale;
        ctx.drawImage(logoImage, cx - lw / 2, cy - lh / 2, lw, lh);
      } else if (centerText) {
        ctx.fillStyle = fg;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "700 " + Math.max(12, Math.round(box.inner * 0.32)) + "px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(centerText, cx, cy, box.inner);
      }
    }

    if (label) {
      ctx.fillStyle = fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "600 " + Math.max(14, Math.round(labelH * 0.55)) + "px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(label, width / 2, oy + output + 8, output);
    }

    downloadEl.disabled = false;
    if (previewWrap) previewWrap.hidden = false;
    setStatus("Ready — high error correction is on" + (hasOverlay ? " so the center can stay scannable." : "."));
    if (!hasOverlay) {
      setStatus("Ready to download.");
    }
  }

  function scheduleDraw() {
    syncLogoLabel();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(draw, 60);
  }

  function clearLogo() {
    logoImage = null;
    logoEl.value = "";
    scheduleDraw();
  }

  downloadEl.addEventListener("click", function () {
    if (!canvas.width) return;
    if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
    canvas.toBlob(function (blob) {
      if (!blob) {
        setStatus("Could not build a PNG.", true);
        return;
      }
      lastObjectUrl = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = lastObjectUrl;
      link.download = utils.filenameFromPayload(textEl.value);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, "image/png");
  });

  resetEl.addEventListener("click", function () {
    textEl.value = "";
    labelEl.value = "";
    centerTextEl.value = "";
    fgEl.value = utils.DEFAULT_FG;
    bgEl.value = utils.DEFAULT_BG;
    sizeEl.value = String(utils.DEFAULT_OUTPUT);
    logoPctEl.value = String(utils.DEFAULT_LOGO_PCT);
    clearLogo();
    setStatus("Cleared.");
  });

  logoClearEl.addEventListener("click", clearLogo);

  logoEl.addEventListener("change", function () {
    var file = logoEl.files && logoEl.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setStatus("Keep the logo under 2 MB.", true);
      logoEl.value = "";
      return;
    }
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) {
      setStatus("Use a PNG, JPEG, WebP, or GIF logo.", true);
      logoEl.value = "";
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        logoImage = img;
        scheduleDraw();
      };
      img.onerror = function () {
        setStatus("Could not read that logo.", true);
      };
      img.src = String(reader.result || "");
    };
    reader.onerror = function () {
      setStatus("Could not read that logo.", true);
    };
    reader.readAsDataURL(file);
  });

  [textEl, labelEl, centerTextEl, logoPctEl, fgEl, bgEl, sizeEl].forEach(function (el) {
    el.addEventListener("input", scheduleDraw);
    el.addEventListener("change", scheduleDraw);
  });

  syncLogoLabel();
})();
