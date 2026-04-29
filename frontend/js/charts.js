/* Funciones de gráficos con Chart.js */

const COLORS = {
  blue:    '#2563eb',
  red:     '#dc2626',
  green:   '#16a34a',
  amber:   '#d97706',
  gray:    '#94a3b8',
  navy:    '#1a2e4a',
  cl:      '#2563eb',
  ucl:     '#dc2626',
  lcl:     '#dc2626',
  point:   '#1a2e4a',
  outCtrl: '#dc2626',
  normal:  'rgba(37,99,235,0.15)'
};

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      mode: 'index',
      intersect: false,
      backgroundColor: '#1a2e4a',
      titleColor: '#e2eaf2',
      bodyColor: '#c8d8ea',
      borderColor: '#243d5c',
      borderWidth: 1
    }
  },
  scales: {
    x: {
      grid: { color: '#f1f5f9' },
      ticks: { color: '#94a3b8', font: { size: 11 }, maxTicksLimit: 20 }
    },
    y: {
      grid: { color: '#f1f5f9' },
      ticks: { color: '#94a3b8', font: { size: 11 } }
    }
  },
  elements: {
    point: { radius: 4, hoverRadius: 6, borderWidth: 2 },
    line:  { tension: 0.1, borderWidth: 2 }
  }
};

function limitLine(points, value, color, label, dash = []) {
  return {
    label,
    data: points.map(() => value),
    borderColor: color,
    borderWidth: 1.5,
    borderDash: dash,
    pointRadius: 0,
    fill: false
  };
}

/* ── Carta de control (X̄-R, X̄-S, I-MR) ────────────────── */
function renderControlChart(canvasId, chartData, outOfControl = [], labels = []) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  // Destruir instancia previa si existe
  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();

  // Detectar qué subgráfico se usa (xbar o i)
  const mainKey  = chartData.i   ? 'i'    : 'xbar';
  const secKey   = chartData.mr  ? 'mr'   :
                   chartData.r   ? 'r'    : 's';
  const mainData = chartData[mainKey];

  const pointColors = mainData.points.map((_, i) =>
    outOfControl.includes(i) ? COLORS.outCtrl : COLORS.point
  );
  const pointBgColors = mainData.points.map((_, i) =>
    outOfControl.includes(i) ? '#fee2e2' : '#eff6ff'
  );

  const axisLabels = labels.length ? labels : mainData.points.map((_, i) => `${i + 1}`);

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: axisLabels,
      datasets: [
        limitLine(mainData.points, mainData.ucl, COLORS.ucl, 'LCS'),
        limitLine(mainData.points, mainData.cl,  COLORS.cl,  'LC', [6, 3]),
        limitLine(mainData.points, mainData.lcl, COLORS.lcl, 'LCI'),
        {
          label: mainKey === 'i' ? 'Individual' : 'Media (X̄)',
          data: mainData.points,
          borderColor: COLORS.navy,
          backgroundColor: pointBgColors,
          pointBackgroundColor: pointBgColors,
          pointBorderColor: pointColors,
          fill: false
        }
      ]
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: {
          display: true,
          position: 'top',
          labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 }, color: '#475569' }
        },
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${Number(ctx.raw).toFixed(4)}`
          }
        }
      }
    }
  });
}

function renderSecondaryChart(canvasId, chartData, labels = []) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();

  const secKey  = chartData.mr ? 'mr' : chartData.r ? 'r' : 's';
  const secData = chartData[secKey];
  if (!secData) return null;

  const secLabel = { mr: 'Rango Móvil', r: 'Rango', s: 'Desv. Estándar' };
  const axisLabels = labels.length ? labels.slice(secKey === 'mr' ? 1 : 0) : secData.points.map((_, i) => `${i + 1}`);

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: axisLabels,
      datasets: [
        limitLine(secData.points, secData.ucl, COLORS.ucl, 'LCS'),
        limitLine(secData.points, secData.cl,  COLORS.cl,  'LC', [6, 3]),
        ...(secData.lcl > 0 ? [limitLine(secData.points, secData.lcl, COLORS.lcl, 'LCI')] : []),
        {
          label: secLabel[secKey] || secKey,
          data: secData.points,
          borderColor: COLORS.amber,
          backgroundColor: 'rgba(217,119,6,0.1)',
          pointBackgroundColor: 'rgba(217,119,6,0.2)',
          pointBorderColor: COLORS.amber,
          fill: false
        }
      ]
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: {
          display: true,
          position: 'top',
          labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 }, color: '#475569' }
        }
      }
    }
  });
}

/* ── Histograma con anotaciones de especificaciones ─────── */
function renderHistogram(canvasId, histogram, normalCurve, usl, lsl, nominal) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();

  const { labels, midpoints, frequencies, binWidth } = histogram;

  // Colorear barras por zona (rojo fuera de specs, azul dentro)
  const bgColors  = (midpoints || []).map(x =>
    (lsl != null && x < lsl) || (usl != null && x > usl)
      ? 'rgba(220,38,38,0.35)' : 'rgba(37,99,235,0.35)');
  const brdColors = (midpoints || []).map(x =>
    (lsl != null && x < lsl) || (usl != null && x > usl)
      ? 'rgba(220,38,38,0.7)'  : 'rgba(37,99,235,0.7)');

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Frecuencia',
        data: frequencies,
        backgroundColor: bgColors.length ? bgColors : 'rgba(37,99,235,0.35)',
        borderColor:     brdColors.length ? brdColors : 'rgba(37,99,235,0.7)',
        borderWidth: 1
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        annotation: {
          annotations: buildHistogramAnnotations(usl, lsl, nominal, midpoints, binWidth)
        }
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 12 }
        },
        y: {
          min: 0,
          grid: { color: '#f1f5f9' },
          ticks: { color: '#94a3b8', font: { size: 11 } },
          title: { display: true, text: 'Frecuencia', color: '#94a3b8', font: { size: 11 } }
        }
      }
    }
  });
}

function buildHistogramAnnotations(usl, lsl, nominal, midpoints, binWidth) {
  const anns = {};
  if (!midpoints || !midpoints.length || !binWidth) return anns;

  // Convert a numeric value to fractional bar index
  // bar i is centered at midpoints[i]; (v - midpoints[0]) / binWidth gives exact index
  const toIdx = v => (v - midpoints[0]) / binWidth;
  const lastIdx = midpoints.length - 1;

  if (lsl != null) {
    const idx = toIdx(lsl);
    anns.zoneLeft = {
      type: 'box', xMin: -0.5, xMax: idx, backgroundColor: 'rgba(220,38,38,0.07)', borderWidth: 0
    };
    anns.lsl = {
      type: 'line', scaleID: 'x', value: idx,
      borderColor: COLORS.red, borderWidth: 2.5,
      label: {
        content: `LSI: ${Number(lsl).toFixed(3)}`, display: true, position: 'end', yAdjust: -8,
        backgroundColor: 'rgba(220,38,38,0.88)', color: '#fff',
        font: { size: 11, weight: 'bold' }, padding: { x: 6, y: 3 }, borderRadius: 4
      }
    };
  }

  if (usl != null) {
    const idx = toIdx(usl);
    anns.zoneRight = {
      type: 'box', xMin: idx, xMax: lastIdx + 0.5, backgroundColor: 'rgba(220,38,38,0.07)', borderWidth: 0
    };
    anns.usl = {
      type: 'line', scaleID: 'x', value: idx,
      borderColor: COLORS.red, borderWidth: 2.5,
      label: {
        content: `LSE: ${Number(usl).toFixed(3)}`, display: true, position: 'end', yAdjust: -8,
        backgroundColor: 'rgba(220,38,38,0.88)', color: '#fff',
        font: { size: 11, weight: 'bold' }, padding: { x: 6, y: 3 }, borderRadius: 4
      }
    };
  }

  if (lsl != null && usl != null) {
    anns.zoneGreen = {
      type: 'box', xMin: toIdx(lsl), xMax: toIdx(usl),
      backgroundColor: 'rgba(34,197,94,0.06)', borderWidth: 0
    };
  }

  if (nominal != null && !isNaN(nominal)) {
    anns.nominal = {
      type: 'line', scaleID: 'x', value: toIdx(nominal),
      borderColor: COLORS.green, borderWidth: 2, borderDash: [7, 4],
      label: {
        content: `Nominal: ${Number(nominal).toFixed(3)}`, display: true, position: 'start', yAdjust: 8,
        backgroundColor: 'rgba(22,163,74,0.88)', color: '#fff',
        font: { size: 11, weight: 'bold' }, padding: { x: 6, y: 3 }, borderRadius: 4
      }
    };
  }

  return anns;
}

/* ── Gráfico de capacidad (campana + límites) ────────────── */
function renderCapabilityChart(canvasId, usl, lsl, nominal, xbar, sigma) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();

  const nomVal = (nominal != null && !isNaN(nominal)) ? nominal : xbar;
  const spread = Math.max(
    usl != null ? Math.abs(usl - nomVal) : 0,
    lsl != null ? Math.abs(lsl - nomVal) : 0,
    4 * sigma
  );
  const xMin = nomVal - spread * 1.3;
  const xMax = nomVal + spread * 1.3;

  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const x = xMin + i * (xMax - xMin) / 120;
    const y = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - xbar) / sigma) ** 2);
    pts.push({ x, y });
  }

  const yMax = Math.max(...pts.map(p => p.y)) * 1.2;

  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Distribución Normal',
        data: pts,
        parsing: false,
        borderColor: COLORS.blue,
        borderWidth: 2.5,
        fill: 'origin',
        pointRadius: 0,
        tension: 0.4,
        segment: {
          backgroundColor: ctx2 => {
            const x = pts[ctx2.p1DataIndex]?.x ?? 0;
            if ((lsl != null && x < lsl) || (usl != null && x > usl)) {
              return 'rgba(220,38,38,0.2)';
            }
            return 'rgba(37,99,235,0.12)';
          }
        }
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      elements: { point: { radius: 0 }, line: { tension: 0.4, borderWidth: 2.5 } },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        annotation: {
          annotations: buildCapabilityAnnotations(usl, lsl, nominal, xbar, xMin, xMax, yMax)
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: xMin,
          max: xMax,
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            maxTicksLimit: 10,
            callback: v => Number(v).toFixed(2)
          }
        },
        y: {
          min: 0,
          max: yMax,
          grid: { color: '#f1f5f9' },
          ticks: { color: '#94a3b8', font: { size: 10 } },
          title: { display: true, text: 'Densidad', color: '#94a3b8', font: { size: 11 } }
        }
      }
    }
  });
}

function buildCapabilityAnnotations(usl, lsl, nominal, xbar, xMin, xMax, yMax) {
  const anns = {};

  // Zona roja fuera de especificaciones
  if (lsl != null) {
    anns.zoneLeft = {
      type: 'box', xMin, xMax: lsl, yMin: 0, yMax,
      backgroundColor: 'rgba(220,38,38,0.07)', borderWidth: 0
    };
  }
  if (usl != null) {
    anns.zoneRight = {
      type: 'box', xMin: usl, xMax, yMin: 0, yMax,
      backgroundColor: 'rgba(220,38,38,0.07)', borderWidth: 0
    };
  }
  if (lsl != null && usl != null) {
    anns.zoneGreen = {
      type: 'box', xMin: lsl, xMax: usl, yMin: 0, yMax,
      backgroundColor: 'rgba(34,197,94,0.06)', borderWidth: 0
    };
  }

  // LSI — línea roja sólida
  if (lsl != null) {
    anns.lsl = {
      type: 'line', scaleID: 'x', value: lsl,
      borderColor: COLORS.red, borderWidth: 2.5,
      label: {
        content: `LSI: ${Number(lsl).toFixed(3)}`,
        display: true, position: 'end', yAdjust: -8,
        backgroundColor: 'rgba(220,38,38,0.88)',
        color: '#fff', font: { size: 11, weight: 'bold' },
        padding: { x: 6, y: 3 }, borderRadius: 4
      }
    };
  }

  // LSE — línea roja sólida
  if (usl != null) {
    anns.usl = {
      type: 'line', scaleID: 'x', value: usl,
      borderColor: COLORS.red, borderWidth: 2.5,
      label: {
        content: `LSE: ${Number(usl).toFixed(3)}`,
        display: true, position: 'end', yAdjust: -8,
        backgroundColor: 'rgba(220,38,38,0.88)',
        color: '#fff', font: { size: 11, weight: 'bold' },
        padding: { x: 6, y: 3 }, borderRadius: 4
      }
    };
  }

  // Nominal — línea verde punteada
  if (nominal != null && !isNaN(nominal)) {
    anns.nominal = {
      type: 'line', scaleID: 'x', value: nominal,
      borderColor: COLORS.green, borderWidth: 2, borderDash: [7, 4],
      label: {
        content: `Nominal: ${Number(nominal).toFixed(3)}`,
        display: true, position: 'start', yAdjust: 8,
        backgroundColor: 'rgba(22,163,74,0.88)',
        color: '#fff', font: { size: 11, weight: 'bold' },
        padding: { x: 6, y: 3 }, borderRadius: 4
      }
    };
  }

  // Media X̄ — línea azul sólida
  if (xbar != null) {
    anns.xbar = {
      type: 'line', scaleID: 'x', value: xbar,
      borderColor: COLORS.blue, borderWidth: 2.5,
      label: {
        content: `X̄: ${Number(xbar).toFixed(3)}`,
        display: true, position: 'start', yAdjust: 38,
        backgroundColor: 'rgba(37,99,235,0.88)',
        color: '#fff', font: { size: 11, weight: 'bold' },
        padding: { x: 6, y: 3 }, borderRadius: 4
      }
    };
  }

  return anns;
}

function buildSpecAnnotations(usl, lsl, nominal, xbar) {
  const anns = {};
  if (usl != null) {
    anns.usl = {
      type: 'line', scaleID: 'x', value: String(Number(usl).toFixed(3)),
      borderColor: COLORS.red, borderWidth: 2, borderDash: [4, 4],
      label: { content: `LSE: ${usl}`, display: true, position: 'start', font: { size: 10 } }
    };
  }
  if (lsl != null) {
    anns.lsl = {
      type: 'line', scaleID: 'x', value: String(Number(lsl).toFixed(3)),
      borderColor: COLORS.red, borderWidth: 2, borderDash: [4, 4],
      label: { content: `LSI: ${lsl}`, display: true, position: 'start', font: { size: 10 } }
    };
  }
  if (nominal != null) {
    anns.nominal = {
      type: 'line', scaleID: 'x', value: String(Number(nominal).toFixed(3)),
      borderColor: COLORS.green, borderWidth: 1.5, borderDash: [6, 3],
      label: { content: `Nominal: ${nominal}`, display: true, position: 'end', font: { size: 10 } }
    };
  }
  if (xbar != null) {
    anns.xbar = {
      type: 'line', scaleID: 'x', value: String(Number(xbar).toFixed(3)),
      borderColor: COLORS.amber, borderWidth: 2,
      label: { content: `X̄: ${Number(xbar).toFixed(3)}`, display: true, position: 'center', font: { size: 10 } }
    };
  }
  return anns;
}

/* ── Mini sparkline para el dashboard ───────────────────── */
function renderMiniSparkline(canvasId, values) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !values || !values.length) return;

  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: values.map((_, i) => i + 1),
      datasets: [{
        data: values,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        pointRadius: 0,
        tension: 0.3
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } }
    }
  });
}
