/**
 * Cortex MCP JavaScript/TypeScript SDK Client
 */

class CortexClient {
  constructor(endpointUrl, apiKey) {
    this.endpointUrl = endpointUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.requestId = 0;
  }

  async _sendRpc(method, params = {}) {
    this.requestId++;
    const payload = {
      jsonrpc: "2.0",
      id: this.requestId,
      method: method,
      params: params,
    };

    const response = await fetch(this.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 204) return {};
    const data = await response.json();
    if (data.error) {
      throw new Error(`MCP Error [${data.error.code}]: ${data.error.message}`);
    }
    return data.result || {};
  }

  async ping() {
    return this._sendRpc("ping");
  }

  async listTools() {
    const res = await this._sendRpc("tools/list");
    return res.tools || [];
  }

  async callTool(name, argumentsObj) {
    return this._sendRpc("tools/call", { name, arguments: argumentsObj });
  }

  async listResources() {
    const res = await this._sendRpc("resources/list");
    return res.resources || [];
  }

  async readResource(uri) {
    const res = await this._sendRpc("resources/read", { uri });
    return (res.contents && res.contents[0]) || {};
  }

  async listPrompts() {
    const res = await this._sendRpc("prompts/list");
    return res.prompts || [];
  }

  async getPrompt(name, argumentsObj) {
    return this._sendRpc("prompts/get", { name, arguments: argumentsObj });
  }
}

module.exports = { CortexClient };
