// Where the signed-in user's Firebase tokens live on disk.
//
// Previously this was a plain JSON file with mode 0600. That protects against
// other user accounts on the machine but not against anything running as the
// user, and a refresh token is long-lived. It is now encrypted with Electron's
// safeStorage, which is backed by the OS keystore: Keychain on macOS, DPAPI on
// Windows, libsecret/kwallet on Linux.
//
// The one case where we cannot encrypt is a Linux box with no keyring service
// available. Refusing to sign in there would be worse than the old behaviour,
// so we fall back to the previous 0600 file and say so once in the log.
import { app, safeStorage } from "electron";
import * as fs from "fs";
import * as path from "path";

const ENCRYPTED_FILE = "llmeter-auth.enc";
const LEGACY_PLAINTEXT_FILE = "llmeter-auth.json";

let warnedAboutFallback = false;

function encryptedPath(): string {
  return path.join(app.getPath("userData"), ENCRYPTED_FILE);
}

function legacyPath(): string {
  return path.join(app.getPath("userData"), LEGACY_PLAINTEXT_FILE);
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function warnFallback(): void {
  if (warnedAboutFallback) return;
  warnedAboutFallback = true;
  console.warn(
    "[auth] OS keystore unavailable; storing tokens in a 0600 file instead. " +
      "Install a keyring service (gnome-keyring / kwallet) to enable encryption."
  );
}

/** Read whatever is on disk, migrating a legacy plaintext file if found. */
function load(): AuthTokens | null {
  // Preferred: encrypted blob.
  try {
    const blob = fs.readFileSync(encryptedPath());
    const json = canEncrypt() ? safeStorage.decryptString(blob) : blob.toString("utf8");
    return JSON.parse(json) as AuthTokens;
  } catch {
    /* fall through to the legacy file */
  }

  // Migration path: an old plaintext file from before this module existed.
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyPath(), "utf8")) as AuthTokens;
    save(legacy);
    try {
      fs.unlinkSync(legacyPath());
    } catch {
      /* best effort */
    }
    return legacy;
  } catch {
    return null;
  }
}

function save(tokens: AuthTokens): AuthTokens {
  const json = JSON.stringify(tokens);
  if (canEncrypt()) {
    fs.writeFileSync(encryptedPath(), safeStorage.encryptString(json), { mode: 0o600 });
  } else {
    warnFallback();
    fs.writeFileSync(encryptedPath(), json, { mode: 0o600 });
  }
  return tokens;
}

function clear(): void {
  for (const p of [encryptedPath(), legacyPath()]) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* already gone */
    }
  }
}

export { load, save, clear };
