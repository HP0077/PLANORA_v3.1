"""Tests for the global exception handler."""
import pytest
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied


class FaultyView(APIView):
    permission_classes = []

    def get(self, request):
        raise ValueError("Something broke")


class ValidationView(APIView):
    permission_classes = []

    def get(self, request):
        raise ValidationError({"name": ["This field is required."]})


@pytest.mark.django_db
class TestExceptionHandler:
    def test_unhandled_exception_returns_500(self):
        from planora_backend.exceptions import global_exception_handler
        from rest_framework.exceptions import APIException

        # Simulate calling the handler
        factory = APIRequestFactory()
        request = factory.get('/')
        view = FaultyView.as_view()

        # Direct call through handler
        exc = ValueError("boom")
        context = {'view': FaultyView(), 'request': request}
        response = global_exception_handler(exc, context)
        assert response.status_code == 500
        assert response.data['error']['code'] == 'internal_error'

    def test_validation_error_returns_envelope(self):
        from planora_backend.exceptions import global_exception_handler

        factory = APIRequestFactory()
        request = factory.get('/')
        exc = ValidationError({"name": ["Required"]})
        context = {'view': ValidationView(), 'request': request}
        response = global_exception_handler(exc, context)
        assert response.status_code == 400
        assert response.data['error']['code'] == 'validation_error'
        assert 'details' in response.data['error']

    def test_permission_denied_envelope(self):
        from planora_backend.exceptions import global_exception_handler

        factory = APIRequestFactory()
        request = factory.get('/')
        exc = PermissionDenied("Not allowed")
        context = {'view': FaultyView(), 'request': request}
        response = global_exception_handler(exc, context)
        assert response.status_code == 403
        assert response.data['error']['code'] == 'permission_denied'
