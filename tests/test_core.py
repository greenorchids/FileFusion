import pytest
from core.converter import FileConverter
from core.system import FileConversionSystem

class DummyConverter(FileConverter):
    def convert(self, input_file: str, output_file: str) -> None:
        pass

def test_register_converter():
    system = FileConversionSystem()
    system.register_converter("dummy", DummyConverter)
    assert "dummy" in system._converters

def test_register_invalid_converter():
    system = FileConversionSystem()
    class InvalidConverter:
        pass
    with pytest.raises(TypeError):
        system.register_converter("invalid", InvalidConverter)

def test_convert_unregistered():
    system = FileConversionSystem()
    with pytest.raises(ValueError):
        system.convert("missing", "in.txt", "out.txt")

def test_convert_success():
    system = FileConversionSystem()
    class MockConverter(FileConverter):
        def __init__(self):
            self.called = False
        def convert(self, input_file: str, output_file: str) -> None:
            self.called = True
            assert input_file == "in.txt"
            assert output_file == "out.txt"

    # We need to mock instance creation since register_converter takes a type
    # and instantiates it.
    # Let's create a global flag or class variable for simplicity in testing
    MockConverter.called_class_var = False
    class TrackingConverter(FileConverter):
        def convert(self, input_file: str, output_file: str) -> None:
            TrackingConverter.called_class_var = True
            assert input_file == "in.txt"
            assert output_file == "out.txt"

    system.register_converter("tracking", TrackingConverter)
    system.convert("tracking", "in.txt", "out.txt")
    assert TrackingConverter.called_class_var
