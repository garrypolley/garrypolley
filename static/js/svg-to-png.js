var SvgToPngUtils = (function () {
  var MIN_SCALE = 0.25;
  var MAX_SCALE = 8;
  var MAX_DIMENSION = 8192;
  var MAX_PIXELS = 16 * 1024 * 1024; // 16MP safety cap
  var DEFAULT_WIDTH = 300;
  var DEFAULT_HEIGHT = 150;

  function clampScale(value) {
    var scale = parseFloat(value);
    if (!isFinite(scale) || scale <= 0) {
      return 1;
    }
    if (scale < MIN_SCALE) {
      return MIN_SCALE;
    }
    if (scale > MAX_SCALE) {
      return MAX_SCALE;
    }
    return scale;
  }

  function findSvgStart(text) {
    var match = String(text || "").match(/<svg\b/i);
    return match ? match.index : -1;
  }

  // Returns { value, unit } for SVG length attributes. Percentages are not usable as px.
  function parseLength(raw) {
    if (raw == null || raw === "") {
      return null;
    }
    var text = String(raw).trim();
    var match = text.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i);
    if (!match) {
      return null;
    }
    var value = parseFloat(match[1]);
    if (!isFinite(value) || value <= 0) {
      return null;
    }
    var unit = (match[2] || "px").toLowerCase() || "px";
    return { value: value, unit: unit };
  }

  function lengthToPx(length) {
    if (!length) {
      return null;
    }
    // Only absolute-ish units we can safely map without layout context.
    switch (length.unit) {
      case "px":
      case "":
        return length.value;
      case "pt":
        return length.value * (96 / 72);
      case "pc":
        return length.value * 16;
      case "in":
        return length.value * 96;
      case "cm":
        return length.value * (96 / 2.54);
      case "mm":
        return length.value * (96 / 25.4);
      default:
        // %, em, rem, ex, ch, vw, vh, etc. need layout — fall back to viewBox/defaults.
        return null;
    }
  }

  function parseViewBox(viewBox) {
    if (!viewBox) {
      return null;
    }
    var parts = String(viewBox).trim().split(/[\s,]+/);
    if (parts.length !== 4) {
      return null;
    }
    var width = parseFloat(parts[2]);
    var height = parseFloat(parts[3]);
    if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    return { width: width, height: height };
  }

  function resolveDimensions(widthAttr, heightAttr, viewBoxAttr) {
    var width = lengthToPx(parseLength(widthAttr));
    var height = lengthToPx(parseLength(heightAttr));
    var viewBox = parseViewBox(viewBoxAttr);

    if ((!width || !height) && viewBox) {
      width = width || viewBox.width;
      height = height || viewBox.height;
    }

    if (!width || !height) {
      width = width || DEFAULT_WIDTH;
      height = height || DEFAULT_HEIGHT;
    }

    return { width: width, height: height, viewBox: viewBox };
  }

  function clampOutputSize(width, height) {
    var w = Math.max(1, Math.round(width));
    var h = Math.max(1, Math.round(height));

    if (w > MAX_DIMENSION || h > MAX_DIMENSION || w * h > MAX_PIXELS) {
      var scale = Math.min(
        MAX_DIMENSION / w,
        MAX_DIMENSION / h,
        Math.sqrt(MAX_PIXELS / (w * h))
      );
      w = Math.max(1, Math.floor(w * scale));
      h = Math.max(1, Math.floor(h * scale));
    }

    return { width: w, height: h };
  }

  function extractSvgMarkup(raw) {
    var text = String(raw || "").trim();
    if (!text) {
      throw new Error("Paste SVG markup or choose an .svg file first.");
    }

    var start = findSvgStart(text);
    if (start === -1) {
      throw new Error("Could not find an <svg> element in the input.");
    }
    if (start > 0) {
      text = text.slice(start);
    }
    return text;
  }

  return {
    MIN_SCALE: MIN_SCALE,
    MAX_SCALE: MAX_SCALE,
    MAX_DIMENSION: MAX_DIMENSION,
    MAX_PIXELS: MAX_PIXELS,
    DEFAULT_WIDTH: DEFAULT_WIDTH,
    DEFAULT_HEIGHT: DEFAULT_HEIGHT,
    clampScale: clampScale,
    findSvgStart: findSvgStart,
    parseLength: parseLength,
    lengthToPx: lengthToPx,
    parseViewBox: parseViewBox,
    resolveDimensions: resolveDimensions,
    clampOutputSize: clampOutputSize,
    extractSvgMarkup: extractSvgMarkup,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = SvgToPngUtils;
}

(function () {
  if (typeof document === "undefined") {
    return;
  }

  var root = document.getElementById("svgToPngTool");
  if (!root) {
    return;
  }

  var utils = SvgToPngUtils;
  var pasteInput = document.getElementById("svgPaste");
  var fileInput = document.getElementById("svgFile");
  var scaleInput = document.getElementById("pngScale");
  var convertButton = document.getElementById("svgConvert");
  var downloadButton = document.getElementById("svgDownload");
  var clearButton = document.getElementById("svgClear");
  var statusEl = document.getElementById("svgStatus");
  var svgPreview = document.getElementById("svgPreview");
  var pngPreview = document.getElementById("pngPreview");

  var pngObjectUrl = null;
  var svgPreviewObjectUrl = null;
  var lastFileName = "image";

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", !!isError);
  }

  function revokeUrl(url) {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  function clearSvgPreview() {
    revokeUrl(svgPreviewObjectUrl);
    svgPreviewObjectUrl = null;
    svgPreview.innerHTML = "";
  }

  function clearPng() {
    revokeUrl(pngObjectUrl);
    pngObjectUrl = null;
    pngPreview.innerHTML = "";
    downloadButton.disabled = true;
  }

  function readAttrsFromSvgElement(svg) {
    return utils.resolveDimensions(
      svg.getAttribute("width"),
      svg.getAttribute("height"),
      svg.getAttribute("viewBox")
    );
  }

  function normalizeSvg(raw) {
    var text = utils.extractSvgMarkup(raw);

    var parser = new DOMParser();
    var doc = parser.parseFromString(text, "image/svg+xml");
    var parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error("SVG markup could not be parsed. Check for missing tags or quotes.");
    }

    var svg = doc.documentElement;
    if (!svg || svg.tagName.toLowerCase() !== "svg") {
      throw new Error("Parsed document did not contain a root <svg> element.");
    }

    if (!svg.getAttribute("xmlns")) {
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    var dims = readAttrsFromSvgElement(svg);
    var widthPx = utils.lengthToPx(utils.parseLength(svg.getAttribute("width")));
    var heightPx = utils.lengthToPx(utils.parseLength(svg.getAttribute("height")));

    // Replace missing or non-px lengths so the rasterizer gets absolute sizes.
    if (!widthPx) {
      svg.setAttribute("width", String(dims.width));
    }
    if (!heightPx) {
      svg.setAttribute("height", String(dims.height));
    }
    if (!svg.getAttribute("viewBox")) {
      svg.setAttribute("viewBox", "0 0 " + dims.width + " " + dims.height);
    }

    return {
      markup: new XMLSerializer().serializeToString(svg),
      width: dims.width,
      height: dims.height,
    };
  }

  function showSvgPreview(svgMarkup) {
    clearSvgPreview();
    var blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    svgPreviewObjectUrl = URL.createObjectURL(blob);
    var img = document.createElement("img");
    img.alt = "SVG preview";
    img.src = svgPreviewObjectUrl;
    svgPreview.appendChild(img);
  }

  function convert(svgText) {
    var normalized = normalizeSvg(svgText);
    var scale = utils.clampScale(scaleInput.value);
    scaleInput.value = String(scale);

    showSvgPreview(normalized.markup);
    clearPng();
    setStatus("Converting…");

    var sized = utils.clampOutputSize(normalized.width * scale, normalized.height * scale);
    var width = sized.width;
    var height = sized.height;

    var blob = new Blob([normalized.markup], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var image = new Image();

    image.onload = function () {
      try {
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);

        canvas.toBlob(function (pngBlob) {
          revokeUrl(url);
          if (!pngBlob) {
            setStatus("Browser could not create a PNG from this SVG.", true);
            return;
          }

          revokeUrl(pngObjectUrl);
          pngObjectUrl = URL.createObjectURL(pngBlob);
          pngPreview.innerHTML = "";
          var img = document.createElement("img");
          img.alt = "PNG preview";
          img.src = pngObjectUrl;
          pngPreview.appendChild(img);

          downloadButton.disabled = false;
          setStatus("Converted to PNG (" + width + "×" + height + ").");
        }, "image/png");
      } catch (err) {
        revokeUrl(url);
        setStatus(err.message || "Conversion failed.", true);
      }
    };

    image.onerror = function () {
      revokeUrl(url);
      setStatus("Could not render the SVG. External images or scripts inside SVG may be blocked.", true);
    };

    image.src = url;
  }

  convertButton.addEventListener("click", function () {
    try {
      convert(pasteInput.value);
    } catch (err) {
      setStatus(err.message || "Conversion failed.", true);
    }
  });

  downloadButton.addEventListener("click", function () {
    if (!pngObjectUrl) {
      return;
    }
    var link = document.createElement("a");
    link.href = pngObjectUrl;
    link.download = lastFileName.replace(/\.svg$/i, "") + ".png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  clearButton.addEventListener("click", function () {
    pasteInput.value = "";
    fileInput.value = "";
    scaleInput.value = "1";
    clearSvgPreview();
    clearPng();
    lastFileName = "image";
    setStatus("");
  });

  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) {
      return;
    }

    lastFileName = file.name || "image.svg";
    var reader = new FileReader();
    reader.onload = function () {
      pasteInput.value = String(reader.result || "");
      setStatus("Loaded " + lastFileName + ". Click Convert to PNG.");
      try {
        var normalized = normalizeSvg(pasteInput.value);
        showSvgPreview(normalized.markup);
        clearPng();
      } catch (err) {
        clearSvgPreview();
        setStatus(err.message || "Could not preview that file.", true);
      }
    };
    reader.onerror = function () {
      setStatus("Could not read that file.", true);
    };
    reader.readAsText(file);
  });
})();
