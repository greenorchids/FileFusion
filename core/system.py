from typing import Dict, Type
from core.converter import FileConverter

class FileConversionSystem:
    """Manages file conversions."""

    def __init__(self):
        self._converters: Dict[str, Type[FileConverter]] = {}

    def register_converter(self, name: str, converter_class: Type[FileConverter]) -> None:
        """Registers a new converter."""
        if not issubclass(converter_class, FileConverter):
            raise TypeError("Converter must inherit from FileConverter")
        self._converters[name] = converter_class

    def convert(self, converter_name: str, input_file: str, output_file: str) -> None:
        """Runs the specified converter."""
        if converter_name not in self._converters:
            raise ValueError(f"No converter registered under name: {converter_name}")

        converter_class = self._converters[converter_name]
        converter_instance = converter_class()
        converter_instance.convert(input_file, output_file)
