// Central API client. The browser talks to the FastAPI backend directly via
// NEXT_PUBLIC_API_BASE_URL. No secrets are ever exposed to the client — all AI
// and GitHub calls happen server-side in the backend.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  // machine-readable reason when the backend sends {detail: {code, message}}
  code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    let code: string | null = null;
    try {
      const body = await res.json();
      if (body.detail && typeof body.detail === "object" && !Array.isArray(body.detail)) {
        detail = body.detail.message || JSON.stringify(body.detail);
        code = body.detail.code ?? null;
      } else {
        detail = body.detail || JSON.stringify(body);
        if (body.ai_unavailable) code = "ai_unavailable";
      }
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail, code);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  // multipart upload (no JSON content-type)
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: form });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        detail = (await res.json()).detail || detail;
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, detail);
    }
    return res.json() as Promise<T>;
  },
};
