# SSAS Pension PAYE Simulator

Stateless Django application for simulating SSAS pension PAYE calculations with a backend-driven response contract.

## Requirements

- Python 3.11+
- `pip`

## Install

1. Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
python3 -m pip install -r requirements.txt
```

## Run

1. Start the Django development server:

```bash
python3 manage.py runserver
```

2. Open the simulator in your browser:

- [http://127.0.0.1:8000/](http://127.0.0.1:8000/)

## Test

Run the Django system checks:

```bash
python3 manage.py check
```

Run the automated test suite:

```bash
python3 manage.py test
```

## API

Endpoint:

- `POST /api/calculate-tax/`

Request body:

```json
{
  "gross": 50000,
  "frequency": 12,
  "tax_code": "1257L",
  "tax_free_value": 25,
  "tax_free_mode": "percent",
  "basis": "noncumulative",
  "ytd_gross": 0,
  "ytd_tax": 0,
  "period_number": 0,
  "is_ssas": true,
  "is_only_income": true
}
```

Example `curl` request:

```bash
curl -X POST http://127.0.0.1:8000/api/calculate-tax/ \
  -H "Content-Type: application/json" \
  -d '{
    "gross": 50000,
    "frequency": 12,
    "tax_code": "1257L",
    "tax_free_value": 25,
    "tax_free_mode": "percent",
    "basis": "noncumulative",
    "ytd_gross": 0,
    "ytd_tax": 0,
    "period_number": 0,
    "is_ssas": true,
    "is_only_income": true
  }'
```

Response shape:

```json
{
  "mode": "noncumulative",
  "tax_code": "1257L",
  "inputs": {
    "gross": 50000.0,
    "tax_free": 12500.0,
    "taxable_gross": 37500.0
  },
  "normalized_inputs": {
    "tax_free_mode": "percent",
    "tax_free_value": 25.0,
    "frequency": 12,
    "basis": "noncumulative"
  },
  "calculation": {
    "allowance": 1047.5,
    "taxable_pay": 36452.5,
    "tax_before_cap": 15253.875,
    "safeguard_limit": 18750.0,
    "tax_final": 15253.875,
    "net": 34746.125,
    "effective_rate": 30.50775
  },
  "cumulative": null,
  "reclaim": {
    "estimated_annual_income": 450000.0,
    "true_annual_tax": 183046.5,
    "true_period_tax": 15253.875,
    "estimated_reclaim": 0
  },
  "implied_annual_income": 450000.0,
  "flags": {
    "is_scottish": false,
    "is_k_code": false,
    "is_flat_rate": false,
    "taper_applied": false,
    "safeguard_applied": false,
    "is_refund": false,
    "is_emergency": true
  },
  "warnings": []
}
```

## Postman

Import the collection file below into Postman:

- [postman/SSAS-Pension-PAYE-Simulator.postman_collection.json](/Users/techiesaround/Development/tax-simulator/postman/SSAS-Pension-PAYE-Simulator.postman_collection.json)

The collection includes:

- A page health request for `GET /`
- A non-cumulative SSAS example
- A cumulative PAYE example
- A cumulative refund example
- A validation error example
