/**
 * Exportación PDF, Excel (HTML) y JSON del escenario.
 */

import { escapeHtml } from '../lib/format.js';

/**
 * @param {object} ctx
 * @param {(v: number) => string} formatCurrency
 * @param {(v: number) => string} formatNumber
 */
function downloadExcelFromScenario(ctx, formatCurrency, formatNumber) {
  const { principal, annualRate, years, baseline, scenario } = ctx;
  const headerBg = '#11213F';
  const headerFg = '#FFFFFF';
  const rowExtraBg = '#EEF4FF';
  const rowNormalBg = '#FFFFFF';
  const border = '#DBE3F0';

  const summaryRows = [
    ['Monto del préstamo', formatCurrency(principal)],
    ['Tasa de interés anual', `${annualRate}%`],
    ['Plazo', `${years} año(s)`],
    ['Cuota mensual base', formatCurrency(baseline.standardPayment)],
    ['Meses estimados', formatNumber(scenario.totalMonthsUsed)],
    ['Meses ahorrados', formatNumber(Math.max(0, baseline.totalMonthsUsed - scenario.totalMonthsUsed))],
    ['Intereses totales', formatCurrency(scenario.totalInterest)],
    ['Total pagado', formatCurrency(scenario.totalPaid)],
    ['Ahorro estimado en intereses', formatCurrency(Math.max(0, baseline.totalInterest - scenario.totalInterest))]
  ];

  let summaryHtml = summaryRows
    .map(
      ([k, v]) =>
        `<tr><td style="border:1px solid ${border};padding:6px 10px;font-weight:700;">${escapeHtml(k)}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(v)}</td></tr>`
    )
    .join('');

  if (scenario.ignoredExtras.length) {
    summaryHtml += `<tr><td colspan="2" style="border:1px solid ${border};padding:8px 10px;color:#8d2d2d;background:#fff5f5;">${escapeHtml(
      `Aviso: se ignoraron ${scenario.ignoredExtras.length} abono(s) programados tras liquidar el préstamo.`
    )}</td></tr>`;
  }

  const thead = `<tr>${['Mes', 'Cuota', 'Interés', 'Capital', 'Saldo pendiente', 'Próx. cuota regular', 'Meses restantes', 'Abono extra']
    .map(
      (h) =>
        `<th style="background-color:${headerBg};color:${headerFg};border:1px solid ${headerBg};padding:8px 10px;text-align:left;">${escapeHtml(
          h
        )}</th>`
    )
    .join('')}</tr>`;

  const tbody = scenario.rows
    .map((row) => {
      const bg = row.hasExtra ? rowExtraBg : rowNormalBg;
      const abono = row.hasExtra ? formatCurrency(row.extraApplied) : '—';
      const mes = row.hasExtra ? `${row.month} (abono)` : String(row.month);
      const nextReg = row.scheduledNextRegular !== undefined ? formatCurrency(row.scheduledNextRegular) : formatCurrency(0);
      const mesesRest =
        row.scheduleMonthsRemaining !== undefined ? formatNumber(row.scheduleMonthsRemaining) : '0';
      return (
        `<tr style="background-color:${bg};">` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(mes)}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(formatCurrency(row.payment))}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(formatCurrency(row.interest))}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(formatCurrency(row.principal))}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(formatCurrency(row.balance))}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(nextReg)}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(mesesRest)}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(abono)}</td>` +
        `</tr>`
      );
    })
    .join('');

  const footnote = scenario.rows.some((r) => r.hasExtra)
    ? `<p style="font-size:11px;color:#6f8196;margin-top:10px;">Filas con fondo azul claro: mes con abono extraordinario. La columna Abono extra muestra el monto aplicado a capital.</p>`
    : '';

  const html =
    '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">' +
    '<meta name="ExcelCreated" content="loan-calculator"></head><body>' +
    `<h2 style="font-family:Segoe UI,Arial,sans-serif;color:${headerBg};">Tabla de amortización</h2>` +
    `<p style="font-family:Segoe UI,Arial,sans-serif;color:#6f8196;font-size:12px;">Generado: ${escapeHtml(
      new Date().toLocaleString('es-DO')
    )}</p>` +
    `<table style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:12px;margin-bottom:16px;">${summaryHtml}</table>` +
    `<table style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:12px;">` +
    `<thead>${thead}</thead><tbody>${tbody}</tbody></table>${footnote}</body></html>`;

  const fname = `amortizacion-${new Date().toISOString().slice(0, 10)}.xls`;
  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {object} ctx
 * @param {(v: number) => string} formatCurrency
 * @param {(v: number) => string} formatNumber
 */
function buildPdfFromScenario(ctx, formatCurrency, formatNumber) {
  const { principal, annualRate, years, baseline, scenario } = ctx;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let y = 14;
  doc.setFontSize(16);
  doc.setTextColor(22, 48, 74);
  doc.text('Tabla de amortización', 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(80, 90, 110);
  doc.text(`Generado: ${new Date().toLocaleString('es-DO')}`, 14, y);
  y += 7;
  doc.setTextColor(22, 48, 74);

  const summaryLines = [
    `Monto del préstamo: ${formatCurrency(principal)}`,
    `Tasa de interés anual: ${annualRate}%`,
    `Plazo: ${years} año(s)`,
    `Cuota mensual base: ${formatCurrency(baseline.standardPayment)}`,
    `Meses estimados: ${formatNumber(scenario.totalMonthsUsed)}`,
    `Meses ahorrados: ${formatNumber(Math.max(0, baseline.totalMonthsUsed - scenario.totalMonthsUsed))}`,
    `Intereses totales: ${formatCurrency(scenario.totalInterest)}`,
    `Total pagado: ${formatCurrency(scenario.totalPaid)}`,
    `Ahorro estimado en intereses: ${formatCurrency(Math.max(0, baseline.totalInterest - scenario.totalInterest))}`
  ];
  summaryLines.forEach((line) => {
    doc.text(line, 14, y);
    y += 5;
  });
  y += 3;

  if (scenario.ignoredExtras.length) {
    doc.setFontSize(9);
    doc.setTextColor(180, 60, 60);
    doc.text(
      `Aviso: se ignoraron ${scenario.ignoredExtras.length} abono(s) programados tras liquidar el préstamo.`,
      14,
      y
    );
    y += 6;
    doc.setTextColor(22, 48, 74);
  }

  const body = scenario.rows.map((row) => [
    String(row.month) + (row.hasExtra ? ' *' : ''),
    formatCurrency(row.payment),
    formatCurrency(row.interest),
    formatCurrency(row.principal),
    formatCurrency(row.balance),
    row.scheduledNextRegular !== undefined ? formatCurrency(row.scheduledNextRegular) : formatCurrency(0),
    row.scheduleMonthsRemaining !== undefined ? formatNumber(row.scheduleMonthsRemaining) : '0'
  ]);

  const abonoRowFill = [238, 244, 255];

  doc.autoTable({
    startY: y,
    head: [['Mes', 'Cuota', 'Interés', 'Capital', 'Saldo pendiente', 'Próx. cuota', 'Meses rest.']],
    body,
    styles: { fontSize: 8, cellPadding: 1.8, textColor: [22, 48, 74] },
    headStyles: { fillColor: [17, 33, 63], textColor: 255 },
    margin: { left: 14, right: 14 },
    tableWidth: 'auto',
    didParseCell(data) {
      if (data.section === 'body') {
        const src = scenario.rows[data.row.index];
        if (src && src.hasExtra) {
          data.cell.styles.fillColor = abonoRowFill;
        }
      }
    }
  });

  const finalY = doc.lastAutoTable?.finalY ?? y;
  if (scenario.rows.some((r) => r.hasExtra)) {
    doc.setFontSize(8);
    doc.setTextColor(100, 110, 120);
    doc.text('* Mes con abono extraordinario.', 14, finalY + 6);
  }

  const fname = `amortizacion-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fname);
}

/**
 * @param {object} deps
 * @param {() => object | null} deps.getExportScenario
 */
export function exportExcel(deps) {
  const { getExportScenario, formatCurrency, formatNumber, showToast, alertFn = window.alert.bind(window) } = deps;
  const ctx = getExportScenario();
  if (!ctx) {
    alertFn('Completa los datos del préstamo para exportar.');
    return;
  }
  downloadExcelFromScenario(ctx, formatCurrency, formatNumber);
  showToast('La tabla de amortización se guardó en tu dispositivo.', { title: 'Excel descargado' });
}

/**
 * @param {object} deps
 */
export function exportPdf(deps) {
  const { getExportScenario, formatCurrency, formatNumber, showToast, alertFn = window.alert.bind(window) } = deps;
  const ctx = getExportScenario();
  if (!ctx) {
    alertFn('Completa los datos del préstamo para exportar.');
    return;
  }

  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    alertFn('No se pudo cargar la librería de PDF. Comprueba tu conexión e inténtalo de nuevo.');
    return;
  }

  buildPdfFromScenario(ctx, formatCurrency, formatNumber);
  showToast('La tabla de amortización se guardó en tu dispositivo.', { title: 'PDF descargado' });
}

/**
 * @param {object} payload — objeto compatible con buildLoanDataPayload
 * @param {string} filename
 */
export function downloadLoanPayloadJson(payload, filename) {
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {object} deps
 * @param {() => object | null} deps.getLoanPayload — resultado de buildLoanDataPayload
 */
export function exportLoanDataJson(deps) {
  const { getLoanPayload, showToast, alertFn = window.alert.bind(window) } = deps;
  const payload = getLoanPayload();
  if (!payload) {
    alertFn('Completa los datos del préstamo (monto y plazo válidos) para guardar el escenario.');
    return;
  }

  const fname = `prestamo-${new Date().toISOString().slice(0, 10)}.json`;
  downloadLoanPayloadJson(payload, fname);
  showToast('El archivo JSON se descargó correctamente.', { title: 'Simulación guardada' });
}
