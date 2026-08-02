"""
MCP Prompt Registry for managing reusable prompt templates.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.shared.exceptions import NotFoundException, ValidationException


@dataclass(frozen=True, slots=True)
class MCPPromptArgument:
    name: str
    description: str
    required: bool = True


@dataclass(frozen=True, slots=True)
class MCPPromptDefinition:
    name: str
    description: str
    arguments: tuple[MCPPromptArgument, ...] = ()
    template: str = ""


class PromptRegistry:
    """Registry maintaining reusable prompt templates for external MCP clients."""

    def __init__(self) -> None:
        self._prompts: dict[str, MCPPromptDefinition] = {}
        self._register_default_prompts()

    def _register_default_prompts(self) -> None:
        self.register(
            MCPPromptDefinition(
                name="summarize_document",
                description="Summarize a document using Knowledge RAG and key takeaways",
                arguments=(
                    MCPPromptArgument(name="document_title", description="Title of document to summarize"),
                ),
                template="Summarize the core technical decisions and key points for document '{document_title}'.",
            )
        )
        self.register(
            MCPPromptDefinition(
                name="explain_architecture",
                description="Explain system architecture using Knowledge Graph facts and RAG chunks",
                arguments=(
                    MCPPromptArgument(name="component", description="Component or subsystem name"),
                ),
                template="Analyze the system architecture of component '{component}', listing dependencies and interfaces.",
            )
        )
        self.register(
            MCPPromptDefinition(
                name="generate_meeting_notes",
                description="Format unstructured text into structured meeting notes and action items",
                arguments=(
                    MCPPromptArgument(name="raw_notes", description="Raw meeting transcription or notes"),
                ),
                template="Extract action items, decisions, and key discussion points from: {raw_notes}",
            )
        )
        self.register(
            MCPPromptDefinition(
                name="review_code",
                description="Review code diff against enterprise security and clean code guidelines",
                arguments=(
                    MCPPromptArgument(name="code_snippet", description="Code snippet or diff"),
                ),
                template="Perform a code review focusing on security, performance, and maintainability for:\n{code_snippet}",
            )
        )

    def register(self, prompt: MCPPromptDefinition) -> None:
        self._prompts[prompt.name] = prompt

    def get(self, name: str) -> MCPPromptDefinition:
        if name not in self._prompts:
            raise NotFoundException(message=f"Prompt '{name}' not found", code=404)
        return self._prompts[name]

    def list_prompts(self) -> list[dict[str, Any]]:
        out = []
        for p in self._prompts.values():
            out.append(
                {
                    "name": p.name,
                    "description": p.description,
                    "arguments": [
                        {"name": a.name, "description": a.description, "required": a.required}
                        for a in p.arguments
                    ],
                }
            )
        return out

    def render(self, name: str, arguments: dict[str, str]) -> dict[str, Any]:
        p = self.get(name)
        for arg in p.arguments:
            if arg.required and arg.name not in arguments:
                raise ValidationException(message=f"Missing required argument '{arg.name}' for prompt '{name}'", code=400)

        rendered_text = p.template.format(**arguments)
        return {
            "description": p.description,
            "messages": [
                {
                    "role": "user",
                    "content": {
                        "type": "text",
                        "text": rendered_text,
                    },
                }
            ],
        }


__all__ = ["MCPPromptArgument", "MCPPromptDefinition", "PromptRegistry"]
