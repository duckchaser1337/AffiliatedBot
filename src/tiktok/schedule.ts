// O GitHub Actions roda em UTC; os horários do kit são no fuso da marca.
export function localDateTime(now: Date, timeZone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function toMinutes(slot: string): number {
  const [hours, minutes] = slot.split(":").map(Number);
  return hours * 60 + minutes;
}

// O horário mais recente que já passou hoje (ex: "2026-10-19 13:00"); antes do primeiro, nenhum.
// Horário perdido não acumula: se o bot ficou parado, ele atende só o último.
export function currentSlot(now: Date, slots: readonly string[], timeZone: string): string | undefined {
  const { date, minutes } = localDateTime(now, timeZone);
  const latest = slots
    .filter((slot) => toMinutes(slot) <= minutes)
    .sort((a, b) => toMinutes(a) - toMinutes(b))
    .at(-1);
  return latest ? `${date} ${latest}` : undefined;
}
