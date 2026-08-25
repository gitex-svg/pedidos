import type { Request, Response } from "express";

export function toWebHeaders(req: Request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

export function forwardAuthCookies(response: globalThis.Response, res: Response) {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = getSetCookie?.call(response.headers) ?? [];
  if (cookies.length) res.setHeader("set-cookie", cookies);
  else {
    const cookie = response.headers.get("set-cookie");
    if (cookie) res.setHeader("set-cookie", cookie);
  }
}
