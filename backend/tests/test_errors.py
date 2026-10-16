from fastapi import Request
from fastapi.exceptions import RequestValidationError

from backend.app.errors import ApiError, api_error_response, validation_error_response


def test_api_error_response_is_consistent():
    response = api_error_response(ApiError(409, 'conflict', 'Already settled.', {'id': 'sale-1'}))
    assert response.status_code == 409
    assert response.body == b'{"error":{"code":"conflict","message":"Already settled.","details":{"id":"sale-1"}}}'


def test_validation_error_response_is_safe():
    request = Request({'type': 'http', 'method': 'POST', 'path': '/', 'headers': []})
    error = RequestValidationError([{'type': 'missing', 'loc': ('body', 'name'), 'msg': 'Field required', 'input': {}}])
    response = validation_error_response(request, error)
    assert response.status_code == 422
    assert b'validation_error' in response.body
    assert b'Request validation failed.' in response.body
