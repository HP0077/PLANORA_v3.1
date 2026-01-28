"""Utility for rendering certificate templates to PDF bytes."""

from __future__ import annotations

from io import BytesIO
from typing import Any, Mapping

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


def _safe_format(template: str, data: Mapping[str, Any]) -> str:
	"""Format with best-effort substitution; leave placeholders if missing."""
	class _Fallback(dict):
		def __missing__(self, key):
			return "{" + key + "}"

	return template.format_map(_Fallback(**data)) if template else ""


def _render_reportlab(title: str, body: str) -> bytes:
	"""Simple PDF rendering fallback using ReportLab."""
	buffer = BytesIO()
	pdf = canvas.Canvas(buffer, pagesize=A4)
	pdf.setTitle(title or "Certificate")

	pdf.setFont("Helvetica-Bold", 20)
	pdf.drawString(25 * mm, 260 * mm, title or "Certificate")

	pdf.setFont("Helvetica", 12)
	text = pdf.beginText(25 * mm, 245 * mm)
	for line in body.splitlines() or ["Certificate issued by Planora."]:
		text.textLine(line.strip())
	pdf.drawText(text)

	pdf.showPage()
	pdf.save()
	buffer.seek(0)
	return buffer.getvalue()


def render_certificate_html(version, data: Mapping[str, Any] | None = None) -> bytes:
	"""Render a certificate template version to PDF bytes.

	Tries html->PDF via pdfkit if available; falls back to a minimal
	ReportLab PDF so migrations/preview calls always work.
	"""

	payload = data or {}
	html_body = _safe_format(getattr(version, "html", ""), payload)
	css = getattr(version, "css", "") or ""

	# Try pdfkit when wkhtmltopdf is present.
	try:
		import pdfkit

		html_doc = f"""
		<html>
			<head><style>{css}</style></head>
			<body>{html_body}</body>
		</html>
		"""
		return pdfkit.from_string(html_doc, False)
	except Exception:
		title = payload.get("event") or "Certificate"
		body_lines = [f"Recipient: {payload.get('name', 'N/A')}", f"Event: {payload.get('event', 'N/A')}"]
		if html_body:
			body_lines.append("")
			body_lines.append("Template preview:")
			body_lines.append(html_body)
		return _render_reportlab(title, "\n".join(body_lines))
