"""
Example External Python AI Agent consuming Cortex via MCP.
"""

from __future__ import annotations

import os
import sys

# Ensure SDK is in path for example
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../sdk/python")))

from cortex_mcp import CortexMCPClient


def main():
    endpoint = os.getenv("CORTEX_MCP_URL", "http://localhost:8000/api/v1/mcp")
    api_key = os.getenv("CORTEX_API_KEY", "ctx_example_key")

    print(f"Connecting external agent to Cortex MCP at {endpoint}...")
    client = CortexMCPClient(endpoint_url=endpoint, api_key=api_key)

    # 1. Discover tools
    print("\n--- Discovering Tools ---")
    tools = client.list_tools()
    for tool in tools:
        print(f"Tool: {tool['name']} - {tool['description']}")

    # 2. Discover resources
    print("\n--- Discovering Resources ---")
    resources = client.list_resources()
    for res in resources:
        print(f"Resource: {res['uri']} - {res['name']}")

    # 3. Discover prompts
    print("\n--- Discovering Prompts ---")
    prompts = client.list_prompts()
    for prompt in prompts:
        print(f"Prompt: {prompt['name']} - {prompt['description']}")


if __name__ == "__main__":
    main()
