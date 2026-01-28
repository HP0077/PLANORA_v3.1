from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    certificate_preview,
    certificate_template_preview,
    PosterDraftViewSet,
    certificates_generate,
    TemplateViewSet,
    CertificateRecordViewSet,
    CertificateTemplateCreateAPIView,
    CertificateBatchSubmitAPIView,
    CertificateBatchDetailAPIView,
)

router = DefaultRouter()
router.register(r'drafts', PosterDraftViewSet, basename='poster-draft')
router.register(r'templates', TemplateViewSet, basename='poster-template')
router.register(r'certificates', CertificateRecordViewSet, basename='poster-certificate')

urlpatterns = [
    path('certificate/preview/', certificate_preview),
    path('certificates/generate/', certificates_generate),
    path('certificates/generate-v2/', CertificateBatchSubmitAPIView.as_view()),
    path('certificates/batches/<uuid:batch_id>/', CertificateBatchDetailAPIView.as_view()),
    path('certificates/templates/<int:version_id>/preview/', certificate_template_preview),
    path('certificates/templates/', CertificateTemplateCreateAPIView.as_view()),
    path('', include(router.urls)),
]
