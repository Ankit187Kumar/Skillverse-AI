/**
 * Thin fetch wrapper. All calls go to same-origin /api/*, which Next.js proxies to FastAPI.
 * The session lives in an httpOnly cookie; the custom header satisfies the backend's CSRF check.
 */

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  get isAIUnavailable() {
    return this.code === "ai_unavailable";
  }
}

type Options = Omit<RequestInit, "body"> & { body?: unknown };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const { body, headers, ...rest } = opts;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...rest,
      headers: {
        "X-SkillVerse-Client": "web",
        ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and that the backend is running.", 0);
  }

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = data as { detail?: unknown; code?: string } | null;
    let message = typeof d?.detail === "string" ? d.detail : "";
    if (!message) {
      message =
        res.status >= 500
          ? "The server had a problem. Please try again."
          : res.status === 429
            ? "Too many requests. Please wait a moment."
            : "Something went wrong.";
    }
    throw new ApiError(message, res.status, d?.code);
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
