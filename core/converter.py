import abc

class FileConverter(abc.ABC):
    """Abstract base class for all file converters."""

    @abc.abstractmethod
    def convert(self, input_file: str, output_file: str) -> None:
        """Converts the input file to the output file format."""
        pass
