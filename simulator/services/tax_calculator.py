import math
import re
from dataclasses import dataclass


PCLS_WARNING = (
    "Tax-free lump sum (PCLS) is typically up to 25% of pension value. Please verify your entitlement."
)
SAFEGUARD_WARNING = (
    "Income tax was capped at 50% of gross pay - HMRC K-code safeguard applied."
)
EMERGENCY_WARNING = (
    "This payment is likely taxed using emergency PAYE. HMRC assumes this is a regular payment, "
    "which may result in significantly higher tax deductions. You can reclaim overpaid tax from HMRC "
    "after the tax year."
)
SSAS_WARNING = (
    "This calculation assumes regular payments under PAYE. SSAS pension withdrawals are often taxed "
    "on an emergency basis. Actual liability may differ and overpaid tax can be reclaimed from HMRC."
)
OTHER_INCOME_WARNING = (
    "Estimate assumes no other income. Actual reclaim may differ if you have additional earnings."
)


class CalculationValidationError(ValueError):
    pass


@dataclass(frozen=True)
class ParsedTaxCode:
    annual_allowance: float = 0.0
    is_k_code: bool = False
    is_flat_rate: bool = False
    flat_rate: float = 0.0
    is_scottish: bool = False
    basis_override: str | None = None


def parse_tax_code(raw_code):
    result = ParsedTaxCode()

    code = raw_code or ""
    basis_override = None
    if re.search(r"\s*(M1|W1|X)$", code, re.IGNORECASE):
        basis_override = "noncumulative"
        code = re.sub(r"\s*(M1|W1|X)$", "", code, flags=re.IGNORECASE)

    is_scottish = bool(re.match(r"^S", code, re.IGNORECASE)) and code not in {"SD1", "SD2"}
    clean = re.sub(r"^[CS]", "", code)

    if code in {"BR", "CBR", "SBR"}:
        return ParsedTaxCode(
            annual_allowance=0.0,
            is_flat_rate=True,
            flat_rate=0.20,
            is_scottish=is_scottish,
            basis_override=basis_override,
        )
    if code in {"D0", "CD0"}:
        return ParsedTaxCode(
            annual_allowance=0.0,
            is_flat_rate=True,
            flat_rate=0.40,
            is_scottish=is_scottish,
            basis_override=basis_override,
        )
    if code in {"D1", "CD1"}:
        return ParsedTaxCode(
            annual_allowance=0.0,
            is_flat_rate=True,
            flat_rate=0.45,
            is_scottish=is_scottish,
            basis_override=basis_override,
        )
    if code == "SD1":
        return ParsedTaxCode(
            annual_allowance=0.0,
            is_flat_rate=True,
            flat_rate=0.41,
            is_scottish=is_scottish,
            basis_override=basis_override,
        )
    if code == "SD2":
        return ParsedTaxCode(
            annual_allowance=0.0,
            is_flat_rate=True,
            flat_rate=0.46,
            is_scottish=is_scottish,
            basis_override=basis_override,
        )
    if clean == "0T":
        return ParsedTaxCode(
            annual_allowance=0.0,
            is_scottish=is_scottish,
            basis_override=basis_override,
        )
    if clean.startswith("K"):
        number = int(clean[1:]) if clean[1:].isdigit() else 0
        return ParsedTaxCode(
            annual_allowance=-(number * 10),
            is_k_code=True,
            is_scottish=is_scottish,
            basis_override=basis_override,
        )
    if re.search(r"[0-9]+[LT]$", clean):
        return ParsedTaxCode(
            annual_allowance=int(re.match(r"(\d+)", clean).group(1)) * 10,
            is_scottish=is_scottish,
            basis_override=basis_override,
        )

    return ParsedTaxCode(
        annual_allowance=12570.0,
        is_scottish=is_scottish,
        basis_override=basis_override,
    )


def band_tax(period_income, freq):
    band1 = 37700 / freq
    band2 = 125140 / freq

    if period_income <= band1:
        return period_income * 0.20
    if period_income <= band2:
        return (band1 * 0.20) + ((period_income - band1) * 0.40)
    return (band1 * 0.20) + ((band2 - band1) * 0.40) + ((period_income - band2) * 0.45)


def band_tax_cumulative(cumulative_taxable, period_no, total_periods):
    proportion = period_no / total_periods
    band1 = 37700 * proportion
    band2 = 125140 * proportion

    if cumulative_taxable <= band1:
        return cumulative_taxable * 0.20
    if cumulative_taxable <= band2:
        return (band1 * 0.20) + ((cumulative_taxable - band1) * 0.40)
    return (band1 * 0.20) + ((band2 - band1) * 0.40) + ((cumulative_taxable - band2) * 0.45)


def band_tax_scottish(period_income, freq):
    bands = [2306 / freq, 13991 / freq, 31092 / freq, 62430 / freq, 125140 / freq]
    rates = [0.19, 0.20, 0.21, 0.42, 0.45, 0.48]
    tax = 0.0
    previous = 0.0

    for index, rate in enumerate(rates):
        cap = bands[index] if index < len(bands) else math.inf
        if period_income <= cap:
            tax += (period_income - previous) * rate
            break
        tax += (cap - previous) * rate
        previous = cap

    return tax


def band_tax_scottish_cumulative(cumulative_taxable, period_no, total_periods):
    proportion = period_no / total_periods
    bands = [2306 * proportion, 13991 * proportion, 31092 * proportion, 62430 * proportion, 125140 * proportion]
    rates = [0.19, 0.20, 0.21, 0.42, 0.45, 0.48]
    tax = 0.0
    previous = 0.0

    for index, rate in enumerate(rates):
        cap = bands[index] if index < len(bands) else math.inf
        if cumulative_taxable <= cap:
            tax += (cumulative_taxable - previous) * rate
            break
        tax += (cap - previous) * rate
        previous = cap

    return tax


def band_tax_route(income, freq, is_scottish):
    return band_tax_scottish(income, freq) if is_scottish else band_tax(income, freq)


def band_tax_cumulative_route(income, period_no, total_periods, is_scottish):
    if is_scottish:
        return band_tax_scottish_cumulative(income, period_no, total_periods)
    return band_tax_cumulative(income, period_no, total_periods)


def taper_allowance(annual_allowance, estimated_annual_income, parsed):
    if parsed.is_flat_rate or parsed.is_k_code:
        return annual_allowance
    if annual_allowance <= 0:
        return annual_allowance
    if estimated_annual_income > 100000:
        reduction = (estimated_annual_income - 100000) / 2
        return max(0, annual_allowance - reduction)
    return annual_allowance


def compute_tax_free(gross, tax_free_value, tax_free_mode):
    if tax_free_value <= 0:
        return 0.0
    if tax_free_mode == "percent":
        return min(gross, gross * (min(tax_free_value, 100) / 100))
    return min(gross, tax_free_value)


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _to_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"true", "1", "yes", "on"}
    return bool(value)


def _base_response(
    *,
    mode,
    tax_code,
    gross,
    tax_free,
    taxable_gross,
    tax_free_mode,
    tax_free_value,
    frequency,
    basis,
    allowance,
    taxable_pay,
    tax_before_cap,
    safeguard_limit,
    tax_final,
    net,
    effective_rate,
    cumulative,
    reclaim,
    implied_annual_income,
    flags,
    warnings,
):
    return {
        "mode": mode,
        "tax_code": tax_code,
        "inputs": {
            "gross": gross,
            "tax_free": tax_free,
            "taxable_gross": taxable_gross,
        },
        "normalized_inputs": {
            "tax_free_mode": tax_free_mode,
            "tax_free_value": tax_free_value,
            "frequency": frequency,
            "basis": basis,
        },
        "calculation": {
            "allowance": allowance,
            "taxable_pay": taxable_pay,
            "tax_before_cap": tax_before_cap,
            "safeguard_limit": safeguard_limit,
            "tax_final": tax_final,
            "net": net,
            "effective_rate": effective_rate,
        },
        "cumulative": cumulative,
        "reclaim": reclaim,
        "implied_annual_income": implied_annual_income,
        "flags": flags,
        "warnings": warnings,
    }


def calc_non_cumulative(
    *,
    gross,
    taxable_gross,
    tax_free_amount,
    freq,
    code,
    parsed,
    is_ssas,
    is_only_income,
    tax_free_mode,
    tax_free_value,
    effective_basis,
):
    allowance = 0.0
    taxable = 0.0
    tax = 0.0
    taper_applied = False

    estimated_annual_income = taxable_gross * freq
    adjusted_annual_allowance = parsed.annual_allowance

    if parsed.is_flat_rate:
        taxable = taxable_gross
        tax = taxable_gross * parsed.flat_rate
    elif parsed.is_k_code:
        period_add = abs(parsed.annual_allowance) / freq
        allowance = -period_add
        taxable = taxable_gross + period_add
        tax = band_tax_route(taxable, freq, parsed.is_scottish)
    else:
        allowance = adjusted_annual_allowance / freq
        taxable = max(0, taxable_gross - allowance)
        tax = band_tax_route(taxable, freq, parsed.is_scottish)

    tax_before_cap = tax
    safeguard_limit = taxable_gross * 0.50
    safeguard_applied = False
    if parsed.is_k_code and tax > safeguard_limit:
        tax = safeguard_limit
        safeguard_applied = True

    tax = max(0, tax)
    net = gross - tax
    effective_rate = (tax / gross) * 100 if gross > 0 else 0.0

    reclaim = None
    warnings = []
    if is_ssas and effective_basis == "noncumulative":
        if parsed.is_flat_rate:
            true_annual_taxable = estimated_annual_income
        elif parsed.is_k_code:
            true_annual_taxable = estimated_annual_income + abs(parsed.annual_allowance)
        else:
            true_annual_taxable = max(0, estimated_annual_income - adjusted_annual_allowance)

        true_annual_tax = (
            true_annual_taxable * parsed.flat_rate
            if parsed.is_flat_rate
            else band_tax_route(true_annual_taxable, 1, parsed.is_scottish)
        )
        true_period_tax = max(0, true_annual_tax / freq)
        estimated_reclaim = max(0, tax - true_period_tax)

        reclaim = {
            "estimated_annual_income": estimated_annual_income,
            "true_annual_tax": true_annual_tax,
            "true_period_tax": true_period_tax,
            "estimated_reclaim": estimated_reclaim,
        }

        if not is_only_income:
            warnings.append(OTHER_INCOME_WARNING)

    clean = re.sub(r"^[CS]", "", code)
    is_emergency = clean == "0T" or is_ssas or effective_basis == "noncumulative"

    if tax_free_amount > 0 and gross > 0 and (tax_free_amount / gross) > 0.25:
        warnings.append(PCLS_WARNING)
    if safeguard_applied:
        warnings.append(SAFEGUARD_WARNING)
    if is_emergency:
        warnings.append(EMERGENCY_WARNING)
    if is_ssas and gross > 10000:
        warnings.append(SSAS_WARNING)

    flags = {
        "is_scottish": parsed.is_scottish,
        "is_k_code": parsed.is_k_code,
        "is_flat_rate": parsed.is_flat_rate,
        "taper_applied": taper_applied,
        "safeguard_applied": safeguard_applied,
        "is_refund": False,
        "is_emergency": is_emergency,
    }

    return _base_response(
        mode="noncumulative",
        tax_code=code,
        gross=gross,
        tax_free=tax_free_amount,
        taxable_gross=taxable_gross,
        tax_free_mode=tax_free_mode,
        tax_free_value=tax_free_value,
        frequency=freq,
        basis=effective_basis,
        allowance=allowance,
        taxable_pay=taxable,
        tax_before_cap=tax_before_cap,
        safeguard_limit=safeguard_limit,
        tax_final=tax,
        net=net,
        effective_rate=effective_rate,
        cumulative=None,
        reclaim=reclaim,
        implied_annual_income=estimated_annual_income,
        flags=flags,
        warnings=warnings,
    )


def calc_cumulative(
    *,
    gross,
    taxable_gross,
    tax_free_amount,
    freq,
    code,
    parsed,
    is_ssas,
    is_only_income,
    tax_free_mode,
    tax_free_value,
    effective_basis,
    ytd_gross,
    ytd_tax,
    period_no,
):
    if period_no < 1 or period_no > freq:
        raise CalculationValidationError(f"Period number must be between 1 and {freq}.")

    cumulative_gross = ytd_gross + taxable_gross
    projected_annual_for_taper = cumulative_gross * (freq / period_no)
    adjusted_annual_allowance = parsed.annual_allowance
    taper_applied = False

    if parsed.is_flat_rate:
        cumulative_allowance = 0.0
    elif parsed.is_k_code:
        cumulative_allowance = parsed.annual_allowance * (period_no / freq)
    else:
        cumulative_allowance = adjusted_annual_allowance * (period_no / freq)

    if parsed.is_k_code:
        cumulative_taxable = cumulative_gross + abs(cumulative_allowance)
    else:
        cumulative_taxable = max(0, cumulative_gross - cumulative_allowance)

    if parsed.is_flat_rate:
        total_tax_due = cumulative_taxable * parsed.flat_rate
    else:
        total_tax_due = band_tax_cumulative_route(cumulative_taxable, period_no, freq, parsed.is_scottish)

    current_tax = total_tax_due - ytd_tax
    tax_before_cap = current_tax
    safeguard_limit = taxable_gross * 0.50
    safeguard_applied = False
    if parsed.is_k_code and current_tax > safeguard_limit:
        current_tax = safeguard_limit
        safeguard_applied = True

    is_refund = current_tax < 0
    net = gross - current_tax
    effective_rate = (current_tax / gross) * 100 if gross > 0 else 0.0

    clean = re.sub(r"^[CS]", "", code)
    is_emergency = clean == "0T" or is_ssas or effective_basis == "noncumulative"

    warnings = []
    if tax_free_amount > 0 and gross > 0 and (tax_free_amount / gross) > 0.25:
        warnings.append(PCLS_WARNING)
    if safeguard_applied:
        warnings.append(SAFEGUARD_WARNING)
    if is_emergency:
        warnings.append(EMERGENCY_WARNING)
    if is_ssas and gross > 10000:
        warnings.append(SSAS_WARNING)

    flags = {
        "is_scottish": parsed.is_scottish,
        "is_k_code": parsed.is_k_code,
        "is_flat_rate": parsed.is_flat_rate,
        "taper_applied": taper_applied,
        "safeguard_applied": safeguard_applied,
        "is_refund": is_refund,
        "is_emergency": is_emergency,
    }

    return _base_response(
        mode="cumulative",
        tax_code=code,
        gross=gross,
        tax_free=tax_free_amount,
        taxable_gross=taxable_gross,
        tax_free_mode=tax_free_mode,
        tax_free_value=tax_free_value,
        frequency=freq,
        basis=effective_basis,
        allowance=cumulative_allowance,
        taxable_pay=cumulative_taxable,
        tax_before_cap=tax_before_cap,
        safeguard_limit=safeguard_limit,
        tax_final=current_tax,
        net=net,
        effective_rate=effective_rate,
        cumulative={
            "cumulative_gross": cumulative_gross,
            "cumulative_allowance": cumulative_allowance,
            "cumulative_taxable": cumulative_taxable,
            "total_tax_due": total_tax_due,
            "ytd_tax_paid": ytd_tax,
            "current_period_tax": current_tax,
            "is_refund": is_refund,
        },
        reclaim=None,
        implied_annual_income=projected_annual_for_taper,
        flags=flags,
        warnings=warnings,
    )


def calculate_tax(payload):
    gross = _to_float(payload.get("gross"))
    freq = _to_int(payload.get("frequency"))
    code = str(payload.get("tax_code", "")).upper()
    tax_free_value = _to_float(payload.get("tax_free_value"))
    tax_free_mode = str(payload.get("tax_free_mode", "pound"))
    basis = str(payload.get("basis", "noncumulative"))
    ytd_gross = _to_float(payload.get("ytd_gross"))
    ytd_tax = _to_float(payload.get("ytd_tax"))
    period_no = _to_int(payload.get("period_number"))
    is_ssas = _to_bool(payload.get("is_ssas"))
    is_only_income = _to_bool(payload.get("is_only_income"))

    if not code:
        raise CalculationValidationError("Please select a tax code.")
    if freq <= 0:
        raise CalculationValidationError("Please select a valid pay frequency.")

    parsed = parse_tax_code(code)
    effective_basis = parsed.basis_override or basis

    if gross < 0:
        raise CalculationValidationError("Please enter a valid pension withdrawal amount.")
    if gross == 0 and effective_basis != "cumulative":
        raise CalculationValidationError("Please enter a valid pension withdrawal amount.")

    tax_free_amount = compute_tax_free(gross, tax_free_value, tax_free_mode)
    if tax_free_value > 0 and tax_free_mode == "pound" and tax_free_value > gross:
        raise CalculationValidationError("Tax-free amount cannot exceed the pension withdrawal.")

    taxable_gross = max(0, gross - tax_free_amount)

    if effective_basis == "noncumulative":
        return calc_non_cumulative(
            gross=gross,
            taxable_gross=taxable_gross,
            tax_free_amount=tax_free_amount,
            freq=freq,
            code=code,
            parsed=parsed,
            is_ssas=is_ssas,
            is_only_income=is_only_income,
            tax_free_mode=tax_free_mode,
            tax_free_value=tax_free_value,
            effective_basis=effective_basis,
        )

    return calc_cumulative(
        gross=gross,
        taxable_gross=taxable_gross,
        tax_free_amount=tax_free_amount,
        freq=freq,
        code=code,
        parsed=parsed,
        is_ssas=is_ssas,
        is_only_income=is_only_income,
        tax_free_mode=tax_free_mode,
        tax_free_value=tax_free_value,
        effective_basis=effective_basis,
        ytd_gross=ytd_gross,
        ytd_tax=ytd_tax,
        period_no=period_no,
    )
