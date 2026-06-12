const SVG_NS = "http://www.w3.org/2000/svg";
const CX = 24, CY = 24, R = 18;

function pt(angleDeg, r = R) {
  const rad = angleDeg * Math.PI / 180;
  return [+(CX + r * Math.sin(rad)).toFixed(2), +(CY - r * Math.cos(rad)).toFixed(2)];
}

function arcD(fromDeg, toDeg) {
  const [sx, sy] = pt(fromDeg);
  const [ex, ey] = pt(toDeg);
  const sweep = ((toDeg - fromDeg) % 360 + 360) % 360;
  return `M ${sx} ${sy} A ${R} ${R} 0 ${sweep > 180 ? 1 : 0} 1 ${ex} ${ey}`;
}

export class StepKnob {
  constructor({ label, options, value, onChange }) {
    this.options = options; // [{ value, label }, ...]
    this.count = options.length;
    this.idx = Math.max(0, options.findIndex(o => o.value === value));
    this.onChange = onChange;

    const el = document.createElement("div");
    el.className = "knob-unit";

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.classList.add("knob-svg");
    svg.style.cursor = "pointer";

    const track = document.createElementNS(SVG_NS, "path");
    track.classList.add("knob-track");
    track.setAttribute("d", arcD(225, 135));
    svg.appendChild(track);

    const fill = document.createElementNS(SVG_NS, "path");
    fill.classList.add("knob-fill");
    svg.appendChild(fill);

    const body = document.createElementNS(SVG_NS, "circle");
    body.classList.add("knob-body");
    body.setAttribute("cx", CX); body.setAttribute("cy", CY); body.setAttribute("r", "13");
    svg.appendChild(body);

    // Fixed position dots for each step — placed outside the track arc
    this._stepDots = options.map((_, i) => {
      const angle = 225 + (270 / (this.count - 1)) * i;
      const [x, y] = pt(angle, R + 5);
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("r", "2.5");
      svg.appendChild(dot);
      return dot;
    });

    const labelEl = document.createElement("div");
    labelEl.className = "knob-label";
    labelEl.textContent = label;

    const readout = document.createElement("div");
    readout.className = "knob-readout";

    el.append(svg, labelEl, readout);
    this.el = el;
    this._fill = fill;
    this._readout = readout;

    this._setupDrag(svg);
    this._updateVisual();
  }

  _setupDrag(svg) {
    const THRESHOLD = 32;
    let startY, startIdx, dragged;

    const move = (clientY) => {
      const steps = Math.round((startY - clientY) / THRESHOLD);
      const newIdx = Math.max(0, Math.min(this.count - 1, startIdx + steps));
      if (Math.abs(startY - clientY) > 6) dragged = true;
      if (newIdx !== this.idx) {
        this.idx = newIdx;
        this._updateVisual();
        this.onChange(this.options[this.idx].value);
      }
    };

    svg.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startY = e.clientY; startIdx = this.idx; dragged = false;
      document.body.style.cursor = "ns-resize";
      const mm = (e) => move(e.clientY);
      const up = () => {
        document.removeEventListener("mousemove", mm);
        document.removeEventListener("mouseup", up);
        document.body.style.cursor = "";
        if (!dragged) this._step(1);
      };
      document.addEventListener("mousemove", mm);
      document.addEventListener("mouseup", up);
    });

    svg.addEventListener("touchstart", (e) => {
      e.preventDefault();
      startY = e.touches[0].clientY; startIdx = this.idx; dragged = false;
      const tm = (e) => { e.preventDefault(); move(e.touches[0].clientY); };
      const te = () => {
        document.removeEventListener("touchmove", tm);
        document.removeEventListener("touchend", te);
        if (!dragged) this._step(1);
      };
      document.addEventListener("touchmove", tm, { passive: false });
      document.addEventListener("touchend", te);
    }, { passive: false });
  }

  _step(dir) {
    this.idx = (this.idx + dir + this.count) % this.count;
    this._updateVisual();
    this.onChange(this.options[this.idx].value);
  }

  setValue(val, trigger = false) {
    const idx = this.options.findIndex(o => o.value === val);
    if (idx >= 0) this.idx = idx;
    this._updateVisual();
    if (trigger) this.onChange(this.options[this.idx].value);
  }

  _updateVisual() {
    const t = this.idx / (this.count - 1);
    const angle = 225 + t * 270;

    this._fill.setAttribute("d", this.idx === 0 ? "" : arcD(225, angle));

    this._stepDots.forEach((dot, i) => {
      const selected = i === this.idx;
      dot.setAttribute("r", selected ? "3" : "1.8");
      dot.setAttribute("fill", selected ? "#3ecfaa" : "rgba(247,243,232,0.25)");
    });

    this._readout.textContent = this.options[this.idx].label;
  }
}

export class Knob {
  constructor({ label, min, max, value, format, onChange, onTap }) {
    this.min = min;
    this.max = max;
    this.format = format || (v => String(Math.round(v)));
    this.onChange = onChange;
    this.onTap = onTap || null;
    this.value = value;
    this.defaultValue = value;

    const el = document.createElement("div");
    el.className = "knob-unit";

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.classList.add("knob-svg");

    const track = document.createElementNS(SVG_NS, "path");
    track.classList.add("knob-track");
    track.setAttribute("d", arcD(225, 135)); // 270° clockwise arc

    const fill = document.createElementNS(SVG_NS, "path");
    fill.classList.add("knob-fill");

    const body = document.createElementNS(SVG_NS, "circle");
    body.classList.add("knob-body");
    body.setAttribute("cx", CX); body.setAttribute("cy", CY); body.setAttribute("r", "13");

    const indicator = document.createElementNS(SVG_NS, "line");
    indicator.classList.add("knob-indicator");
    indicator.setAttribute("x1", CX); indicator.setAttribute("y1", CY);

    svg.append(track, fill, body, indicator);

    const labelEl = document.createElement("div");
    labelEl.className = "knob-label";
    labelEl.textContent = label;

    const readout = document.createElement("div");
    readout.className = "knob-readout";

    el.append(svg, labelEl, readout);

    this.el = el;
    this._fill = fill;
    this._indicator = indicator;
    this._readout = readout;

    this._setupDrag(svg);
    this._updateVisual();
    readout.textContent = this.format(this.value);
  }

  setValue(val, trigger = true) {
    this.value = Math.max(this.min, Math.min(this.max, val));
    this._updateVisual();
    if (trigger) this.onChange(this.value);
  }

  _t() {
    return (this.value - this.min) / (this.max - this.min);
  }

  _updateVisual() {
    const t = this._t();
    const angle = 225 + t * 270;

    if (t < 0.002) {
      this._fill.setAttribute("d", "");
    } else {
      this._fill.setAttribute("d", arcD(225, angle));
    }

    const [dx, dy] = pt(angle, R - 2);
    this._indicator.setAttribute("x2", dx);
    this._indicator.setAttribute("y2", dy);

    this._readout.textContent = this.format(this.value);
  }

  _setupDrag(svg) {
    let startY, startVal, dragged;
    let lastTap = 0;
    const DOUBLE_MS = 350;

    const tryReset = () => {
      const now = Date.now();
      if (now - lastTap < DOUBLE_MS) {
        this.setValue(this.defaultValue);
        lastTap = 0;
      } else {
        lastTap = now;
        this.onTap?.();
      }
    };

    const move = (clientY) => {
      if (Math.abs(startY - clientY) > 4) dragged = true;
      const delta = startY - clientY;
      const newVal = startVal + (delta / 120) * (this.max - this.min);
      this.setValue(newVal);
    };

    svg.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startY = e.clientY;
      startVal = this.value;
      dragged = false;
      document.body.style.cursor = "ns-resize";
      const mm = (e) => move(e.clientY);
      const up = () => {
        document.removeEventListener("mousemove", mm);
        document.removeEventListener("mouseup", up);
        document.body.style.cursor = "";
        if (!dragged) tryReset();
      };
      document.addEventListener("mousemove", mm);
      document.addEventListener("mouseup", up);
    });

    svg.addEventListener("touchstart", (e) => {
      e.preventDefault();
      startY = e.touches[0].clientY;
      startVal = this.value;
      dragged = false;
      const tm = (e) => { e.preventDefault(); move(e.touches[0].clientY); };
      const te = () => {
        document.removeEventListener("touchmove", tm);
        document.removeEventListener("touchend", te);
        if (!dragged) tryReset();
      };
      document.addEventListener("touchmove", tm, { passive: false });
      document.addEventListener("touchend", te);
    }, { passive: false });
  }
}
