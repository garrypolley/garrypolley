(function () {
  var root = document.getElementById("svgToPngTool");
  if (!root) {
    return;
  }

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
  var lastFileName = "image";

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", !!isError);
  }

  function revokePngUrl() {
    if (pngObjectUrl) {
      URL.revokeObjectURL(pngObjectUrl);
      pngObjectUrl = null;
    }
  }

  function clearPng() {
    revokePngUrl();
    pngPreview.innerHTML = "";
    downloadButton.disabled = true;
    downloadButton.removeAttribute("data-href");
  }

  function normalizeSvg(raw) {
    var text = (raw || "").trim();
    if (!text) {
      throw new Error("Paste SVG markup or choose an .svg file first.");
    }

    // Allow pasting a fragment that starts mid-document.
    if (text.indexOf("<svg") === -1) {
      throw new Error("Could not find an <svg> element in the input.");
    }

    if (text.indexOf("<svg") > 0) {
      text = text.slice(text.indexOf("<svg"));
    }

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

    ensureSvgSize(svg);

    return new XMLSerializer().serializeToString(svg);
  }

  function ensureSvgSize(svg) {
    var width = parseFloat(svg.getAttribute("width"));
    var height = parseFloat(svg.getAttribute("height"));
    var viewBox = svg.getAttribute("viewBox");

    if ((!width || !height) && viewBox) {
      var parts = viewBox.trim().split(/[\s,]+/);
      if (parts.length === 4) {
        width = width || parseFloat(parts[2]);
        height = height || parseFloat(parts[3]);
      }
    }

    if (!width || !height || width <= 0 || height <= 0) {
      width = width || 300;
      height = height || 150;
    }

    if (!svg.getAttribute("width")) {
      svg.setAttribute("width", String(width));
    }
    if (!svg.getAttribute("height")) {
      svg.setAttribute("height", String(height));
    }
    if (!viewBox) {
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    }
  }

  function readSize(svgText) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(svgText, "image/svg+xml");
    var svg = doc.documentElement;
    var width = parseFloat(svg.getAttribute("width"));
    var height = parseFloat(svg.getAttribute("height"));
    var viewBox = svg.getAttribute("viewBox");

    if ((!width || !height) && viewBox) {
      var parts = viewBox.trim().split(/[\s,]+/);
      if (parts.length === 4) {
        width = width || parseFloat(parts[2]);
        height = height || parseFloat(parts[3]);
      }
    }

    return {
      width: width || 300,
      height: height || 150,
    };
  }

  function showSvgPreview(svgText) {
    svgPreview.innerHTML = svgText;
  }

  function convert(svgText) {
    var normalized = normalizeSvg(svgText);
    var scale = parseFloat(scaleInput.value);
    if (!scale || scale <= 0) {
      scale = 1;
    }

    showSvgPreview(normalized);
    clearPng();
    setStatus("Converting…");

    var size = readSize(normalized);
    var width = Math.max(1, Math.round(size.width * scale));
    var height = Math.max(1, Math.round(size.height * scale));

    var blob = new Blob([normalized], { type: "image/svg+xml;charset=utf-8" });
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
          URL.revokeObjectURL(url);
          if (!pngBlob) {
            setStatus("Browser could not create a PNG from this SVG.", true);
            return;
          }

          revokePngUrl();
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
        URL.revokeObjectURL(url);
        setStatus(err.message || "Conversion failed.", true);
      }
    };

    image.onerror = function () {
      URL.revokeObjectURL(url);
      setStatus("Could not render the SVG. External images or scripts inside SVG may be blocked.", true);
    };

    image.src = url;
  }

  function currentSvgText() {
    return pasteInput.value;
  }

  convertButton.addEventListener("click", function () {
    try {
      convert(currentSvgText());
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
    svgPreview.innerHTML = "";
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
        showSvgPreview(normalizeSvg(pasteInput.value));
        clearPng();
      } catch (err) {
        svgPreview.innerHTML = "";
        setStatus(err.message || "Could not preview that file.", true);
      }
    };
    reader.onerror = function () {
      setStatus("Could not read that file.", true);
    };
    reader.readAsText(file);
  });
})();
