/**
 * Auth store — Zustand-backed.
 *
 * V9 Frontend: the access token lives in **memory only** (Zustand
 * state, never localStorage, never sessionStorage except as a
 * bridge for the first paint). The refresh token is set as an
 * httpOnly cookie by the backend; we never touch it from JS.
 *
 * On a 401 the `ApiClient` calls `refresh()` automatically
 * (wired in the providers); on success the new access token
 * replaces the in-memory one. On failure the user is bounced
 * to `/login` with a `next=` query param.
 */

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { apiConfig } from "@cortex/config";

export interface AuthUser {
  id: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  tenantId: string;
}

interface AuthState {
  user: AuthUser | null;
  // The access token is mirrored in sessionStorage ONLY so a
  // hard refresh can rehydrate it without a silent re-fetch.
  // sessionStorage is cleared on tab close — better than
  // localStorage for an XSS-prone surface like a token.
  accessToken: string | null;
  setSession: (input: { user: AuthUser; accessToken: string }) => void;
  setAccessToken: (token: string | null) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setSession: ({ user, accessToken }) =>
        set({ user, accessToken }),
      setAccessToken: (token) => set({ accessToken: token }),
      signOut: () => {
        // Best-effort: tell the backend to invalidate the
        // refresh-token cookie. Failures are silently swallowed
        // — the local sign-out proceeds regardless.
        if (typeof window !== "undefined") {
          fetch(`${apiConfig.baseUrl}/api/v1/auth/logout`, {
            method: "POST",
            credentials: "include",
          }).catch(() => {});
        }
        set({ user: null, accessToken: null });
      },
    }),
    {
      name: "cortex.auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
      }),
    },
  ),
);
