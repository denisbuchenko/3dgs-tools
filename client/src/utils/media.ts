import { apiOrigin } from "../api/client";

export function mediaUrl(url: string) {
  return `${apiOrigin}${url}`;
}
