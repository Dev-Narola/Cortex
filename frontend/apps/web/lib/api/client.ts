/**
 * API Client — module entrypoint (`@/lib/api/client`).
 *
 * **F2 Part 3 (Task 22).** Standard path for acquiring the `ApiClient`
 * singleton wired to auth token injection and 401 refresh handling.
 */

export { getApiClient, resetApiClient } from "@/lib/auth/api-client"
export { ApiClient, ApiError } from "@cortex/api-client"
