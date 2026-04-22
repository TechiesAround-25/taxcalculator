from django.urls import path

from simulator.views import batch_simulator_page, calculate_tax_view, simulator_page


urlpatterns = [
    path("", simulator_page, name="simulator"),
    path("batch/", batch_simulator_page, name="batch-simulator"),
    path("api/calculate-tax/", calculate_tax_view, name="calculate-tax"),
]
