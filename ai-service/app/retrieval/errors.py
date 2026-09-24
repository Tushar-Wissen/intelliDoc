"""Internal retrieval errors. Codes follow Epic 6 plan §16."""


class RetrievalError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
