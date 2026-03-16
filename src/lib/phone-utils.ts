/**
 * Normalize phone to digits only
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Detect phone type from digits
 */
export function detectPhoneType(digits: string): "celular" | "fixo" | "0800" | "outro" {
  if (digits.startsWith("0800") || digits.startsWith("0300") || digits.startsWith("0500")) return "0800";
  // After optional DDD (2 digits), celular starts with 9 and has 9 digits
  if (digits.length === 11 && digits[2] === "9") return "celular";
  if (digits.length === 10) return "fixo";
  if (digits.length === 9 && digits[0] === "9") return "celular";
  if (digits.length === 8) return "fixo";
  return "outro";
}

/**
 * Apply phone mask based on detected type
 */
export function applyPhoneMask(value: string): string {
  const digits = normalizePhone(value);

  // 0800 / 0300 / 0500 — format: 0800 000 0000
  if (digits.startsWith("0800") || digits.startsWith("0300") || digits.startsWith("0500")) {
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
  }

  // Celular com DDD: (00) 00000-0000
  if (digits.length <= 2) return digits.length > 0 ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }
  // Fixo com DDD: (00) 0000-0000
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  // Partial
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 11)}`;
}

/**
 * Validate phone number digits length
 */
export function isValidPhone(digits: string): boolean {
  if (digits.startsWith("0800") || digits.startsWith("0300") || digits.startsWith("0500")) {
    return digits.length >= 10 && digits.length <= 11;
  }
  // With DDD: 10 (fixo) or 11 (celular)
  return digits.length === 10 || digits.length === 11;
}

/**
 * Get max digit length for input limiting
 */
export function getMaxPhoneDigits(digits: string): number {
  if (digits.startsWith("0800") || digits.startsWith("0300") || digits.startsWith("0500")) return 11;
  return 11;
}

/**
 * Get phone type label
 */
export function getPhoneTypeLabel(digits: string): string {
  const type = detectPhoneType(digits);
  switch (type) {
    case "celular": return "Celular";
    case "fixo": return "Fixo";
    case "0800": return "0800/Especial";
    default: return "Telefone";
  }
}
