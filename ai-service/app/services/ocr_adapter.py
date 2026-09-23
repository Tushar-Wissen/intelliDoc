import os
import json
from typing import Protocol


class OcrAdapter(Protocol):
    def extract(self, image) -> tuple[str, float | None]:
        ...


class TesseractOcrAdapter:
    """Optional lightweight fallback for environments without PaddleOCR."""

    def extract(self, image) -> tuple[str, float | None]:
        import pytesseract

        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        words = []
        confidences = []
        for text, confidence in zip(data["text"], data["conf"]):
            if text.strip():
                words.append(text.strip())
                if float(confidence) >= 0:
                    confidences.append(float(confidence) / 100.0)
        average_confidence = sum(confidences) / len(confidences) if confidences else None
        return " ".join(words), round(average_confidence, 3) if average_confidence is not None else None


class PaddleOcrAdapter:
    """PaddleOCR 3.x adapter using PP-OCRv6 defaults for document text."""

    def __init__(self):
        from paddleocr import PaddleOCR

        self.engine = PaddleOCR(lang="en")

    def extract(self, image) -> tuple[str, float | None]:
        import numpy as np

        if not isinstance(image, np.ndarray):
            image = np.asarray(image.convert("RGB") if hasattr(image, "convert") else image)

        results = self.engine.predict(input=image)
        for result in results:
            payload = result.json() if callable(getattr(result, "json", None)) else getattr(result, "json", result)
            if isinstance(payload, str):
                payload = json.loads(payload)
            if isinstance(payload, list):
                payload = payload[0] if payload else {}
            if isinstance(payload, dict):
                payload = payload.get("res", payload)
            else:
                payload = getattr(result, "res", {})
            texts = payload.get("rec_texts", [])
            scores = payload.get("rec_scores", [])
            confidences = [float(score) for score in scores if float(score) >= 0]
            confidence = sum(confidences) / len(confidences) if confidences else None
            return " ".join(text for text in texts if text.strip()), (
                round(confidence, 3) if confidence is not None else None
            )
        return "", None


def create_ocr_adapter() -> OcrAdapter:
    """Select the configured provider while keeping callers provider-neutral."""
    engine = os.getenv("OCR_ENGINE", "paddle").lower()
    if engine == "tesseract":
        return TesseractOcrAdapter()
    if engine == "paddle":
        return PaddleOcrAdapter()
    raise ValueError(f"Unsupported OCR_ENGINE '{engine}'. Use 'paddle' or 'tesseract'.")