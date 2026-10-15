from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def test_health_check():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_dashboard_summary():
    response = client.get('/api/dashboard/summary')
    assert response.status_code == 200
    payload = response.json()
    assert payload['revenue_today'] == 284000
    assert payload['open_tabs'] == 7
    assert payload['low_stock_items'] == 3
