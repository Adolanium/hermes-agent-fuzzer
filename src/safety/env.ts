const CREDENTIAL_SUFFIXES = [
  '_API_KEY',
  '_TOKEN',
  '_SECRET',
  '_PASSWORD',
  '_CREDENTIALS',
  '_ACCESS_KEY',
  '_PRIVATE_KEY',
  '_OAUTH_TOKEN',
] as const

const CREDENTIAL_NAMES = new Set([
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'CUSTOM_API_KEY',
  'GEMINI_BASE_URL',
  'OPENAI_BASE_URL',
  'OPENROUTER_BASE_URL',
  'OLLAMA_BASE_URL',
  'GROQ_BASE_URL',
  'XAI_BASE_URL',
])

const STRIP_ALWAYS = new Set([
  'HERMES_DESKTOP_DEV_SERVER',
  'HERMES_HOME',
  'HERMES_DESKTOP_USER_DATA_DIR',
  'HERMES_DESKTOP_APP_NAME',
  'HERMES_DESKTOP_REMOTE_URL',
  'HERMES_DESKTOP_REMOTE_TOKEN',
])

export function isCredentialEnvVar(name: string): boolean {
  if (CREDENTIAL_NAMES.has(name) || STRIP_ALWAYS.has(name)) {
    return true
  }
  return CREDENTIAL_SUFFIXES.some((suffix) => name.endsWith(suffix))
}

export function stripCredentials(env: Record<string, string | undefined>): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (!value) {
      continue
    }
    if (isCredentialEnvVar(key)) {
      continue
    }
    clean[key] = value
  }
  return clean
}
