import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from simulator.services.tax_calculator import CalculationValidationError, calculate_tax


@require_GET
@ensure_csrf_cookie
def simulator_page(request):
    return render(request, "simulator.html")


@require_GET
@ensure_csrf_cookie
def batch_simulator_page(request):
    return render(request, "batch_simulator.html")

@csrf_exempt
@require_POST
def calculate_tax_view(request):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON payload."}, status=400)

    try:
        result = calculate_tax(payload)
    except CalculationValidationError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse(result)
