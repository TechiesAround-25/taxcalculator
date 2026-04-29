import json

from django.test import Client, SimpleTestCase

from simulator.services.tax_calculator import parse_tax_code


class SimulatorPageTests(SimpleTestCase):
    def test_simulator_page_loads(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "SSAS Pension PAYE Simulator")
        self.assertContains(response, "/api/calculate-tax/")

    def test_batch_page_loads(self):
        response = self.client.get("/batch/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Batch PAYE Processor")
        self.assertContains(response, "/api/calculate-tax/")
        self.assertContains(response, "Download Results CSV")


class TaxApiTests(SimpleTestCase):
    def setUp(self):
        self.client = Client()

    def test_non_cumulative_ssas_response_contract(self):
        payload = {
            "gross": 50000,
            "frequency": 12,
            "tax_code": "1257L",
            "tax_free_value": 25,
            "tax_free_mode": "percent",
            "basis": "noncumulative",
            "ytd_gross": 0,
            "ytd_tax": 0,
            "period_number": 0,
            "is_ssas": True,
            "is_only_income": True,
        }

        response = self.client.post(
            "/api/calculate-tax/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()

        self.assertEqual(
            sorted(body.keys()),
            [
                "calculation",
                "cumulative",
                "flags",
                "implied_annual_income",
                "inputs",
                "mode",
                "normalized_inputs",
                "reclaim",
                "tax_code",
                "warnings",
            ],
        )
        self.assertEqual(body["mode"], "noncumulative")
        self.assertEqual(body["tax_code"], "1257L")
        self.assertIsNone(body["cumulative"])
        self.assertIsNotNone(body["reclaim"])
        self.assertTrue(body["flags"]["is_emergency"])
        self.assertFalse(body["flags"]["is_refund"])

    def test_cumulative_refund_is_returned(self):
        payload = {
            "gross": 1000,
            "frequency": 12,
            "tax_code": "1257L",
            "tax_free_value": 0,
            "tax_free_mode": "pound",
            "basis": "cumulative",
            "ytd_gross": 2000,
            "ytd_tax": 800,
            "period_number": 3,
            "is_ssas": False,
            "is_only_income": True,
        }

        response = self.client.post(
            "/api/calculate-tax/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()

        self.assertEqual(body["mode"], "cumulative")
        self.assertIsNone(body["reclaim"])
        self.assertIsNotNone(body["cumulative"])
        self.assertTrue(body["cumulative"]["is_refund"])
        self.assertTrue(body["flags"]["is_refund"])
        self.assertLess(body["calculation"]["tax_final"], 0)

    def test_zero_gross_cumulative_row_is_allowed(self):
        payload = {
            "gross": 0,
            "frequency": 12,
            "tax_code": "1257L",
            "tax_free_value": 0,
            "tax_free_mode": "pound",
            "basis": "cumulative",
            "ytd_gross": 4475.8,
            "ytd_tax": 475.8,
            "period_number": 3,
            "is_ssas": False,
            "is_only_income": True,
        }

        response = self.client.post(
            "/api/calculate-tax/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["mode"], "cumulative")
        self.assertTrue(body["flags"]["is_refund"])
        self.assertLess(body["calculation"]["tax_final"], 0)
        self.assertGreater(body["calculation"]["net"], 0)

    def test_full_tax_free_portion_zeroes_taxable_gross(self):
        payload = {
            "gross": 9900.29,
            "frequency": 12,
            "tax_code": "BR",
            "tax_free_value": 9900.29,
            "tax_free_mode": "pound",
            "basis": "cumulative",
            "ytd_gross": 0,
            "ytd_tax": 0,
            "period_number": 3,
            "is_ssas": False,
            "is_only_income": True,
        }

        response = self.client.post(
            "/api/calculate-tax/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["inputs"]["tax_free"], 9900.29)
        self.assertEqual(body["inputs"]["taxable_gross"], 0)
        self.assertEqual(body["calculation"]["taxable_pay"], 0)
        self.assertEqual(body["calculation"]["tax_final"], 0)

    def test_zero_gross_k_code_cumulative_returns_refund_not_error(self):
        payload = {
            "gross": 0,
            "frequency": 12,
            "tax_code": "K100",
            "tax_free_value": 0,
            "tax_free_mode": "pound",
            "basis": "cumulative",
            "ytd_gross": 35000,
            "ytd_tax": 13526.1,
            "period_number": 3,
            "is_ssas": False,
            "is_only_income": False,
        }

        response = self.client.post(
            "/api/calculate-tax/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["mode"], "cumulative")
        self.assertTrue(body["flags"]["is_k_code"])
        self.assertTrue(body["flags"]["is_refund"])
        self.assertLess(body["calculation"]["tax_final"], 0)
        self.assertGreater(body["calculation"]["net"], 0)

    def test_invalid_payload_returns_400(self):
        payload = {
            "gross": 0,
            "frequency": 12,
            "tax_code": "1257L",
            "tax_free_value": 0,
            "tax_free_mode": "pound",
            "basis": "noncumulative",
            "ytd_gross": 0,
            "ytd_tax": 0,
            "period_number": 0,
            "is_ssas": False,
            "is_only_income": True,
        }

        response = self.client.post(
            "/api/calculate-tax/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["error"],
            "Please enter a valid pension withdrawal amount.",
        )


class TaxCodeParserTests(SimpleTestCase):
    def test_k540_is_supported_by_python_calculator(self):
        parsed = parse_tax_code("K540")

        self.assertTrue(parsed.is_k_code)
        self.assertEqual(parsed.annual_allowance, -5400)
        self.assertFalse(parsed.is_flat_rate)

    def test_257t_is_supported_by_python_calculator(self):
        parsed = parse_tax_code("257T")

        self.assertFalse(parsed.is_k_code)
        self.assertEqual(parsed.annual_allowance, 2570)
        self.assertFalse(parsed.is_flat_rate)

    def test_k71_is_supported_by_python_calculator(self):
        parsed = parse_tax_code("K71")

        self.assertTrue(parsed.is_k_code)
        self.assertEqual(parsed.annual_allowance, -710)
        self.assertFalse(parsed.is_flat_rate)

    def test_k392_is_supported_by_python_calculator(self):
        parsed = parse_tax_code("K392")

        self.assertTrue(parsed.is_k_code)
        self.assertEqual(parsed.annual_allowance, -3920)
        self.assertFalse(parsed.is_flat_rate)

    def test_1288l_is_supported_by_python_calculator(self):
        parsed = parse_tax_code("1288L")

        self.assertFalse(parsed.is_k_code)
        self.assertEqual(parsed.annual_allowance, 12880)
        self.assertFalse(parsed.is_flat_rate)
