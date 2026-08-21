var GifSlicerUtils = (function () {
  "use strict";

  var MAX_FRAMES = 300;
  var MAX_PIXELS = 2 * 1024 * 1024; // per-frame width*height
  var MAX_TOTAL_PIXELS = 24 * 1024 * 1024; // sum across stored frames
  var MAX_FILE_BYTES = 80 * 1024 * 1024;
  var MAX_VIDEO_DURATION_SEC = 30;
  var MIN_FPS = 1;
  var MAX_FPS = 30;
  var DEFAULT_FPS = 10;
  var MIN_FONT_SIZE = 8;
  var MAX_FONT_SIZE = 200;
  var MIN_STROKE = 0;
  var MAX_STROKE = 20;

  var VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "ogv", "ogg", "avi", "mkv", "mpeg", "mpg", "3gp"];
  var FONTS = [
    "Impact, Haettenschweiler, sans-serif",
    "'Arial Black', 'Helvetica Bold', sans-serif",
    "Helvetica, Arial, sans-serif",
    "Georgia, 'Times New Roman', serif",
    "'Times New Roman', Times, serif",
    "'Courier New', Courier, monospace",
    "Verdana, Geneva, sans-serif",
    "'Trebuchet MS', Helvetica, sans-serif",
    "'Comic Sans MS', 'Comic Sans', cursive"
  ];

  function clamp(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) {
      return fallback;
    }
    if (n < min) {
      return min;
    }
    if (n > max) {
      return max;
    }
    return n;
  }

  function clampFontSize(value) {
    return clamp(value, MIN_FONT_SIZE, MAX_FONT_SIZE, 32);
  }

  function clampStrokeWidth(value) {
    return clamp(value, MIN_STROKE, MAX_STROKE, 3);
  }

  function clampFps(value) {
    return Math.round(clamp(value, MIN_FPS, MAX_FPS, DEFAULT_FPS));
  }

  function fileExtension(name) {
    var text = String(name || "");
    var dot = text.lastIndexOf(".");
    if (dot < 0) {
      return "";
    }
    return text.slice(dot + 1).toLowerCase();
  }

  function isGifFile(file) {
    if (!file) {
      return false;
    }
    if (file.type === "image/gif") {
      return true;
    }
    return fileExtension(file.name) === "gif";
  }

  function isVideoFile(file) {
    if (!file) {
      return false;
    }
    if (file.type && file.type.indexOf("video/") === 0) {
      return true;
    }
    return VIDEO_EXTENSIONS.indexOf(fileExtension(file.name)) !== -1;
  }

  function assertFileSize(file) {
    if (file && typeof file.size === "number" && file.size > MAX_FILE_BYTES) {
      throw new Error(
        "File is too large (max " + Math.round(MAX_FILE_BYTES / (1024 * 1024)) + " MB)."
      );
    }
  }

  function scaledSize(width, height, maxPixels) {
    var w = Math.max(1, Math.floor(width));
    var h = Math.max(1, Math.floor(height));
    var pixels = w * h;
    if (pixels <= maxPixels) {
      return { width: w, height: h, scale: 1 };
    }
    var scale = Math.sqrt(maxPixels / pixels);
    w = Math.max(1, Math.floor(w * scale));
    h = Math.max(1, Math.floor(h * scale));
    return { width: w, height: h, scale: scale };
  }

  function assertFrameBudget(width, height, frameCount) {
    var count = Math.max(0, Math.floor(frameCount || 0));
    var pixels = Math.max(0, Math.floor(width || 0)) * Math.max(0, Math.floor(height || 0));
    if (pixels > MAX_PIXELS) {
      throw new Error("Frames are too large to process in the browser.");
    }
    if (count > MAX_FRAMES) {
      throw new Error("Too many frames (max " + MAX_FRAMES + ").");
    }
    if (pixels * count > MAX_TOTAL_PIXELS) {
      throw new Error(
        "That media would use too much memory. Try a shorter clip, lower FPS, or a smaller file."
      );
    }
  }

  function planVideoCapture(input) {
    var opts = input || {};
    var durationSec = Number(opts.durationSec);
    if (!isFinite(durationSec) || durationSec <= 0) {
      throw new Error("Video has no readable duration.");
    }
    var fps = clampFps(opts.fps);
    var maxDuration = clamp(opts.maxDurationSec, 0.1, MAX_VIDEO_DURATION_SEC, MAX_VIDEO_DURATION_SEC);
    var captureDuration = Math.min(durationSec, maxDuration);
    var videoWidth = Math.max(1, Math.floor(Number(opts.videoWidth) || 1));
    var videoHeight = Math.max(1, Math.floor(Number(opts.videoHeight) || 1));
    var sized = scaledSize(videoWidth, videoHeight, MAX_PIXELS);
    var maxByMemory = Math.max(1, Math.floor(MAX_TOTAL_PIXELS / (sized.width * sized.height)));
    var maxFrames = Math.min(MAX_FRAMES, maxByMemory, Math.max(1, Math.floor(Number(opts.maxFrames) || MAX_FRAMES)));
    var idealCount = Math.max(1, Math.floor(captureDuration * fps));
    var frameCount = Math.min(maxFrames, idealCount);
    // Recalculate effective span so frames are evenly spaced.
    var span = frameCount <= 1 ? 0 : Math.min(captureDuration, (frameCount - 1) / fps);
    var times = [];
    var i;
    for (i = 0; i < frameCount; i++) {
      var t = frameCount === 1 ? 0 : (span * i) / (frameCount - 1);
      // Stay slightly before EOF — some browsers fail seeking to exact duration.
      times.push(Math.min(Math.max(0, t), Math.max(0, durationSec - 0.001)));
    }
    var delayCs = Math.max(1, Math.round(100 / fps));
    return {
      fps: fps,
      width: sized.width,
      height: sized.height,
      sourceWidth: videoWidth,
      sourceHeight: videoHeight,
      frameCount: frameCount,
      times: times,
      delayCs: delayCs,
      captureDuration: captureDuration,
      truncated: captureDuration < durationSec || frameCount < idealCount
    };
  }

  function clampFrameRange(start, end, frameCount) {
    var count = Math.max(0, Math.floor(Number(frameCount) || 0));
    if (count === 0) {
      return { start: 0, end: 0, count: 0 };
    }
    var s = Math.floor(Number(start));
    var e = Math.floor(Number(end));
    if (!isFinite(s)) {
      s = 0;
    }
    if (!isFinite(e)) {
      e = count - 1;
    }
    if (s < 0) {
      s = 0;
    }
    if (e < 0) {
      e = 0;
    }
    if (s > count - 1) {
      s = count - 1;
    }
    if (e > count - 1) {
      e = count - 1;
    }
    if (s > e) {
      var tmp = s;
      s = e;
      e = tmp;
    }
    return { start: s, end: e, count: e - s + 1 };
  }

  function normalizeTextStyle(input) {
    var style = input || {};
    var font = String(style.fontFamily || FONTS[0]);
    if (FONTS.indexOf(font) === -1) {
      font = FONTS[0];
    }
    var position = String(style.position || "top").toLowerCase();
    if (position !== "top" && position !== "center" && position !== "bottom") {
      position = "top";
    }
    var align = String(style.align || "center").toLowerCase();
    if (align !== "left" && align !== "center" && align !== "right") {
      align = "center";
    }
    return {
      text: String(style.text == null ? "" : style.text),
      fontFamily: font,
      fontSize: clampFontSize(style.fontSize),
      bold: !!style.bold,
      italic: !!style.italic,
      fillColor: normalizeColor(style.fillColor, "#ffffff"),
      strokeColor: normalizeColor(style.strokeColor, "#000000"),
      strokeWidth: clampStrokeWidth(style.strokeWidth),
      position: position,
      align: align
    };
  }

  function normalizeColor(value, fallback) {
    var text = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      return text.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(text)) {
      return (
        "#" +
        text[1] +
        text[1] +
        text[2] +
        text[2] +
        text[3] +
        text[3]
      ).toLowerCase();
    }
    return fallback;
  }

  function buildFontCss(style) {
    var parts = [];
    if (style.italic) {
      parts.push("italic");
    }
    if (style.bold) {
      parts.push("bold");
    }
    parts.push(style.fontSize + "px");
    parts.push(style.fontFamily);
    return parts.join(" ");
  }

  function wrapTextLines(ctx, text, maxWidth) {
    var raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!raw) {
      return [];
    }
    var paragraphs = raw.split("\n");
    var lines = [];
    for (var p = 0; p < paragraphs.length; p++) {
      var paragraph = paragraphs[p];
      if (!paragraph) {
        lines.push("");
        continue;
      }
      var words = paragraph.split(/\s+/);
      var current = words[0] || "";
      for (var i = 1; i < words.length; i++) {
        var candidate = current + " " + words[i];
        if (ctx.measureText(candidate).width <= maxWidth) {
          current = candidate;
        } else {
          lines.push(current);
          current = words[i];
        }
      }
      lines.push(current);
    }
    return lines;
  }

  function drawTextOverlay(ctx, width, height, styleInput) {
    var style = normalizeTextStyle(styleInput);
    if (!style.text.trim()) {
      return;
    }

    ctx.save();
    ctx.font = buildFontCss(style);
    ctx.textBaseline = "middle";
    ctx.fillStyle = style.fillColor;
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = style.strokeWidth;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    var maxWidth = Math.max(16, width - 24);
    var lines = wrapTextLines(ctx, style.text, maxWidth);
    var lineHeight = Math.round(style.fontSize * 1.2);
    var blockHeight = lines.length * lineHeight;
    var y;
    if (style.position === "top") {
      y = 12 + lineHeight / 2;
    } else if (style.position === "bottom") {
      y = height - 12 - blockHeight + lineHeight / 2;
    } else {
      y = (height - blockHeight) / 2 + lineHeight / 2;
    }

    var x;
    if (style.align === "left") {
      ctx.textAlign = "left";
      x = 12;
    } else if (style.align === "right") {
      ctx.textAlign = "right";
      x = width - 12;
    } else {
      ctx.textAlign = "center";
      x = width / 2;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var ly = y + i * lineHeight;
      if (style.strokeWidth > 0) {
        ctx.strokeText(line, x, ly);
      }
      ctx.fillText(line, x, ly);
    }
    ctx.restore();
  }

  function Reader(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.pos = 0;
  }

  Reader.prototype.remaining = function () {
    return this.bytes.length - this.pos;
  };

  Reader.prototype.readByte = function () {
    if (this.pos >= this.bytes.length) {
      throw new Error("Unexpected end of GIF data.");
    }
    return this.bytes[this.pos++];
  };

  Reader.prototype.readBytes = function (n) {
    if (this.pos + n > this.bytes.length) {
      throw new Error("Unexpected end of GIF data.");
    }
    var out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  };

  Reader.prototype.readUnsigned = function () {
    var a = this.readByte();
    var b = this.readByte();
    return a | (b << 8);
  };

  Reader.prototype.readString = function (n) {
    var bytes = this.readBytes(n);
    var s = "";
    for (var i = 0; i < bytes.length; i++) {
      s += String.fromCharCode(bytes[i]);
    }
    return s;
  };

  function readColorTable(reader, size) {
    var table = new Array(size);
    for (var i = 0; i < size; i++) {
      table[i] = [reader.readByte(), reader.readByte(), reader.readByte()];
    }
    return table;
  }

  function lzwDecode(minCodeSize, data) {
    if (!(minCodeSize >= 2 && minCodeSize <= 8)) {
      throw new Error("Invalid GIF LZW code size.");
    }
    var clearCode = 1 << minCodeSize;
    var eoiCode = clearCode + 1;
    var codeSize = minCodeSize + 1;
    var nextCode = eoiCode + 1;
    var dictionary = [];
    var i;
    for (i = 0; i < clearCode; i++) {
      dictionary[i] = [i];
    }
    dictionary[clearCode] = [];
    dictionary[eoiCode] = null;

    var bitPos = 0;
    function readCode() {
      var code = 0;
      for (var b = 0; b < codeSize; b++) {
        var byteIndex = bitPos >> 3;
        if (byteIndex >= data.length) {
          return eoiCode;
        }
        var bit = (data[byteIndex] >> (bitPos & 7)) & 1;
        code |= bit << b;
        bitPos++;
      }
      return code;
    }

    function resetDict() {
      dictionary.length = eoiCode + 1;
      for (i = 0; i < clearCode; i++) {
        dictionary[i] = [i];
      }
      dictionary[clearCode] = [];
      dictionary[eoiCode] = null;
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
    }

    var output = [];
    var prev = null;
    var code = readCode();
    while (code !== eoiCode) {
      if (code === clearCode) {
        resetDict();
        prev = null;
        code = readCode();
        continue;
      }

      var entry;
      if (code < dictionary.length && dictionary[code]) {
        entry = dictionary[code];
      } else if (prev && code === nextCode) {
        entry = prev.concat(prev[0]);
      } else {
        throw new Error("Invalid LZW code in GIF.");
      }

      for (i = 0; i < entry.length; i++) {
        output.push(entry[i]);
      }

      if (prev) {
        if (nextCode < 4096) {
          dictionary[nextCode++] = prev.concat(entry[0]);
          if (nextCode >= 1 << codeSize && codeSize < 12) {
            codeSize++;
          }
        }
      }
      prev = entry;
      code = readCode();
    }
    return output;
  }

  function deinterlace(indices, width, height) {
    var result = new Array(width * height);
    var offsets = [0, 4, 2, 1];
    var steps = [8, 8, 4, 2];
    var row = 0;
    for (var pass = 0; pass < 4; pass++) {
      for (var y = offsets[pass]; y < height; y += steps[pass]) {
        var srcStart = row * width;
        var destStart = y * width;
        for (var x = 0; x < width; x++) {
          result[destStart + x] = indices[srcStart + x];
        }
        row++;
      }
    }
    return result;
  }

  function parseGif(arrayBuffer) {
    var reader = new Reader(arrayBuffer);
    var signature = reader.readString(6);
    if (signature !== "GIF87a" && signature !== "GIF89a") {
      throw new Error("That file is not a GIF.");
    }

    var width = reader.readUnsigned();
    var height = reader.readUnsigned();
    if (width <= 0 || height <= 0) {
      throw new Error("GIF has invalid dimensions.");
    }
    if (width * height > MAX_PIXELS) {
      throw new Error("GIF is too large to process in the browser.");
    }

    var packed = reader.readByte();
    var gctFlag = (packed & 0x80) !== 0;
    var gctSize = 1 << ((packed & 0x07) + 1);
    reader.readByte(); // background
    reader.readByte(); // pixel aspect

    var gct = null;
    if (gctFlag) {
      gct = readColorTable(reader, gctSize);
    }

    var loopCount = 0;
    var frames = [];
    var gce = {
      disposal: 0,
      userInput: false,
      transparentIndex: -1,
      delay: 10
    };

    var canvas = new Uint8ClampedArray(width * height * 4);
    var previous = new Uint8ClampedArray(width * height * 4);

    while (reader.remaining() > 0) {
      var intro = reader.readByte();
      if (intro === 0x3b) {
        break;
      }
      if (intro === 0x21) {
        var label = reader.readByte();
        if (label === 0xf9) {
          reader.readByte(); // block size
          var gcePacked = reader.readByte();
          gce.disposal = (gcePacked >> 2) & 0x07;
          gce.userInput = (gcePacked & 0x02) !== 0;
          var delay = reader.readUnsigned();
          // Browsers treat delay 0 as ~100ms (10cs).
          gce.delay = delay === 0 ? 10 : delay;
          var trans = reader.readByte();
          gce.transparentIndex = gcePacked & 0x01 ? trans : -1;
          reader.readByte(); // terminator
        } else if (label === 0xff) {
          var appLen = reader.readByte();
          var app = reader.readString(appLen);
          var parts = [];
          var size = reader.readByte();
          while (size) {
            parts.push(reader.readBytes(size));
            size = reader.readByte();
          }
          if (app === "NETSCAPE2.0" && parts[0] && parts[0].length >= 3 && parts[0][0] === 1) {
            loopCount = parts[0][1] | (parts[0][2] << 8);
          }
        } else {
          var skip = reader.readByte();
          while (skip) {
            reader.readBytes(skip);
            skip = reader.readByte();
          }
        }
        continue;
      }

      if (intro !== 0x2c) {
        throw new Error("Unsupported GIF block.");
      }

      if (frames.length >= MAX_FRAMES) {
        throw new Error("GIF has too many frames (max " + MAX_FRAMES + ").");
      }

      var left = reader.readUnsigned();
      var top = reader.readUnsigned();
      var fw = reader.readUnsigned();
      var fh = reader.readUnsigned();
      var ipacked = reader.readByte();
      var lctFlag = (ipacked & 0x80) !== 0;
      var interlaced = (ipacked & 0x40) !== 0;
      var lctSize = 1 << ((ipacked & 0x07) + 1);
      var lct = null;
      if (lctFlag) {
        lct = readColorTable(reader, lctSize);
      }
      var colorTable = lct || gct;
      if (!colorTable) {
        throw new Error("GIF is missing a color table.");
      }

      var minCodeSize = reader.readByte();
      var lzwParts = [];
      var blockSize = reader.readByte();
      var total = 0;
      while (blockSize) {
        var chunk = reader.readBytes(blockSize);
        lzwParts.push(chunk);
        total += chunk.length;
        blockSize = reader.readByte();
      }
      var lzwData = new Uint8Array(total);
      var offset = 0;
      for (var p = 0; p < lzwParts.length; p++) {
        lzwData.set(lzwParts[p], offset);
        offset += lzwParts[p].length;
      }

      var indices = lzwDecode(minCodeSize, lzwData);
      if (indices.length < fw * fh) {
        throw new Error("GIF frame data is truncated.");
      }
      if (interlaced) {
        indices = deinterlace(indices, fw, fh);
      }

      previous.set(canvas);

      var transparent = gce.transparentIndex;
      for (var y = 0; y < fh; y++) {
        for (var x = 0; x < fw; x++) {
          var idx = indices[y * fw + x];
          if (idx === transparent) {
            continue;
          }
          var color = colorTable[idx] || [0, 0, 0];
          var px = ((top + y) * width + (left + x)) * 4;
          if (px < 0 || px + 3 >= canvas.length) {
            continue;
          }
          canvas[px] = color[0];
          canvas[px + 1] = color[1];
          canvas[px + 2] = color[2];
          canvas[px + 3] = 255;
        }
      }

      frames.push({
        delayCs: gce.delay,
        disposal: gce.disposal,
        left: left,
        top: top,
        width: fw,
        height: fh,
        pixels: new Uint8ClampedArray(canvas)
      });

      assertFrameBudget(width, height, frames.length);

      if (gce.disposal === 2) {
        for (var cy = 0; cy < fh; cy++) {
          for (var cx = 0; cx < fw; cx++) {
            var cpx = ((top + cy) * width + (left + cx)) * 4;
            canvas[cpx] = 0;
            canvas[cpx + 1] = 0;
            canvas[cpx + 2] = 0;
            canvas[cpx + 3] = 0;
          }
        }
      } else if (gce.disposal === 3) {
        canvas.set(previous);
      }

      gce = {
        disposal: 0,
        userInput: false,
        transparentIndex: -1,
        delay: 10
      };
    }

    if (!frames.length) {
      throw new Error("GIF has no frames.");
    }

    return {
      width: width,
      height: height,
      loopCount: loopCount,
      sourceType: "gif",
      frames: frames
    };
  }

  function sliceFrames(parsed, start, end) {
    var range = clampFrameRange(start, end, parsed.frames.length);
    return {
      width: parsed.width,
      height: parsed.height,
      loopCount: parsed.loopCount,
      sourceType: parsed.sourceType || "gif",
      frames: parsed.frames.slice(range.start, range.end + 1),
      range: range
    };
  }

  function colorDistance(a, b) {
    var dr = a[0] - b[0];
    var dg = a[1] - b[1];
    var db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  function buildPalette(frames, maxColors) {
    var counts = Object.create(null);
    var samples = [];
    var step = 4;
    for (var f = 0; f < frames.length; f++) {
      var pixels = frames[f].pixels;
      for (var i = 0; i < pixels.length; i += 4 * step) {
        if (pixels[i + 3] < 128) {
          continue;
        }
        var key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
        if (counts[key]) {
          counts[key]++;
        } else {
          counts[key] = 1;
          samples.push([pixels[i], pixels[i + 1], pixels[i + 2], key]);
        }
      }
    }

    if (!samples.length) {
      return [[0, 0, 0]];
    }

    samples.sort(function (a, b) {
      return counts[b[3]] - counts[a[3]];
    });

    var palette = [];
    var limit = Math.min(maxColors, samples.length);
    for (var s = 0; s < samples.length && palette.length < limit; s++) {
      var candidate = samples[s];
      var far = true;
      for (var p = 0; p < palette.length; p++) {
        if (colorDistance(palette[p], candidate) < 48) {
          far = false;
          break;
        }
      }
      if (far || palette.length < Math.min(32, limit)) {
        palette.push([candidate[0], candidate[1], candidate[2]]);
      }
    }

    while (palette.length < 2) {
      palette.push([0, 0, 0]);
    }
    return palette;
  }

  function nearestColorIndex(palette, r, g, b, skipIndex) {
    var best = skipIndex === 0 ? 1 : 0;
    if (best >= palette.length) {
      best = 0;
    }
    var bestDist = Infinity;
    for (var i = 0; i < palette.length; i++) {
      if (i === skipIndex) {
        continue;
      }
      var c = palette[i];
      var d = colorDistance(c, [r, g, b]);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function indexFrame(pixels, width, height, palette, transparentIndex) {
    var indices = new Uint8Array(width * height);
    for (var i = 0, p = 0; i < indices.length; i++, p += 4) {
      if (transparentIndex >= 0 && pixels[p + 3] < 128) {
        indices[i] = transparentIndex;
      } else {
        indices[i] = nearestColorIndex(palette, pixels[p], pixels[p + 1], pixels[p + 2], transparentIndex);
      }
    }
    return indices;
  }

  function lzwEncode(minCodeSize, indices) {
    var clearCode = 1 << minCodeSize;
    var eoiCode = clearCode + 1;
    var codeSize = minCodeSize + 1;
    var nextCode = eoiCode + 1;
    var dict = Object.create(null);

    function reset() {
      dict = Object.create(null);
      for (var i = 0; i < clearCode; i++) {
        dict[String.fromCharCode(i)] = i;
      }
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
    }

    var bitBuffer = 0;
    var bitCount = 0;
    var bytes = [];

    function writeCode(code) {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        bytes.push(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    }

    reset();
    writeCode(clearCode);

    if (!indices.length) {
      writeCode(eoiCode);
      if (bitCount > 0) {
        bytes.push(bitBuffer & 0xff);
      }
      return new Uint8Array(bytes);
    }

    var w = String.fromCharCode(indices[0]);
    for (var i = 1; i < indices.length; i++) {
      var k = String.fromCharCode(indices[i]);
      var wk = w + k;
      if (dict[wk] != null) {
        w = wk;
      } else {
        writeCode(dict[w]);
        if (nextCode < 4096) {
          if (nextCode >= 1 << codeSize && codeSize < 12) {
            codeSize++;
          }
          dict[wk] = nextCode++;
        } else {
          writeCode(clearCode);
          reset();
        }
        w = k;
      }
    }
    writeCode(dict[w]);
    writeCode(eoiCode);
    if (bitCount > 0) {
      bytes.push(bitBuffer & 0xff);
    }
    return new Uint8Array(bytes);
  }

  function writeBlocks(out, data) {
    var offset = 0;
    while (offset < data.length) {
      var size = Math.min(255, data.length - offset);
      out.push(size);
      for (var i = 0; i < size; i++) {
        out.push(data[offset + i]);
      }
      offset += size;
    }
    out.push(0);
  }

  function paletteSizeBits(count) {
    var n = 1;
    var bits = 0;
    while (n < count) {
      n <<= 1;
      bits++;
    }
    if (bits < 1) {
      bits = 1;
    }
    return bits;
  }

  function encodeGif(sliced, options) {
    options = options || {};
    var width = sliced.width;
    var height = sliced.height;
    var frames = sliced.frames;
    if (!frames || !frames.length) {
      throw new Error("Nothing to export — no frames in range.");
    }

    var rendered = [];
    for (var i = 0; i < frames.length; i++) {
      var pixels = new Uint8ClampedArray(frames[i].pixels);
      if (typeof options.renderOverlay === "function") {
        options.renderOverlay(pixels, width, height);
      }
      rendered.push({
        pixels: pixels,
        delayCs: Math.max(1, frames[i].delayCs || 10)
      });
    }

    var palette = buildPalette(rendered, 255);
    // Reserve index 0 for transparency when needed.
    var hasTransparency = false;
    var r;
    var p;
    for (r = 0; r < rendered.length && !hasTransparency; r++) {
      var pix = rendered[r].pixels;
      for (p = 3; p < pix.length; p += 4) {
        if (pix[p] < 128) {
          hasTransparency = true;
          break;
        }
      }
    }

    var workingPalette = palette.slice();
    if (hasTransparency) {
      workingPalette.unshift([0, 0, 0]);
      if (workingPalette.length > 256) {
        workingPalette = workingPalette.slice(0, 256);
      }
    }

    var bits = paletteSizeBits(workingPalette.length);
    var tableSize = 1 << bits;
    while (workingPalette.length < tableSize) {
      workingPalette.push([0, 0, 0]);
    }

    var transparentIndex = hasTransparency ? 0 : -1;

    var out = [];
    function pushString(s) {
      for (var i = 0; i < s.length; i++) {
        out.push(s.charCodeAt(i));
      }
    }
    function pushU16(n) {
      out.push(n & 0xff);
      out.push((n >> 8) & 0xff);
    }

    pushString("GIF89a");
    pushU16(width);
    pushU16(height);
    out.push(0x80 | ((bits - 1) & 0x07));
    out.push(0);
    out.push(0);
    for (var c = 0; c < tableSize; c++) {
      out.push(workingPalette[c][0]);
      out.push(workingPalette[c][1]);
      out.push(workingPalette[c][2]);
    }

    out.push(0x21, 0xff, 0x0b);
    pushString("NETSCAPE2.0");
    out.push(0x03, 0x01);
    pushU16(0);
    out.push(0x00);

    var minCodeSize = bits < 2 ? 2 : bits;
    for (var f = 0; f < rendered.length; f++) {
      var frame = rendered[f];
      out.push(0x21, 0xf9, 0x04);
      // Disposal 1 (do not dispose) lives in bits 2-4 → 0x04; transparent flag → 0x01.
      var packedGce = 0x04;
      if (hasTransparency) {
        packedGce |= 0x01;
      }
      out.push(packedGce);
      pushU16(frame.delayCs);
      out.push(hasTransparency ? transparentIndex : 0);
      out.push(0x00);

      out.push(0x2c);
      pushU16(0);
      pushU16(0);
      pushU16(width);
      pushU16(height);
      out.push(0x00);

      var indices = indexFrame(frame.pixels, width, height, workingPalette, transparentIndex);
      var compressed = lzwEncode(minCodeSize, indices);
      out.push(minCodeSize);
      writeBlocks(out, compressed);
    }

    out.push(0x3b);
    return new Uint8Array(out);
  }

  function renderOverlayOntoPixels(pixels, width, height, style, canvasFactory, reusable) {
    if (!style || !String(style.text || "").trim()) {
      return pixels;
    }
    if (typeof document === "undefined" && !canvasFactory && !(reusable && reusable.canvas)) {
      return pixels;
    }
    var canvas;
    var ctx;
    if (reusable && reusable.canvas && reusable.ctx) {
      canvas = reusable.canvas;
      ctx = reusable.ctx;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    } else if (canvasFactory) {
      canvas = canvasFactory(width, height);
      ctx = canvas.getContext("2d");
    } else {
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext("2d");
    }
    var imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
    drawTextOverlay(ctx, width, height, style);
    var out = ctx.getImageData(0, 0, width, height).data;
    for (var i = 0; i < pixels.length; i++) {
      pixels[i] = out[i];
    }
    return pixels;
  }

  function delayMs(delayCs) {
    var cs = Math.max(1, delayCs || 10);
    return cs * 10;
  }

  return {
    MAX_FRAMES: MAX_FRAMES,
    MAX_PIXELS: MAX_PIXELS,
    MAX_TOTAL_PIXELS: MAX_TOTAL_PIXELS,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    MAX_VIDEO_DURATION_SEC: MAX_VIDEO_DURATION_SEC,
    MIN_FPS: MIN_FPS,
    MAX_FPS: MAX_FPS,
    DEFAULT_FPS: DEFAULT_FPS,
    MIN_FONT_SIZE: MIN_FONT_SIZE,
    MAX_FONT_SIZE: MAX_FONT_SIZE,
    VIDEO_EXTENSIONS: VIDEO_EXTENSIONS,
    FONTS: FONTS,
    clamp: clamp,
    clampFontSize: clampFontSize,
    clampStrokeWidth: clampStrokeWidth,
    clampFps: clampFps,
    clampFrameRange: clampFrameRange,
    fileExtension: fileExtension,
    isGifFile: isGifFile,
    isVideoFile: isVideoFile,
    assertFileSize: assertFileSize,
    assertFrameBudget: assertFrameBudget,
    scaledSize: scaledSize,
    planVideoCapture: planVideoCapture,
    normalizeTextStyle: normalizeTextStyle,
    normalizeColor: normalizeColor,
    buildFontCss: buildFontCss,
    wrapTextLines: wrapTextLines,
    drawTextOverlay: drawTextOverlay,
    parseGif: parseGif,
    sliceFrames: sliceFrames,
    buildPalette: buildPalette,
    encodeGif: encodeGif,
    renderOverlayOntoPixels: renderOverlayOntoPixels,
    delayMs: delayMs,
    lzwDecode: lzwDecode,
    lzwEncode: lzwEncode
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = GifSlicerUtils;
}

(function () {
  if (typeof document === "undefined") {
    return;
  }

  var root = document.getElementById("gifSlicerTool");
  if (!root) {
    return;
  }

  var U = GifSlicerUtils;
  var fileInput = document.getElementById("gsFile");
  var meta = document.getElementById("gsMeta");
  var metaText = document.getElementById("gsMetaText");
  var videoFields = document.getElementById("gsVideoFields");
  var fpsInput = document.getElementById("gsFps");
  var resampleButton = document.getElementById("gsResample");
  var sliceFields = document.getElementById("gsSliceFields");
  var textFields = document.getElementById("gsTextFields");
  var startInput = document.getElementById("gsStartFrame");
  var endInput = document.getElementById("gsEndFrame");
  var startLabel = document.getElementById("gsStartLabel");
  var endLabel = document.getElementById("gsEndLabel");
  var sliceHint = document.getElementById("gsSliceHint");
  var textInput = document.getElementById("gsText");
  var fontSelect = document.getElementById("gsFont");
  var fontSizeInput = document.getElementById("gsFontSize");
  var boldInput = document.getElementById("gsStyleBold");
  var italicInput = document.getElementById("gsStyleItalic");
  var fillInput = document.getElementById("gsFillColor");
  var strokeInput = document.getElementById("gsStrokeColor");
  var strokeWidthInput = document.getElementById("gsStrokeWidth");
  var positionSelect = document.getElementById("gsPosition");
  var alignSelect = document.getElementById("gsAlign");
  var exportButton = document.getElementById("gsExport");
  var clearButton = document.getElementById("gsClear");
  var statusEl = document.getElementById("gsStatus");
  var preview = document.getElementById("gsPreview");

  var parsed = null;
  var sourceFile = null;
  var sourceKind = null; // "gif" | "video"
  var fileName = "gif";
  var objectUrl = null;
  var playTimer = null;
  var playIndex = 0;
  var displayIndex = 0;
  var previewCanvas = null;
  var previewCtx = null;
  var overlayCanvas = null;
  var overlayCtx = null;
  var busy = false;

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    if (isError) {
      statusEl.classList.add("is-error");
    } else {
      statusEl.classList.remove("is-error");
    }
  }

  function revokeObjectUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function currentStyle() {
    return U.normalizeTextStyle({
      text: textInput.value,
      fontFamily: fontSelect.value,
      fontSize: fontSizeInput.value,
      bold: boldInput.checked,
      italic: italicInput.checked,
      fillColor: fillInput.value,
      strokeColor: strokeInput.value,
      strokeWidth: strokeWidthInput.value,
      position: positionSelect.value,
      align: alignSelect.value
    });
  }

  function currentRange() {
    if (!parsed) {
      return { start: 0, end: 0, count: 0 };
    }
    return U.clampFrameRange(startInput.value, endInput.value, parsed.frames.length);
  }

  function stopPlayback() {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
  }

  function ensureCanvas(width, height) {
    if (!previewCanvas) {
      preview.innerHTML = "";
      previewCanvas = document.createElement("canvas");
      previewCanvas.className = "gs-canvas";
      previewCanvas.setAttribute("aria-label", "GIF preview");
      preview.appendChild(previewCanvas);
      previewCtx = previewCanvas.getContext("2d");
    }
    if (previewCanvas.width !== width || previewCanvas.height !== height) {
      previewCanvas.width = width;
      previewCanvas.height = height;
    }
  }

  function drawFrame(frame, index) {
    if (!parsed || !frame) {
      return;
    }
    ensureCanvas(parsed.width, parsed.height);
    var imageData = previewCtx.createImageData(parsed.width, parsed.height);
    imageData.data.set(frame.pixels);
    previewCtx.putImageData(imageData, 0, 0);
    U.drawTextOverlay(previewCtx, parsed.width, parsed.height, currentStyle());
    if (typeof index === "number") {
      displayIndex = index;
    }
  }

  function scheduleNext() {
    stopPlayback();
    if (!parsed) {
      return;
    }
    var range = currentRange();
    if (range.count <= 0) {
      return;
    }
    if (playIndex < range.start || playIndex > range.end) {
      playIndex = range.start;
    }
    var frame = parsed.frames[playIndex];
    drawFrame(frame, playIndex);
    var next = playIndex + 1;
    if (next > range.end) {
      next = range.start;
    }
    playIndex = next;
    playTimer = setTimeout(scheduleNext, U.delayMs(frame.delayCs));
  }

  function restartPreview() {
    stopPlayback();
    if (!parsed) {
      return;
    }
    var range = currentRange();
    playIndex = range.start;
    scheduleNext();
  }

  function updateSliceLabels() {
    if (!parsed) {
      return;
    }
    var range = currentRange();
    if (Number(startInput.value) !== range.start) {
      startInput.value = String(range.start);
    }
    if (Number(endInput.value) !== range.end) {
      endInput.value = String(range.end);
    }
    startLabel.textContent = String(range.start + 1);
    endLabel.textContent = String(range.end + 1);
    sliceHint.textContent =
      "Keeping frames " +
      (range.start + 1) +
      "–" +
      (range.end + 1) +
      " of " +
      parsed.frames.length +
      " (" +
      range.count +
      " frame" +
      (range.count === 1 ? "" : "s") +
      ").";
  }

  function syncControlsEnabled(enabled, kind) {
    sliceFields.disabled = !enabled;
    textFields.disabled = !enabled;
    exportButton.disabled = !enabled || busy;
    meta.hidden = !enabled;
    var showVideo = enabled && kind === "video";
    videoFields.hidden = !showVideo;
    videoFields.disabled = !showVideo || busy;
    resampleButton.disabled = !showVideo || busy;
  }

  function applyParsed(nextParsed, kind, name, statusMessage) {
    parsed = nextParsed;
    sourceKind = kind;
    fileName = name;
    startInput.min = "0";
    endInput.min = "0";
    startInput.max = String(parsed.frames.length - 1);
    endInput.max = String(parsed.frames.length - 1);
    startInput.value = "0";
    endInput.value = String(parsed.frames.length - 1);
    metaText.textContent =
      (kind === "video" ? "Video → GIF · " : "GIF · ") +
      parsed.width +
      "×" +
      parsed.height +
      " · " +
      parsed.frames.length +
      " frame" +
      (parsed.frames.length === 1 ? "" : "s");
    syncControlsEnabled(true, kind);
    updateSliceLabels();
    restartPreview();
    setStatus(statusMessage || "");
  }

  function clearAll() {
    stopPlayback();
    revokeObjectUrl();
    parsed = null;
    sourceFile = null;
    sourceKind = null;
    fileName = "gif";
    busy = false;
    fileInput.value = "";
    fpsInput.value = String(U.DEFAULT_FPS);
    startInput.value = "0";
    endInput.value = "0";
    startInput.max = "0";
    endInput.max = "0";
    textInput.value = "";
    fontSelect.selectedIndex = 0;
    fontSizeInput.value = "32";
    boldInput.checked = true;
    italicInput.checked = false;
    fillInput.value = "#ffffff";
    strokeInput.value = "#000000";
    strokeWidthInput.value = "3";
    positionSelect.value = "top";
    alignSelect.value = "center";
    preview.innerHTML =
      '<p class="tool-hint">Upload a GIF or video to preview the sliced result here.</p>';
    previewCanvas = null;
    previewCtx = null;
    syncControlsEnabled(false, null);
    setStatus("");
  }

  function onRangeChange() {
    if (!parsed) {
      return;
    }
    var start = Number(startInput.value);
    var end = Number(endInput.value);
    if (start > end) {
      if (this === startInput) {
        endInput.value = String(start);
      } else {
        startInput.value = String(end);
      }
    }
    updateSliceLabels();
    restartPreview();
  }

  function onStyleChange() {
    if (!parsed) {
      return;
    }
    var range = currentRange();
    var idx = displayIndex;
    if (idx < range.start || idx > range.end) {
      idx = range.start;
    }
    drawFrame(parsed.frames[idx], idx);
  }

  function loadGifArrayBuffer(buffer, file) {
    var next = U.parseGif(buffer);
    var base = (file.name || "gif").replace(/\.gif$/i, "") || "gif";
    applyParsed(next, "gif", base, "Loaded " + (file.name || "GIF") + ". Adjust the slice and text, then export.");
  }

  function extractFramesFromVideoElement(video, plan, onProgress, done) {
    var canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    var ctx = canvas.getContext("2d");
    var frames = [];
    var i = 0;

    function fail(err) {
      done(err || new Error("Could not read video frames."));
    }

    function captureAt(index) {
      if (index >= plan.times.length) {
        done(null, {
          width: plan.width,
          height: plan.height,
          loopCount: 0,
          sourceType: "video",
          frames: frames
        });
        return;
      }

      var target = plan.times[index];
      var settled = false;

      function finishSeek() {
        if (settled) {
          return;
        }
        settled = true;
        video.removeEventListener("seeked", onSeeked);
        try {
          ctx.drawImage(video, 0, 0, plan.width, plan.height);
          var imageData = ctx.getImageData(0, 0, plan.width, plan.height);
          frames.push({
            delayCs: plan.delayCs,
            disposal: 1,
            left: 0,
            top: 0,
            width: plan.width,
            height: plan.height,
            pixels: new Uint8ClampedArray(imageData.data)
          });
          if (onProgress) {
            onProgress(index + 1, plan.times.length);
          }
          captureAt(index + 1);
        } catch (err) {
          fail(err);
        }
      }

      function onSeeked() {
        finishSeek();
      }

      video.addEventListener("seeked", onSeeked);
      try {
        // If already very close, still assign to force a seeked in most browsers.
        video.currentTime = target;
      } catch (err) {
        video.removeEventListener("seeked", onSeeked);
        fail(err);
        return;
      }

      // Fallback if seeked never fires (already at time).
      setTimeout(function () {
        if (!settled && Math.abs(video.currentTime - target) < 0.05) {
          finishSeek();
        }
      }, 250);
    }

    captureAt(0);
  }

  function loadVideoFile(file, fps) {
    busy = true;
    syncControlsEnabled(!!parsed, "video");
    setStatus("Loading video…");
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(file);

    var video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("crossorigin", "anonymous");

    var cleanedUp = false;
    function cleanupVideo() {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      video.removeAttribute("src");
      video.load();
    }

    function fail(err) {
      busy = false;
      cleanupVideo();
      syncControlsEnabled(!!parsed, sourceKind);
      setStatus((err && err.message) || "Could not read that video.", true);
    }

    video.onerror = function () {
      fail(new Error("Browser could not decode that video. Try MP4 (H.264) or WebM."));
    };

    video.onloadedmetadata = function () {
      try {
        if (!video.videoWidth || !video.videoHeight) {
          throw new Error("Video has no visual frames.");
        }
        var plan = U.planVideoCapture({
          durationSec: video.duration,
          fps: fps,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight
        });
        U.assertFrameBudget(plan.width, plan.height, plan.frameCount);
        setStatus("Extracting frames 0/" + plan.frameCount + "…");

        extractFramesFromVideoElement(
          video,
          plan,
          function (doneCount, total) {
            setStatus("Extracting frames " + doneCount + "/" + total + "…");
          },
          function (err, result) {
            busy = false;
            cleanupVideo();
            if (err) {
              fail(err);
              return;
            }
            try {
              U.assertFrameBudget(result.width, result.height, result.frames.length);
              var base =
                (file.name || "video").replace(/\.(mp4|webm|mov|m4v|ogv|ogg|avi|mkv|mpeg|mpg|3gp)$/i, "") ||
                "video";
              var note = plan.truncated
                ? " Sampled first ~" +
                  Math.round(plan.captureDuration) +
                  "s at " +
                  plan.fps +
                  " fps."
                : " Sampled at " + plan.fps + " fps.";
              applyParsed(
                result,
                "video",
                base,
                "Loaded " + (file.name || "video") + "." + note + " Adjust the slice and text, then export."
              );
            } catch (applyErr) {
              fail(applyErr);
            }
          }
        );
      } catch (err) {
        fail(err);
      }
    };

    video.src = objectUrl;
  }

  function loadSelectedFile(file) {
    try {
      U.assertFileSize(file);
    } catch (err) {
      setStatus(err.message, true);
      return;
    }

    sourceFile = file;
    stopPlayback();

    if (U.isGifFile(file)) {
      videoFields.hidden = true;
      setStatus("Reading GIF…");
      var reader = new FileReader();
      reader.onload = function () {
        try {
          loadGifArrayBuffer(reader.result, file);
        } catch (err) {
          clearAll();
          setStatus((err && err.message) || "Could not parse that GIF.", true);
        }
      };
      reader.onerror = function () {
        setStatus("Could not read that file.", true);
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    if (U.isVideoFile(file)) {
      loadVideoFile(file, U.clampFps(fpsInput.value));
      return;
    }

    setStatus("Please choose a GIF or a common video file (MP4, WebM, MOV, …).", true);
  }

  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) {
      return;
    }
    loadSelectedFile(file);
  });

  resampleButton.addEventListener("click", function () {
    if (!sourceFile || sourceKind !== "video" || busy) {
      return;
    }
    loadVideoFile(sourceFile, U.clampFps(fpsInput.value));
  });

  startInput.addEventListener("input", onRangeChange);
  endInput.addEventListener("input", onRangeChange);

  [
    textInput,
    fontSelect,
    fontSizeInput,
    boldInput,
    italicInput,
    fillInput,
    strokeInput,
    strokeWidthInput,
    positionSelect,
    alignSelect
  ].forEach(function (el) {
    el.addEventListener("input", onStyleChange);
    el.addEventListener("change", onStyleChange);
  });

  exportButton.addEventListener("click", function () {
    if (!parsed || busy) {
      return;
    }
    try {
      setStatus("Encoding GIF…");
      exportButton.disabled = true;
      var range = currentRange();
      var sliced = U.sliceFrames(parsed, range.start, range.end);
      var style = currentStyle();
      if (!overlayCanvas) {
        overlayCanvas = document.createElement("canvas");
        overlayCtx = overlayCanvas.getContext("2d");
      }
      var reusable = { canvas: overlayCanvas, ctx: overlayCtx };
      var bytes = U.encodeGif(sliced, {
        renderOverlay: function (pixels, width, height) {
          U.renderOverlayOntoPixels(pixels, width, height, style, null, reusable);
        }
      });
      var blob = new Blob([bytes], { type: "image/gif" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = fileName + "-sliced.gif";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 2000);
      setStatus(
        "Exported " +
          sliced.frames.length +
          " frame" +
          (sliced.frames.length === 1 ? "" : "s") +
          " (" +
          Math.round(bytes.length / 1024) +
          " KB)."
      );
    } catch (err) {
      setStatus((err && err.message) || "Export failed.", true);
    } finally {
      exportButton.disabled = !parsed || busy;
    }
  });

  clearButton.addEventListener("click", function () {
    clearAll();
  });
})();
