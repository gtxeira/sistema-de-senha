export function convertToBrazilTimeString(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);

  const now = new Date();
  const dateUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes));

  // Formata para o fuso do Brasil (America/Sao_Paulo)
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dateUtc);
}