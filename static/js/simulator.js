const WARNING_MESSAGES = {
  pcls: "Tax-free lump sum (PCLS) is typically up to 25% of pension value. Please verify your entitlement.",
  safeguard: "Income tax was capped at 50% of gross pay - HMRC K-code safeguard applied.",
  emergency:
    "This payment is likely taxed using emergency PAYE. HMRC assumes this is a regular payment, which may result in significantly higher tax deductions. You can reclaim overpaid tax from HMRC after the tax year.",
  ssas:
    "This calculation assumes regular payments under PAYE. SSAS pension withdrawals are often taxed on an emergency basis. Actual liability may differ and overpaid tax can be reclaimed from HMRC.",
  otherIncome:
    "Estimate assumes no other income. Actual reclaim may differ if you have additional earnings.",
};

const TAX_CODES = [
  "0T", "BR", "D0", "D1", "SD1", "SD2",
  "3L", "19L", "32L", "60L", "179L", "184L", "244L", "323L", "331L", "345L",
  "611L", "640L", "698L", "757L", "879L", "943L", "1171L", "1197T", "1200L", "1232L", "1236L", "1239L", "1257L", "1282L", "1957L",
  "27T", "48T", "57T", "777T", "1168T", "1178T", "1269T",
  "K18", "K44", "K48", "K63", "K100", "K104", "K181", "K324", "K390", "K455", "K457",
  "K499", "K539", "K540", "K541", "K544", "K560", "K621", "K631", "K740", "K1008", "K2021", "K3920", "K6684",
  "C0T", "C65L", "C207L", "C521T", "C553T", "C1257L", "C1417T", "CBR", "CD0", "CD1",
  "S0T", "S60L", "SBR", "SK372", "SK432", "SK510",
  "#N/A"
];

let currentBasis = "noncumulative";
let taxFreeMode = "pound";

function setBasis(basis) {
  currentBasis = basis;
  const btnNC = document.getElementById("btnNonCumulative");
  const btnC = document.getElementById("btnCumulative");
  const panel = document.getElementById("ytdPanel");

  if (basis === "cumulative") {
    btnC.className = "flex-1 py-2.5 px-4 text-sm font-medium transition-all focus:outline-none bg-blue-600 text-white";
    btnNC.className = "flex-1 py-2.5 px-4 text-sm font-medium transition-all focus:outline-none bg-white text-slate-600 hover:bg-slate-50";
    panel.classList.add("open");
  } else {
    btnNC.className = "flex-1 py-2.5 px-4 text-sm font-medium transition-all focus:outline-none bg-blue-600 text-white";
    btnC.className = "flex-1 py-2.5 px-4 text-sm font-medium transition-all focus:outline-none bg-white text-slate-600 hover:bg-slate-50";
    panel.classList.remove("open");
  }

  hide("result");
}

function setTaxFreeMode(mode) {
  taxFreeMode = mode;
  const btnP = document.getElementById("btnTfPound");
  const btnPct = document.getElementById("btnTfPercent");
  const unitLabel = document.getElementById("taxFreeUnitLabel");
  const input = document.getElementById("taxFreeAmount");

  if (mode === "percent") {
    btnPct.className = "px-3 py-2 text-xs font-semibold transition-all focus:outline-none bg-blue-600 text-white";
    btnP.className = "px-3 py-2 text-xs font-semibold transition-all focus:outline-none bg-white text-slate-500 hover:bg-slate-50";
    unitLabel.textContent = "%";
    input.placeholder = "e.g. 25";
  } else {
    btnP.className = "px-3 py-2 text-xs font-semibold transition-all focus:outline-none bg-blue-600 text-white";
    btnPct.className = "px-3 py-2 text-xs font-semibold transition-all focus:outline-none bg-white text-slate-500 hover:bg-slate-50";
    unitLabel.textContent = "£";
    input.placeholder = "0.00";
  }

  hide("result");
}

function show(id) {
  document.getElementById(id).classList.remove("hidden");
}

function hide(id) {
  document.getElementById(id).classList.add("hidden");
}

function setText(id, value) {
  document.getElementById(id).textContent = Number(value || 0).toFixed(2);
}

function val(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

function showError(message) {
  document.getElementById("validationMsg").textContent = message;
  show("validationError");
  hide("result");
}

function hideError() {
  hide("validationError");
}

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
  return document.getElementById("simulatorApp").dataset.apiUrl;
}

function getPayload() {
  return {
    gross: val("gross"),
    frequency: parseInt(document.getElementById("frequency").value, 10),
    tax_code: document.getElementById("taxCode").value.toUpperCase(),
    tax_free_value: val("taxFreeAmount"),
    tax_free_mode: taxFreeMode,
    basis: currentBasis,
    ytd_gross: val("ytdGross"),
    ytd_tax: val("ytdTax"),
    period_number: parseInt(document.getElementById("periodNumber").value, 10) || 0,
    is_ssas: document.getElementById("ssasCheck").checked,
    is_only_income: document.getElementById("onlyIncomeCheck").checked,
  };
}

async function calculateTax() {
  hideError();

  const calculateButton = document.getElementById("calculateButton");
  calculateButton.disabled = true;
  calculateButton.classList.add("opacity-70", "cursor-wait");

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify(getPayload()),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to calculate tax.");
    }

    if (data.mode !== currentBasis) {
      setBasis(data.mode);
    }

    renderResults(data);
  } catch (error) {
    showError(error.message);
  } finally {
    calculateButton.disabled = false;
    calculateButton.classList.remove("opacity-70", "cursor-wait");
  }
}

function renderResults(data) {
  renderBadges(data);
  renderImpliedAnnual(data);
  renderWarnings(data);
  renderPanels(data);

  document.getElementById("codeUsed").textContent = `Tax Code: ${data.tax_code}`;
  show("result");
}

function renderBadges(data) {
  const badge = document.getElementById("modeBadge");

  if (data.mode === "noncumulative") {
    show("resultNonCum");
    hide("resultCum");
    badge.textContent = "M1 / W1";
    badge.className = "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 badge-pulse";
  } else {
    hide("resultNonCum");
    show("resultCum");
    badge.textContent = "CUMULATIVE";
    badge.className = "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700 badge-pulse";
  }

  data.flags.taper_applied ? show("taperBadge") : hide("taperBadge");
  data.flags.is_scottish ? show("scottishBadge") : hide("scottishBadge");
}

function renderImpliedAnnual(data) {
  show("impliedAnnualBox");
  const impliedLabel = document.getElementById("impliedAnnualLabel");

  if (data.mode === "cumulative") {
    impliedLabel.innerHTML = 'Projected annual income: <strong>£<span id="impliedAnnual">0</span></strong> <span class="text-[11px] opacity-75">(for taper check only - not used in tax calculation)</span>';
  } else {
    impliedLabel.innerHTML = 'HMRC assumes annual income of <strong>£<span id="impliedAnnual">0</span></strong> based on this payment';
  }

  setText("impliedAnnual", data.implied_annual_income);
}

function renderWarnings(data) {
  const activeWarnings = new Set(data.warnings || []);

  activeWarnings.has(WARNING_MESSAGES.pcls) ? show("pclsWarning") : hide("pclsWarning");
  data.flags.safeguard_applied ? show("safeguardWarning") : hide("safeguardWarning");
  data.flags.is_emergency ? show("emergencyWarning") : hide("emergencyWarning");
  activeWarnings.has(WARNING_MESSAGES.ssas) ? show("ssasWarning") : hide("ssasWarning");
  activeWarnings.has(WARNING_MESSAGES.otherIncome) ? show("otherIncomeWarning") : hide("otherIncomeWarning");
}

function renderPanels(data) {
  if (data.mode === "noncumulative") {
    setText("r_pcls", data.inputs.tax_free);
    setText("r_taxableGross", data.inputs.taxable_gross);
    setText("r_allowance", data.calculation.allowance);
    setText("r_taxable", data.calculation.taxable_pay);
    setText("r_taxBeforeCap", data.calculation.tax_before_cap);
    setText("r_safeguardLimit", data.calculation.safeguard_limit);
    setText("r_tax", data.calculation.tax_final);
    setText("r_effectiveRate", data.calculation.effective_rate);
    setText("r_net", data.calculation.net);

    if (data.reclaim) {
      setText("re_annualIncome", data.reclaim.estimated_annual_income);
      setText("re_trueAnnualTax", data.reclaim.true_annual_tax);
      setText("re_truePeriodTax", data.reclaim.true_period_tax);
      setText("re_reclaim", data.reclaim.estimated_reclaim);
      show("reclaimPanel");
    } else {
      hide("reclaimPanel");
      hide("otherIncomeWarning");
    }

    return;
  }

  const taxLabel = document.getElementById("rc_taxLabel");
  if (data.flags.is_refund) {
    taxLabel.textContent = "Tax Refund Due";
    taxLabel.className = "text-sm font-semibold text-emerald-700";
  } else {
    taxLabel.textContent = "Income Tax Deducted";
    taxLabel.className = "text-sm font-semibold text-slate-700";
  }

  setText("rc_pcls", data.inputs.tax_free);
  setText("rc_taxableGross", data.inputs.taxable_gross);
  setText("rc_cumGross", data.cumulative.cumulative_gross);
  setText("rc_cumAllowance", Math.abs(data.cumulative.cumulative_allowance));
  setText("rc_cumTaxable", data.cumulative.cumulative_taxable);
  setText("rc_totalTaxDue", data.cumulative.total_tax_due);
  setText("rc_ytdPaid", data.cumulative.ytd_tax_paid);
  setText("rc_taxBeforeCap", data.calculation.tax_before_cap);
  setText("rc_safeguardLimit", data.calculation.safeguard_limit);
  setText("rc_tax", Math.abs(data.cumulative.current_period_tax));
  setText("rc_effectiveRate", Math.abs(data.calculation.effective_rate));
  setText("rc_net", data.calculation.net);

  hide("reclaimPanel");
  hide("otherIncomeWarning");
}

(function initSearchableDropdown() {
  const searchInput = document.getElementById("taxCodeSearch");
  const hiddenInput = document.getElementById("taxCode");
  const list = document.getElementById("taxCodeList");
  const toggle = document.getElementById("taxCodeToggle");
  const chevron = document.getElementById("taxCodeChevron");
  let highlightIdx = -1;

  function renderList(filter = "") {
    const query = filter.toUpperCase();
    const filtered = TAX_CODES.filter((code) => code.toUpperCase().includes(query));
    list.innerHTML = "";
    highlightIdx = -1;

    if (!filtered.length) {
      list.innerHTML = '<li class="px-3 py-2 text-sm text-slate-400 italic">No matches</li>';
      return;
    }

    const groups = {
      "Flat Rate": [],
      "L Codes": [],
      "T Codes": [],
      "K Codes": [],
      "C Prefix": [],
      "S Prefix": [],
      "Other": [],
    };

    filtered.forEach((code) => {
      if (["0T", "BR", "D0", "D1", "SD1", "SD2"].includes(code)) groups["Flat Rate"].push(code);
      else if (/^\d+L$/.test(code)) groups["L Codes"].push(code);
      else if (/^\d+T$/.test(code)) groups["T Codes"].push(code);
      else if (/^K\d+$/.test(code)) groups["K Codes"].push(code);
      else if (/^C/.test(code)) groups["C Prefix"].push(code);
      else if (/^S/.test(code)) groups["S Prefix"].push(code);
      else groups["Other"].push(code);
    });

    Object.entries(groups).forEach(([label, codes]) => {
      if (!codes.length) {
        return;
      }

      const header = document.createElement("li");
      header.className = "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 select-none sticky top-0";
      header.textContent = label;
      list.appendChild(header);

      codes.forEach((code) => {
        const item = document.createElement("li");
        item.className = "px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors";
        item.dataset.value = code;
        item.textContent = code;
        item.addEventListener("mousedown", (event) => {
          event.preventDefault();
          selectCode(code);
        });
        list.appendChild(item);
      });
    });
  }

  function selectCode(code) {
    hiddenInput.value = code;
    searchInput.value = code;
    closeList();
    hide("result");
  }

  function openList() {
    list.classList.remove("hidden");
    chevron.style.transform = "rotate(180deg)";
    renderList(searchInput.value);
  }

  function closeList() {
    list.classList.add("hidden");
    chevron.style.transform = "";
  }

  function isOpen() {
    return !list.classList.contains("hidden");
  }

  function updateHighlight(items) {
    items.forEach((element, index) => {
      if (index === highlightIdx) {
        element.classList.add("bg-blue-100", "text-blue-700");
        element.scrollIntoView({ block: "nearest" });
      } else {
        element.classList.remove("bg-blue-100", "text-blue-700");
      }
    });
  }

  searchInput.addEventListener("focus", openList);
  searchInput.addEventListener("input", () => {
    if (!isOpen()) {
      openList();
    }
    renderList(searchInput.value);
    hide("result");
  });
  searchInput.addEventListener("blur", () => {
    window.setTimeout(closeList, 150);
  });
  searchInput.addEventListener("keydown", (event) => {
    const items = list.querySelectorAll("li[data-value]");
    if (!items.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, items.length - 1);
      updateHighlight(items);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      updateHighlight(items);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < items.length) {
        selectCode(items[highlightIdx].dataset.value);
      }
      return;
    }

    if (event.key === "Escape") {
      closeList();
      searchInput.blur();
    }
  });

  toggle.addEventListener("click", () => {
    if (isOpen()) {
      closeList();
      searchInput.blur();
    } else {
      searchInput.focus();
    }
  });

  selectCode(TAX_CODES[0]);
  renderList();
})();

window.setBasis = setBasis;
window.setTaxFreeMode = setTaxFreeMode;
window.calculateTax = calculateTax;
