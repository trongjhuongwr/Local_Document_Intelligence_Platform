"""Registry for versioned prompt templates stored as ``{name}_v{N}.txt`` files."""

from functools import lru_cache
from pathlib import Path
from string import Formatter

from pydantic import BaseModel

_PROMPTS_DIR = Path(__file__).resolve().parent


class RenderedPrompt(BaseModel):
    """A prompt template rendered with concrete variable values."""

    name: str
    version: int
    text: str


@lru_cache(maxsize=None)
def _load_template(prompts_dir: Path, name: str, version: int) -> str:
    path = prompts_dir / f"{name}_v{version}.txt"
    if not path.is_file():
        available = sorted(p.stem for p in prompts_dir.glob("*_v*.txt"))
        listing = ", ".join(available) if available else "(none)"
        raise FileNotFoundError(
            f"Prompt template '{name}' version {version} not found at {path.name}. "
            f"Available prompts: {listing}"
        )
    return path.read_text(encoding="utf-8")


@lru_cache(maxsize=None)
def _template_placeholders(template: str) -> frozenset[str]:
    return frozenset(
        field_name
        for _, field_name, _, _ in Formatter().parse(template)
        if field_name is not None
    )


class PromptRegistry:
    """Loads prompt templates from disk (cached) and renders their placeholders.

    Templates live next to this module as ``{name}_v{N}.txt`` and use
    ``{placeholder}`` slots. Rendering validates that the supplied variables
    match the template's placeholders exactly.
    """

    def __init__(self, prompts_dir: Path | None = None) -> None:
        self._prompts_dir = prompts_dir or _PROMPTS_DIR

    def available_prompts(self) -> list[str]:
        """Return the stems of all prompt template files, e.g. ``summarization_v1``."""
        return sorted(p.stem for p in self._prompts_dir.glob("*_v*.txt"))

    def render(self, name: str, version: int, **variables: object) -> RenderedPrompt:
        """Render prompt ``name`` at ``version`` with the given variables.

        Raises FileNotFoundError if the template file does not exist and
        ValueError if variables are missing or unexpected.
        """
        template = _load_template(self._prompts_dir, name, version)
        placeholders = _template_placeholders(template)
        missing = placeholders - variables.keys()
        extra = variables.keys() - placeholders
        if missing:
            raise ValueError(
                f"Prompt '{name}' v{version} is missing variables: {sorted(missing)}"
            )
        if extra:
            raise ValueError(
                f"Prompt '{name}' v{version} received unexpected variables: {sorted(extra)}"
            )
        return RenderedPrompt(name=name, version=version, text=template.format(**variables))
