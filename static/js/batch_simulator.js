const SAMPLE_CSV = `First Name,Last Name,Frequency,Pension Withdrawl,TaxFree Portion,Tax Code,Cummulative,YTD Gross,YTD Tax,Current Period No
Andrew,Green,Monthly,0.00,0,1257L,Yes,4475.8,475.8,3
Christopher,Scotney,Monthly,"9,900.29","9,900.29",BR,Yes,0,0,3
Edward,Bailey,Monthly,"48,000.00","48,000.00",BR,Yes,0,0,3`;

const processedResults = [];

function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return "";
}

function getApiUrl() {
  return document.getElementById("batchApp").dataset.apiUrl;
}

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      if (currentRow.some((cell) => cell.trim() !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);
  if (currentRow.some((cell) => cell.trim() !== "")) {
    rows.push(currentRow);
  }

  if (!rows.length) {
    return { headers: [], records: [] };
  }

  const headers = rows[0].map(normalizeHeader);
  const records = rows.slice(1).map((row, rowIndex) => {
    const record = { __row_number: rowIndex + 2 };
    headers.forEach((header, headerIndex) => {
      record[header] = row[headerIndex] !== undefined ? row[headerIndex].trim() : "";
    });
    return record;
  });

  return { headers, records };
}

function parseAmount(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  const cleaned = String(value).trim().replace(/,/g, "").replace(/%/g, "");
  if (!cleaned) {
    return 0;
  }
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBoolean(value, fallback = false) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return ["yes", "true", "1", "y"].includes(normalized);
}

function parseFrequency(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "monthly" || normalized === "12") {
    return 12;
  }
  if (normalized === "weekly" || normalized === "52") {
    return 52;
  }
  if (normalized === "annual" || normalized === "annually" || normalized === "yearly" || normalized === "1") {
    return 1;
  }
  return 0;
}

function getRecordValue(record, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const value = record[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return value;
      }
    }
  }
  return "";
}

function computeInputTaxFree(gross, taxFreeValue, taxFreeMode) {
  if (taxFreeValue <= 0) {
    return 0;
  }
  if (taxFreeMode === "percent") {
    return Math.min(gross, gross * (Math.min(taxFreeValue, 100) / 100));
  }
  return Math.min(gross, taxFreeValue);
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return Number(value).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return Number(value).toFixed(2);
}

function showError(message) {
  const errorEl = document.getElementById("batchError");
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function hideError() {
  const errorEl = document.getElementById("batchError");
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}

function setProgress(current, total) {
  const progressEl = document.getElementById("batchProgress");
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  progressEl.classList.remove("hidden");
  document.getElementById("progressLabel").textContent = `Processing ${current} of ${total}`;
  document.getElementById("progressPercent").textContent = `${percent}%`;
  document.getElementById("progressBar").style.width = `${percent}%`;
}

function hideProgress() {
  document.getElementById("batchProgress").classList.add("hidden");
  document.getElementById("progressBar").style.width = "0%";
}

function setDownloadEnabled(enabled) {
  const button = document.getElementById("downloadButton");
  button.disabled = !enabled;
  button.className = enabled
    ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
    : "rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-400 transition disabled:cursor-not-allowed disabled:bg-slate-100";
}

function resetResults() {
  processedResults.length = 0;
  const tbody = document.getElementById("resultsBody");
  tbody.innerHTML = `
    <tr id="emptyState">
      <td colspan="18" class="px-3 py-8 text-center text-sm text-slate-400">No rows processed yet.</td>
    </tr>
  `;
  document.getElementById("batchSummary").classList.add("hidden");
  document.getElementById("summaryRows").textContent = "0";
  document.getElementById("summarySuccess").textContent = "0";
  document.getElementById("summaryErrors").textContent = "0";
  setDownloadEnabled(false);
}

function renderSummary(totalRows, successCount, errorCount) {
  document.getElementById("summaryRows").textContent = String(totalRows);
  document.getElementById("summarySuccess").textContent = String(successCount);
  document.getElementById("summaryErrors").textContent = String(errorCount);
  document.getElementById("batchSummary").classList.remove("hidden");
}

function appendResultRow(result) {
  processedResults.push(result);
  const tbody = document.getElementById("resultsBody");
  const emptyState = document.getElementById("emptyState");
  if (emptyState) {
    emptyState.remove();
  }

  const row = document.createElement("tr");
  row.className = "odd:bg-white even:bg-slate-50/60 align-top";

  const warnings = result.error
    ? result.error
    : (result.response.warnings || []).join(" | ") || "-";

  const data = result.response;
  const reclaim = data?.reclaim?.estimated_reclaim;

  row.innerHTML = `
    <td class="border-b border-slate-100 px-3 py-3 font-semibold text-slate-700">${result.rowNumber}</td>
    <td class="border-b border-slate-100 px-3 py-3">${result.firstName}</td>
    <td class="border-b border-slate-100 px-3 py-3">${result.lastName}</td>
    <td class="border-b border-slate-100 px-3 py-3">${result.frequencyLabel}</td>
    <td class="border-b border-slate-100 px-3 py-3">${result.basisLabel}</td>
    <td class="border-b border-slate-100 px-3 py-3">${result.taxCode}</td>
    <td class="border-b border-slate-100 px-3 py-3">${data ? formatCurrency(data.inputs.gross) : formatCurrency(result.gross)}</td>
    <td class="border-b border-slate-100 px-3 py-3">${data ? formatCurrency(data.inputs.tax_free) : formatCurrency(result.taxFreeValue)}</td>
    <td class="border-b border-slate-100 px-3 py-3">${data ? formatCurrency(data.inputs.taxable_gross) : "-"}</td>
    <td class="border-b border-slate-100 px-3 py-3">${data ? formatCurrency(data.calculation.taxable_pay) : "-"}</td>
    <td class="border-b border-slate-100 px-3 py-3 font-semibold ${result.error ? "text-red-700" : "text-blue-700"}">${data ? formatCurrency(data.calculation.tax_final) : "-"}</td>
    <td class="border-b border-slate-100 px-3 py-3 font-semibold ${result.error ? "text-red-700" : "text-emerald-700"}">${data ? formatCurrency(data.calculation.net) : "-"}</td>
    <td class="border-b border-slate-100 px-3 py-3">${data ? formatPercent(data.calculation.effective_rate) : "-"}</td>
    <td class="border-b border-slate-100 px-3 py-3">${data ? formatCurrency(data.implied_annual_income) : "-"}</td>
    <td class="border-b border-slate-100 px-3 py-3">${reclaim !== undefined ? formatCurrency(reclaim) : "-"}</td>
    <td class="border-b border-slate-100 px-3 py-3">${data ? (data.flags.is_refund ? "Yes" : "No") : "-"}</td>
    <td class="border-b border-slate-100 px-3 py-3">${data ? (data.flags.is_emergency ? "Yes" : "No") : "-"}</td>
    <td class="border-b border-slate-100 px-3 py-3 text-xs leading-5 text-slate-600">${warnings}</td>
  `;

  tbody.appendChild(row);
  setDownloadEnabled(processedResults.length > 0);
}

function getDefaultOptions() {
  return {
    taxFreeMode: document.getElementById("defaultTaxFreeMode").value,
    isSsas: document.getElementById("defaultIsSsas").checked,
    isOnlyIncome: document.getElementById("defaultOnlyIncome").checked,
  };
}

function buildPayload(record) {
  const defaults = getDefaultOptions();
  const frequency = parseFrequency(record.frequency);
  const basis = parseBoolean(record.cummulative ?? record.cumulative, false) ? "cumulative" : "noncumulative";
  const taxFreeMode = getRecordValue(record, ["taxfree_mode", "tax_free_mode"]).trim().toLowerCase() || defaults.taxFreeMode;
  const gross = parseAmount(getRecordValue(record, ["pension_withdrawl", "pension_withdrawal", "gross"]));
  const taxFreeValue = parseAmount(getRecordValue(record, ["taxfree_portion", "tax_free_portion"]));
  const currentTaxableGross = Math.max(0, gross - computeInputTaxFree(gross, taxFreeValue, taxFreeMode));

  const hasActualYtdGross = getRecordValue(record, ["actual_ytd", "actual_ytd_gross"]) !== "";
  const hasActualYtdTax = getRecordValue(record, ["actual_ytd_tax"]) !== "";

  let ytdGross = parseAmount(getRecordValue(record, ["ytd_gross", "actual_ytd", "actual_ytd_gross"]));
  let ytdTax = parseAmount(getRecordValue(record, ["ytd_tax", "actual_ytd_tax"]));

  if (hasActualYtdGross) {
    ytdGross = Math.max(0, ytdGross - currentTaxableGross);
  }

  if (hasActualYtdTax) {
    const currentTax = parseAmount(getRecordValue(record, ["tax", "current_tax"]));
    if (currentTax > 0) {
      ytdTax = Math.max(0, ytdTax - currentTax);
    }
  }

  return {
    gross,
    frequency,
    tax_code: String(getRecordValue(record, ["tax_code"]) || "").trim().toUpperCase(),
    tax_free_value: taxFreeValue,
    tax_free_mode: taxFreeMode === "percent" ? "percent" : "pound",
    basis,
    ytd_gross: ytdGross,
    ytd_tax: ytdTax,
    period_number: Math.trunc(parseAmount(getRecordValue(record, ["current_period_no", "current_period_number"]))),
    is_ssas: parseBoolean(record.ssas, defaults.isSsas),
    is_only_income: parseBoolean(record.only_income, defaults.isOnlyIncome),
  };
}

function validateRecords(headers, records) {
  const requiredGroups = [
    ["first_name"],
    ["last_name"],
    ["frequency"],
    ["pension_withdrawl", "pension_withdrawal", "gross"],
    ["taxfree_portion", "tax_free_portion"],
    ["tax_code"],
    ["cummulative", "cumulative"],
    ["ytd_gross", "actual_ytd", "actual_ytd_gross"],
    ["ytd_tax", "actual_ytd_tax"],
    ["current_period_no", "current_period_number"],
  ];

  const missing = requiredGroups
    .filter((group) => !group.some((header) => headers.includes(header)))
    .map((group) => group.join(" / "));

  if (missing.length) {
    throw new Error(`Missing required CSV columns: ${missing.join(", ")}`);
  }

  if (!records.length) {
    throw new Error("No data rows were found in the pasted CSV.");
  }
}

function csvEscape(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildExportRows() {
  return processedResults.map((result) => {
    const response = result.response;
    const reclaim = response?.reclaim;
    const cumulative = response?.cumulative;
    const calculation = response?.calculation;
    const inputs = response?.inputs;
    const normalized = response?.normalized_inputs;
    const flags = response?.flags;

    return {
      row_number: result.rowNumber,
      status: result.error ? "error" : "success",
      first_name: result.firstName,
      last_name: result.lastName,
      frequency_label: result.frequencyLabel,
      basis_label: result.basisLabel,
      tax_code: result.taxCode,
      input_gross: result.gross,
      input_tax_free_value: result.taxFreeValue,
      mode: response?.mode ?? "",
      response_tax_code: response?.tax_code ?? "",
      normalized_frequency: normalized?.frequency ?? "",
      normalized_basis: normalized?.basis ?? "",
      normalized_tax_free_mode: normalized?.tax_free_mode ?? "",
      normalized_tax_free_value: normalized?.tax_free_value ?? "",
      gross: inputs?.gross ?? "",
      tax_free: inputs?.tax_free ?? "",
      taxable_gross: inputs?.taxable_gross ?? "",
      allowance: calculation?.allowance ?? "",
      taxable_pay: calculation?.taxable_pay ?? "",
      tax_before_cap: calculation?.tax_before_cap ?? "",
      safeguard_limit: calculation?.safeguard_limit ?? "",
      tax_final: calculation?.tax_final ?? "",
      net: calculation?.net ?? "",
      effective_rate: calculation?.effective_rate ?? "",
      implied_annual_income: response?.implied_annual_income ?? "",
      reclaim_estimated_annual_income: reclaim?.estimated_annual_income ?? "",
      reclaim_true_annual_tax: reclaim?.true_annual_tax ?? "",
      reclaim_true_period_tax: reclaim?.true_period_tax ?? "",
      reclaim_estimated_reclaim: reclaim?.estimated_reclaim ?? "",
      cumulative_gross: cumulative?.cumulative_gross ?? "",
      cumulative_allowance: cumulative?.cumulative_allowance ?? "",
      cumulative_taxable: cumulative?.cumulative_taxable ?? "",
      cumulative_total_tax_due: cumulative?.total_tax_due ?? "",
      cumulative_ytd_tax_paid: cumulative?.ytd_tax_paid ?? "",
      cumulative_current_period_tax: cumulative?.current_period_tax ?? "",
      cumulative_is_refund: cumulative?.is_refund ?? "",
      flag_is_scottish: flags?.is_scottish ?? "",
      flag_is_k_code: flags?.is_k_code ?? "",
      flag_is_flat_rate: flags?.is_flat_rate ?? "",
      flag_taper_applied: flags?.taper_applied ?? "",
      flag_safeguard_applied: flags?.safeguard_applied ?? "",
      flag_is_refund: flags?.is_refund ?? "",
      flag_is_emergency: flags?.is_emergency ?? "",
      warnings: response?.warnings?.join(" | ") ?? "",
      error: result.error ?? "",
    };
  });
}

function downloadResultsCsv() {
  if (!processedResults.length) {
    showError("There are no processed results to download yet.");
    return;
  }

  hideError();

  const rows = buildExportRows();
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];

  const blob = new Blob([csvLines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  link.href = url;
  link.download = `batch-tax-results-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function processCsv() {
  hideError();
  resetResults();

  const processButton = document.getElementById("processButton");
  processButton.disabled = true;
  processButton.classList.add("opacity-70", "cursor-wait");

  try {
    const csvText = document.getElementById("csvInput").value.trim();
    if (!csvText) {
      throw new Error("Paste CSV data before processing.");
    }

    const { headers, records } = parseCsv(csvText);
    validateRecords(headers, records);

    let successCount = 0;
    let errorCount = 0;

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const payload = buildPayload(record);

      const meta = {
        rowNumber: index + 1,
        firstName: record.first_name || "-",
        lastName: record.last_name || "-",
        frequencyLabel: record.frequency || "-",
        basisLabel: payload.basis === "cumulative" ? "Cumulative" : "Non-Cumulative",
        taxCode: payload.tax_code || "-",
        gross: payload.gross,
        taxFreeValue: payload.tax_free_value,
      };

      setProgress(index + 1, records.length);

      try {
        const response = await fetch(getApiUrl(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unknown API error.");
        }

        appendResultRow({
          ...meta,
          response: data,
        });
        successCount += 1;
      } catch (error) {
        appendResultRow({
          ...meta,
          error: error.message,
          response: null,
        });
        errorCount += 1;
      }
    }

    renderSummary(records.length, successCount, errorCount);
  } catch (error) {
    showError(error.message);
  } finally {
    hideProgress();
    processButton.disabled = false;
    processButton.classList.remove("opacity-70", "cursor-wait");
  }
}

function clearAll() {
  document.getElementById("csvInput").value = "";
  hideError();
  hideProgress();
  resetResults();
}

function initBatchPage() {
  document.getElementById("loadSampleButton").addEventListener("click", () => {
    document.getElementById("csvInput").value = SAMPLE_CSV;
    hideError();
  });

  document.getElementById("processButton").addEventListener("click", processCsv);
  document.getElementById("downloadButton").addEventListener("click", downloadResultsCsv);
  document.getElementById("clearButton").addEventListener("click", clearAll);
  setDownloadEnabled(false);
}

window.addEventListener("DOMContentLoaded", initBatchPage);
