/**
 * MiniChart — лёгкий модуль графиков на чистом SVG, без внешних зависимостей.
 * Работает офлайн. Поддерживает линейные и столбчатые диаграммы.
 *
 * Использование:
 *   MiniChart.line(el, { labels: [...], series: [{ name, color, values: [...] }], yMax });
 *   MiniChart.bar(el, { labels: [...], values: [...], colors: [...] });
 */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#3d9dff', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#22d3ee'];

  function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (const k in attrs) node.setAttribute(k, attrs[k]);
    }
    return node;
  }

  function clear(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  function createSvg(container, width, height) {
    const svg = el('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width: '100%',
      preserveAspectRatio: 'xMidYMid meet',
      class: 'minichart'
    });
    svg.style.display = 'block';
    container.appendChild(svg);
    return svg;
  }

  function emptyMessage(container) {
    clear(container);
    const p = document.createElement('div');
    p.className = 'minichart-empty';
    p.textContent = 'Нет данных для графика';
    container.appendChild(p);
  }

  function niceMax(value) {
    if (value <= 0) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(value)));
    const n = value / pow;
    let nice;
    if (n <= 1) nice = 1;
    else if (n <= 2) nice = 2;
    else if (n <= 5) nice = 5;
    else nice = 10;
    return nice * pow;
  }

  const AXIS = '#8b9cb3';
  const GRID = 'rgba(139,156,179,0.18)';

  function line(container, opts) {
    const labels = opts.labels || [];
    const series = (opts.series || []).filter((s) => s.values && s.values.length);
    if (!labels.length || !series.length) {
      emptyMessage(container);
      return;
    }
    clear(container);

    const W = 640;
    const H = 280;
    const padL = 40;
    const padR = 16;
    const padT = 16;
    const padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    let maxVal = opts.yMax;
    if (maxVal == null) {
      maxVal = 0;
      series.forEach((s) => s.values.forEach((v) => { if (v != null && v > maxVal) maxVal = v; }));
      maxVal = niceMax(maxVal || 1);
    }

    const svg = createSvg(container, W, H);
    const n = labels.length;
    const xFor = (i) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const yFor = (v) => padT + plotH - (plotH * (v / maxVal));

    // Горизонтальная сетка + подписи оси Y
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const val = (maxVal / ticks) * t;
      const y = yFor(val);
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: GRID, 'stroke-width': 1 }));
      const label = el('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end', fill: AXIS, 'font-size': 11 });
      label.textContent = Math.round(val);
      svg.appendChild(label);
    }

    // Подписи оси X (прореживаем, чтобы не наслаивались)
    const step = Math.ceil(n / 8);
    for (let i = 0; i < n; i += step) {
      const x = xFor(i);
      const label = el('text', { x, y: H - padB + 18, 'text-anchor': 'middle', fill: AXIS, 'font-size': 10 });
      label.textContent = labels[i];
      svg.appendChild(label);
    }

    // Линии серий
    series.forEach((s, si) => {
      const color = s.color || PALETTE[si % PALETTE.length];
      const pts = [];
      s.values.forEach((v, i) => {
        if (v == null) return;
        pts.push([xFor(i), yFor(v)]);
      });
      if (!pts.length) return;

      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      svg.appendChild(el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

      pts.forEach((p) => {
        const c = el('circle', { cx: p[0], cy: p[1], r: 3, fill: color });
        svg.appendChild(c);
      });
    });

    renderLegend(container, series.map((s, si) => ({
      name: s.name,
      color: s.color || PALETTE[si % PALETTE.length]
    })));
  }

  function bar(container, opts) {
    const labels = opts.labels || [];
    const values = opts.values || [];
    if (!labels.length || !values.length) {
      emptyMessage(container);
      return;
    }
    clear(container);

    const W = 640;
    const H = 280;
    const padL = 40;
    const padR = 16;
    const padT = 16;
    const padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    let maxVal = opts.yMax;
    if (maxVal == null) {
      maxVal = niceMax(Math.max.apply(null, values.concat([1])));
    }

    const svg = createSvg(container, W, H);
    const yFor = (v) => padT + plotH - (plotH * (v / maxVal));

    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const val = (maxVal / ticks) * t;
      const y = yFor(val);
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: GRID, 'stroke-width': 1 }));
      const label = el('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end', fill: AXIS, 'font-size': 11 });
      label.textContent = Math.round(val);
      svg.appendChild(label);
    }

    const n = values.length;
    const slot = plotW / n;
    const barW = Math.min(slot * 0.6, 70);
    values.forEach((v, i) => {
      const color = (opts.colors && opts.colors[i]) || PALETTE[i % PALETTE.length];
      const x = padL + slot * i + (slot - barW) / 2;
      const y = yFor(v);
      const h = padT + plotH - y;
      svg.appendChild(el('rect', { x, y, width: barW, height: Math.max(0, h), rx: 4, fill: color }));

      const valLabel = el('text', { x: x + barW / 2, y: y - 6, 'text-anchor': 'middle', fill: AXIS, 'font-size': 11 });
      valLabel.textContent = v;
      svg.appendChild(valLabel);

      const label = el('text', { x: x + barW / 2, y: H - padB + 18, 'text-anchor': 'middle', fill: AXIS, 'font-size': 11 });
      label.textContent = labels[i];
      svg.appendChild(label);
    });
  }

  function renderLegend(container, items) {
    const legend = document.createElement('div');
    legend.className = 'minichart-legend';
    items.forEach((it) => {
      if (!it.name) return;
      const span = document.createElement('span');
      span.className = 'minichart-legend-item';
      const dot = document.createElement('i');
      dot.style.background = it.color;
      span.appendChild(dot);
      span.appendChild(document.createTextNode(it.name));
      legend.appendChild(span);
    });
    if (legend.childNodes.length) container.appendChild(legend);
  }

  global.MiniChart = { line, bar, PALETTE };
})(window);
