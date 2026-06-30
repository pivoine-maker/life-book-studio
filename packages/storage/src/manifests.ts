import { createHash } from "node:crypto";

export function sha256OfBytes(bytes: Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(bytes);
  return hash.digest("hex");
}
